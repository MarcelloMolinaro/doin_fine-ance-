"""
Barebones transaction classifier prediction asset.

Uses the trained model to predict categories for uncategorized transactions.
"""

from dagster import asset, AssetExecutionContext
import pandas as pd
from sqlalchemy import create_engine, text
import joblib
from pathlib import Path
from scipy.sparse import hstack, csr_matrix


@asset(
    description="Predict categories for uncategorized transactions using the trained model"
)
def predict_transaction_categories(context: AssetExecutionContext, train_transaction_classifier):
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
    amount_scaler = pipeline['amount_scaler']
    classifier = pipeline['classifier']
    
    context.log.info("Model loaded successfully")
    
    # Read uncategorized transactions
    query = text("SELECT * FROM analytics.fct_trxns_uncategorized")
    df = pd.read_sql(query, engine)
    
    if len(df) == 0:
        context.log.info("No uncategorized transactions to predict")
        return {"n_predictions": 0}
    
    context.log.info(f"Predicting categories for {len(df)} transactions")
    
    # Prepare features (same as training)
    df['combined_text'] = (
        df['description'].fillna('').astype(str) + ' ' +
        df['account_name'].fillna('').astype(str) + ' ' +
        df.get('institution_name', '').fillna('').astype(str)
    )
    
    X_text = df['combined_text'].values
    X_amount = df[['amount']].values
    
    # Transform features
    X_text_vec = text_vectorizer.transform(X_text)
    X_amount_scaled = amount_scaler.transform(X_amount)
    X_amount_sparse = csr_matrix(X_amount_scaled)
    
    X = hstack([X_text_vec, X_amount_sparse])
    
    # Predict
    predictions = classifier.predict(X)
    prediction_probas = classifier.predict_proba(X)
    
    # Add predictions to dataframe
    df['predicted_master_category'] = predictions
    df['prediction_confidence'] = prediction_probas.max(axis=1)
    
    # Save predictions (or update database)
    # For now, just log a sample
    context.log.info(f"Sample predictions:\n{df[['description', 'predicted_master_category', 'prediction_confidence']].head(10)}")
    
    engine.dispose()
    
    return {
        "n_predictions": len(df),
        "categories_predicted": df['predicted_master_category'].value_counts().to_dict()
    }
