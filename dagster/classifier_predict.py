"""
Barebones transaction classifier prediction asset.

Uses the trained model to predict categories for uncategorized transactions.
"""

from dagster import asset, AssetExecutionContext
import pandas as pd
from sqlalchemy import create_engine, text
import joblib
import yaml
from pathlib import Path
from scipy.sparse import hstack, csr_matrix
from datetime import datetime


def load_config():
    """Load configuration from config.yaml file."""
    # Try multiple possible paths for config.yaml
    possible_paths = [
        Path("/opt/dagster/config.yaml"),  # Root directory (mounted in docker-compose)
        Path("/opt/dagster/app/config.yaml"),  # In dagster directory (fallback)
    ]
    
    config_path = None
    for path in possible_paths:
        if path.exists():
            config_path = path
            break
    
    if config_path is None:
        # Fallback to default values if config doesn't exist
        return {'model': {'confidence_threshold': 0.40}}
    
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # Ensure model section exists with defaults
    if 'model' not in config:
        config['model'] = {}
    if 'confidence_threshold' not in config['model']:
        config['model']['confidence_threshold'] = 0.40
    
    return config


@asset(
    description="Predict categories for uncategorized transactions using the trained model"
    
)
def predict_transaction_categories(context: AssetExecutionContext, load_to_postgres, train_transaction_classifier):
    """
    Predict categories for uncategorized transactions.
    
    Loads the latest trained model and predicts categories for transactions
    in fct_trxns_uncategorized.
    """
    engine = create_engine('postgresql+psycopg2://dagster:dagster@postgres:5432/dagster')
    
    # Load latest model
    model_path = Path("/opt/dagster/app/models/transaction_classifier_latest.pkl")
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found at {model_path}. Train the model first.")
    
    pipeline = joblib.load(model_path)
    text_vectorizer = pipeline['text_vectorizer']
    numerical_scaler = pipeline['numerical_scaler']
    classifier = pipeline['classifier']
    model_version = pipeline.get('model_version', 'unknown')  # Get version or default to 'unknown'
    
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
    X_text = df['combined_text'].fillna('').values
    X_numerical = df[[
        'amount', 'is_negative', 
        'day_of_week', 'day_of_month',
        'amount_bucket',
        'has_hotel_keyword', 'has_gas_keyword', 'has_grocery_keyword',
        'has_restaurant_keyword', 'has_transport_keyword', 'has_shop_keyword',
        'has_flight_keyword', 'has_credit_fee_keyword', 'has_interest_keyword'
    ]].fillna(0).values
    
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
    
    
    # Save predictions to database
    df.to_sql(
        'predicted_transactions',
        engine,
        schema='analytics',
        if_exists='append',  # Replace table each time (or use 'replace' to replace history)
        index=False,
        method='multi'
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
