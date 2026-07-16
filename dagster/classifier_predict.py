"""
Barebones transaction classifier prediction asset.

Uses the trained model to predict categories for uncategorized transactions.
"""

from dagster import asset, AssetExecutionContext, AssetKey
import pandas as pd
from sqlalchemy import text
import joblib
from pathlib import Path
from scipy.sparse import hstack, csr_matrix
from datetime import datetime

from common import NUMERICAL_FEATURES, TEXT_FEATURE, get_engine, load_config


@asset(
    description="Predict categories for uncategorized transactions using the trained model",
    # Depend on the dbt model so predictions never run against a stale
    # fct_trxns_uncategorized (e.g. before newly-validated rows are excluded).
    deps=[AssetKey(["fct_trxns_uncategorized"])],
)
def predict_transaction_categories(context: AssetExecutionContext, load_to_postgres, train_transaction_classifier):
    """
    Predict categories for uncategorized transactions.
    
    Loads the latest trained model and predicts categories for transactions
    in fct_trxns_uncategorized.
    """
    engine = get_engine()
    
    # Load latest active model from registry
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT model_version, file_path, status
            FROM analytics.model_registry
            WHERE is_active = TRUE AND status = 'trained'
            ORDER BY training_timestamp DESC
            LIMIT 1
        """))
        row = result.fetchone()
        
        if row is None:
            # Fallback: try to find latest model (even if not marked active)
            context.log.warning("No active model found, trying latest trained model")
            result = conn.execute(text("""
                SELECT model_version, file_path, status
                FROM analytics.model_registry
                WHERE status = 'trained' AND file_path IS NOT NULL
                ORDER BY training_timestamp DESC
                LIMIT 1
            """))
            row = result.fetchone()
        
        if row is None:
            # Final fallback: try old file-based path
            model_path = Path("/opt/dagster/app/models/transaction_classifier_latest.pkl")
            if not model_path.exists():
                raise FileNotFoundError(
                    "No model found in registry or at default path. Train the model first."
                )
            context.log.warning(f"Using fallback model path: {model_path}")
            model_version = "unknown"
            pipeline = joblib.load(model_path)
            # Extract version from pipeline if available
            model_version = pipeline.get('model_version', 'unknown')
        else:
            model_version, file_path, status = row
            if status != 'trained':
                raise ValueError(f"Model {model_version} is not trained (status: {status}). Train the model first.")
            
            if file_path is None:
                raise ValueError(f"Model {model_version} has no file path. Train the model first.")
            
            model_path = Path(file_path)
            if not model_path.exists():
                raise FileNotFoundError(
                    f"Model file not found at {file_path} for version {model_version}. "
                    "The file may have been moved or deleted."
                )
            
            pipeline = joblib.load(model_path)
            context.log.info(f"Loaded model from registry (version: {model_version}, path: {file_path})")
    
    text_vectorizer = pipeline['text_vectorizer']
    numerical_scaler = pipeline['numerical_scaler']
    classifier = pipeline['classifier']
    
    context.log.info(f"Model loaded successfully (version: {model_version})")
    
    # Read uncategorized transactions
    query = text("SELECT * FROM analytics.fct_trxns_uncategorized")
    df = pd.read_sql(query, engine)
    
    if len(df) == 0:
        context.log.info("No uncategorized transactions to predict")
        return {"n_predictions": 0}
    
    context.log.info(f"Predicting categories for {len(df)} transactions")
    
    # Filter out rows with null amounts
    df = df[df['amount'].notna()].copy()
    
    if len(df) == 0:
        context.log.info("No transactions with valid amounts to predict")
        return {"n_predictions": 0}
    
    # Prepare features - fill NaN values
    X_text = df[TEXT_FEATURE].fillna('').values
    X_numerical = df[NUMERICAL_FEATURES].fillna(0).values
    
    # Transform features
    X_text_vec = text_vectorizer.transform(X_text)
    X_numerical_scaled = numerical_scaler.transform(X_numerical)
    X_numerical_sparse = csr_matrix(X_numerical_scaled)
    
    X = hstack([X_text_vec, X_numerical_sparse])
    
    # Predict
    predictions = classifier.predict(X)
    prediction_probas = classifier.predict_proba(X)
    max_probas = prediction_probas.max(axis=1)
    
    # Load confidence threshold from config
    config = load_config()
    confidence_threshold = config['model']['confidence_threshold']
    context.log.info(f"Using confidence threshold: {confidence_threshold}")
    
    # Apply confidence threshold (predictions below this threshold are marked as 'UNCERTAIN')
    high_confidence_mask = max_probas >= confidence_threshold
    
    # Add predictions to dataframe
    df['predicted_master_category'] = predictions
    df.loc[~high_confidence_mask, 'predicted_master_category'] = 'UNCERTAIN'
    df['prediction_confidence'] = max_probas
    
    # Log statistics
    n_high_confidence = high_confidence_mask.sum()
    n_uncertain = (~high_confidence_mask).sum()
    context.log.info(f"High confidence predictions: {n_high_confidence} ({n_high_confidence/len(df)*100:.1f}%)")
    context.log.info(f"Uncertain predictions: {n_uncertain} ({n_uncertain/len(df)*100:.1f}%)")
    
    # Add prediction timestamp and model version
    df['prediction_timestamp'] = datetime.now()
    df['model_version'] = model_version
    
    
    # Save predictions to database as an upsert: delete any prior prediction rows
    # for the transactions we're re-predicting, then insert the fresh ones. This
    # keeps exactly one row per transaction_id instead of appending forever (the
    # table previously grew unbounded on every run).
    prediction_ids = df['transaction_id'].dropna().tolist()
    with engine.begin() as conn:
        if prediction_ids:
            conn.execute(
                text(
                    "DELETE FROM analytics.predicted_transactions "
                    "WHERE transaction_id = ANY(:ids)"
                ),
                {"ids": prediction_ids},
            )
        df.to_sql(
            'predicted_transactions',
            conn,
            schema='analytics',
            if_exists='append',
            index=False,
            method='multi',
        )
    
    context.log.info(f"Saved {len(df)} predictions to analytics.predicted_transactions")
    context.log.info(f"Sample predictions:\n{df[['description', 'predicted_master_category', 'prediction_confidence']].head(10)}")
    
    engine.dispose()
    
    return {
        "n_predictions": len(df),
        "n_high_confidence": int(n_high_confidence),
        "n_uncertain": int(n_uncertain),
        "categories_predicted": df['predicted_master_category'].value_counts().to_dict()
    }
