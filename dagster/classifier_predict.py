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
from datetime import datetime


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
    
    # Prepare features (same as training)
    df['combined_text'] = (
        df['description'].fillna('').astype(str) + ' ' +
        df['account_name'].fillna('').astype(str) + ' ' +
        df.get('institution_name', '').fillna('').astype(str)
    )
    
    # Transaction date features
    df['transacted_date'] = pd.to_datetime(df['transacted_date'])
    df['day_of_week'] = df['transacted_date'].dt.dayofweek  # 0=Monday, 6=Sunday
    df['month'] = df['transacted_date'].dt.month  # 1-12
    df['day_of_month'] = df['transacted_date'].dt.day  # 1-31
    
    # Amount derived features
    df['is_negative'] = (df['amount'] < 0).astype(int)
    df['amount_abs'] = df['amount'].abs()
    
    # Transaction pattern features - amount buckets
    df['amount_bucket'] = pd.cut(
        df['amount_abs'],
        bins=[0, 10, 50, 100, 500, float('inf')],
        labels=[0, 1, 2, 3, 4]  # micro, small, medium, large, huge
    )
    df['amount_bucket'] = df['amount_bucket'].fillna(2).astype(int)  # Fill NaN with medium bucket
    
    # Keyword features for high-precision categories
    desc_lower = df['description'].fillna('').str.lower()
    df['has_hotel_keyword'] = desc_lower.str.contains(
        'hotel|airbnb|inn|resort|motel|hipcamp|booking', case=False, na=False
    ).astype(int)
    df['has_gas_keyword'] = desc_lower.str.contains(
        'shell|chevron|exxon|bp|mobil|gas|fuel|76|arco', case=False, na=False
    ).astype(int)
    df['has_grocery_keyword'] = desc_lower.str.contains(
        'safeway|costco|trader|whole foods|kroger|grocery|market|albertsons|bowlberkeley', case=False, na=False
    ).astype(int)
    df['has_restaurant_keyword'] = desc_lower.str.contains(
        'restaurant|cafe|coffee|starbucks|mcdonald|burger|pizza|chipotle|dining', case=False, na=False
    ).astype(int)
    df['has_transport_keyword'] = desc_lower.str.contains(
        'uber|lyft|taxi|bart|metro|transit|parking|toll', case=False, na=False
    ).astype(int)
    df['has_shop_keyword'] = desc_lower.str.contains(
        'amazon|target|walmart|ebay|etsy|shop|store', case=False, na=False
    ).astype(int)
    
    X_text = df['combined_text'].values
    X_numerical = df[[
        'amount', 'amount_abs', 'is_negative', 
        'day_of_week', 'month', 'day_of_month',
        'amount_bucket',
        'has_hotel_keyword', 'has_gas_keyword', 'has_grocery_keyword',
        'has_restaurant_keyword', 'has_transport_keyword', 'has_shop_keyword'
    ]].values
    
    # Transform features
    X_text_vec = text_vectorizer.transform(X_text)
    X_numerical_scaled = numerical_scaler.transform(X_numerical)
    X_numerical_sparse = csr_matrix(X_numerical_scaled)
    
    X = hstack([X_text_vec, X_numerical_sparse])
    
    # Predict
    predictions = classifier.predict(X)
    prediction_probas = classifier.predict_proba(X)
    max_probas = prediction_probas.max(axis=1)
    
    # Apply confidence threshold for high precision (only predict if >=45% confident)
    # Predictions below this threshold are marked as 'UNCERTAIN'
    confidence_threshold = 0.45
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
