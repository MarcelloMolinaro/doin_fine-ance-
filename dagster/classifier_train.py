"""
Transaction classifier training asset.

Trains a machine learning model to categorize financial transactions based on
merchant name, description, amount, and other features.
"""

from dagster import asset, AssetExecutionContext, AssetKey
import pandas as pd
from sqlalchemy import create_engine, text
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    confusion_matrix,
    classification_report
)
from sklearn.calibration import calibration_curve
import joblib
import os
import yaml
from datetime import datetime
import json
from pathlib import Path
from scipy.sparse import hstack, csr_matrix


def create_model_storage_path():
    """Create directory for storing model artifacts."""
    storage_path = Path("/opt/dagster/app/models")
    storage_path.mkdir(exist_ok=True)
    return storage_path


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
    description="Train a classifier model to categorize transactions based on historical data",
    deps=[AssetKey(["fct_validated_trxns"])]
)
def train_transaction_classifier(context: AssetExecutionContext):
    """
    Train a transaction classifier model.
    
    Reads validated transactions from dbt (user-validated and historic validated),
    performs feature engineering, trains a classifier, evaluates it,
    and saves the model artifact.
    """
    engine = create_engine('postgresql+psycopg2://dagster:dagster@postgres:5432/dagster')
    
    # Read validated transactions for training, filter out rows with null amounts
    query_categorized = text("SELECT * FROM analytics.fct_validated_trxns")
    df_train = pd.read_sql(query_categorized, engine)
    df_train = df_train[df_train['amount'].notna()].copy()
    
    # Filter out transactions before 2022
    df_train['transacted_date'] = pd.to_datetime(df_train['transacted_date'])
    initial_count = len(df_train)
    df_train = df_train[df_train['transacted_date'] >= '2022-01-01'].copy()
    filtered_old = initial_count - len(df_train)
    
    if filtered_old > 0:
        context.log.info(f"Filtered out {filtered_old} transactions before 2022")
    
    # Filter Lodging: only keep if description contains specific keywords
    lodging_mask = (
        df_train['master_category'] == 'Lodging'
    ) & (
        ~df_train['description'].fillna('').str.lower().str.contains(
            'airbnb|hipcamp|hotel|booking', case=False, na=False, regex=True
        )
    )

    # Exclude Lodging transactions that don't match keywords
    df_train = df_train[~lodging_mask].copy()

    context.log.info(f"Filtered out {lodging_mask.sum()} Lodging transactions without keywords")
    context.log.info(f"Training transactions: {len(df_train)}")
    
    if len(df_train) < 100:
        raise ValueError(f"Not enough training data: {len(df_train)} transactions. Need at least 100.")
    
    # Feature engineering
    # Combine description and account_name for text features
    df_train['combined_text'] = (
        df_train['description'].fillna('').astype(str) + ' ' +
        df_train['account_name'].fillna('').astype(str) + ' ' +
        df_train.get('institution_name', '').fillna('').astype(str)
    )
    
    # Transaction date features (transacted_date already parsed above)
    df_train['day_of_week'] = df_train['transacted_date'].dt.dayofweek  # 0=Monday, 6=Sunday
    df_train['month'] = df_train['transacted_date'].dt.month  # 1-12
    df_train['day_of_month'] = df_train['transacted_date'].dt.day  # 1-31
    
    # Amount derived features
    df_train['is_negative'] = (df_train['amount'] < 0).astype(int)
    df_train['amount_abs'] = df_train['amount'].abs()
    
    # Transaction pattern features - amount buckets
    df_train['amount_bucket'] = pd.cut(
        df_train['amount_abs'],
        bins=[0, 10, 50, 100, 500, float('inf')],
        labels=[0, 1, 2, 3, 4]  # micro, small, medium, large, huge
    )
    df_train['amount_bucket'] = df_train['amount_bucket'].fillna(0).astype(int)  # Fill NaN with micro bucket (0) as default
    
    # Keyword features for high-precision categories
    desc_lower = df_train['description'].fillna('').str.lower()
    df_train['has_hotel_keyword'] = desc_lower.str.contains(
        'hotel|airbnb|inn|resort|motel|hipcamp|booking', case=False, na=False
    ).astype(int)
    df_train['has_gas_keyword'] = desc_lower.str.contains(
        'shell|chevron|exxon|bp|mobil|gas|fuel|76|arco', case=False, na=False
    ).astype(int)
    df_train['has_grocery_keyword'] = desc_lower.str.contains(
        'safeway|costco|trader|whole foods|kroger|grocery|market|albertsons|bowlberkeley', case=False, na=False
    ).astype(int)
    df_train['has_restaurant_keyword'] = desc_lower.str.contains(
        'restaurant|cafe|coffee|starbucks|mcdonald|burger|pizza|chipotle|dining', case=False, na=False
    ).astype(int)
    df_train['has_transport_keyword'] = desc_lower.str.contains(
        'uber|lyft|taxi|bart|metro|transit|parking|toll', case=False, na=False
    ).astype(int)
    df_train['has_shop_keyword'] = desc_lower.str.contains(
        'amazon|target|walmart|ebay|etsy|shop|store', case=False, na=False
    ).astype(int)
    df_train['has_flight_keyword'] = desc_lower.str.contains(
        'airline|united|delta|american|southwest|jetblue|alaska|spirit|frontier|airlines|flight', case=False, na=False
    ).astype(int)
    df_train['has_credit_fee_keyword'] = desc_lower.str.contains(
        'annual|membership|fee', case=False, na=False
    ).astype(int)
    df_train['has_interest_keyword'] = desc_lower.str.contains(
        'interest', case=False, na=False
    ).astype(int)
    
    # Prepare features and target
    X_text = df_train['combined_text'].values
    X_numerical = df_train[[
        'amount', 'is_negative', 
        'day_of_week', 'day_of_month',
        'amount_bucket',
        'has_hotel_keyword', 'has_gas_keyword', 'has_grocery_keyword',
        'has_restaurant_keyword', 'has_transport_keyword', 'has_shop_keyword',
        'has_flight_keyword', 'has_credit_fee_keyword', 'has_interest_keyword'
    ]].values
    y = df_train['master_category'].values
    
    context.log.info(f"Number of categories: {len(np.unique(y))}")
    context.log.info(f"Category distribution:\n{df_train['master_category'].value_counts()}")
    
    # Split data: 80% train, 20% test (stratified)
    X_train_text, X_test_text, X_train_numerical, X_test_numerical, y_train, y_test = train_test_split(
        X_text, X_numerical, y,
        test_size=0.2,
        random_state=42,
        stratify=y  # Stratified to handle imbalanced classes
    )
    
    context.log.info(f"Train set size: {len(X_train_text)}")
    context.log.info(f"Test set size: {len(X_test_text)}")
    
    # Feature engineering: TF-IDF for text, StandardScaler for numerical features
    text_vectorizer = TfidfVectorizer(
        max_features=1000,  # Increased from 500 to capture more text patterns
        ngram_range=(1, 2),  # Include unigrams and bigrams
        min_df=2,  # Ignore terms that appear in fewer than 2 documents
        max_df=0.95,  # Ignore terms that appear in more than 95% of documents
        stop_words='english'
    )
    
    numerical_scaler = StandardScaler()
    
    # Transform features
    X_train_text_vec = text_vectorizer.fit_transform(X_train_text)
    X_test_text_vec = text_vectorizer.transform(X_test_text)
    
    X_train_numerical_scaled = numerical_scaler.fit_transform(X_train_numerical)
    X_test_numerical_scaled = numerical_scaler.transform(X_test_numerical)
    
    # Combine features: concatenate text and numerical features
    # Convert dense numerical features to sparse format for hstack
    X_train_numerical_sparse = csr_matrix(X_train_numerical_scaled)
    X_test_numerical_sparse = csr_matrix(X_test_numerical_scaled)
    
    X_train = hstack([X_train_text_vec, X_train_numerical_sparse])
    X_test = hstack([X_test_text_vec, X_test_numerical_sparse])
    
    # Train classifier - using balanced class weights to improve recall
    # Using RandomForest for interpretability and handling of mixed features
    classifier = RandomForestClassifier(
        n_estimators=200,              # More trees for better stability
        max_depth=15,                  # Shallower for more conservative predictions
        min_samples_split=10,          # Higher threshold for splits
        min_samples_leaf=5,            # Require more evidence per leaf
        max_features='sqrt',           # Reduce overfitting
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'        # Balanced weights to handle imbalanced classes and improve recall
    )
    
    context.log.info("Training classifier...")
    classifier.fit(X_train, y_train)
    
    # Evaluate model
    y_pred = classifier.predict(X_test)
    y_pred_proba = classifier.predict_proba(X_test)
    
    accuracy = accuracy_score(y_test, y_pred)
    macro_f1 = f1_score(y_test, y_pred, average='macro')
    weighted_f1 = f1_score(y_test, y_pred, average='weighted')
    macro_precision = precision_score(y_test, y_pred, average='macro', zero_division=0)
    macro_recall = recall_score(y_test, y_pred, average='macro', zero_division=0)
    weighted_precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    weighted_recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    
    context.log.info(f"Test Accuracy: {accuracy:.4f}")
    context.log.info(f"Test Macro F1: {macro_f1:.4f}")
    context.log.info(f"Test Weighted F1: {weighted_f1:.4f}")
    context.log.info(f"Test Macro Precision: {macro_precision:.4f}")
    context.log.info(f"Test Macro Recall: {macro_recall:.4f}")
    context.log.info(f"Test Weighted Precision: {weighted_precision:.4f}")
    context.log.info(f"Test Weighted Recall: {weighted_recall:.4f}")
    
    # Confusion Matrix
    cm = confusion_matrix(y_test, y_pred)
    context.log.info(f"Confusion Matrix:\n{cm}")
    
    # Classification Report
    class_report = classification_report(y_test, y_pred)
    context.log.info(f"Classification Report:\n{class_report}")
    
    # Calibration Curve (for top categories)
    # Get top 5 categories by frequency
    top_categories = df_train['master_category'].value_counts().head(5).index.tolist()
    category_idx_map = {cat: idx for idx, cat in enumerate(classifier.classes_)}
    
    calibration_metrics = {}
    for category in top_categories:
        if category in category_idx_map:
            cat_idx = category_idx_map[category]
            y_true_binary = (y_test == category).astype(int)
            y_proba = y_pred_proba[:, cat_idx]
            
            if len(np.unique(y_true_binary)) > 1:  # Only if both classes present
                prob_true, prob_pred = calibration_curve(
                    y_true_binary, y_proba, n_bins=10, strategy='uniform'
                )
                calibration_metrics[category] = {
                    'prob_true': prob_true.tolist(),
                    'prob_pred': prob_pred.tolist()
                }
    
    # Prepare metrics summary
    metrics = {
        'model_version': datetime.now().isoformat(),
        'training_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'n_train_samples': len(X_train_text),
        'n_test_samples': len(X_test_text),
        'n_features': X_train.shape[1],
        'n_classes': len(np.unique(y)),
        'accuracy': float(accuracy),
        'macro_f1': float(macro_f1),
        'weighted_f1': float(weighted_f1),
        'macro_precision': float(macro_precision),
        'macro_recall': float(macro_recall),
        'weighted_precision': float(weighted_precision),
        'weighted_recall': float(weighted_recall),
        'categories': classifier.classes_.tolist(),
        'calibration_metrics': calibration_metrics
    }
    
    # Save model artifact
    model_storage = create_model_storage_path()
    model_version = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Save full pipeline (vectorizer, scaler, classifier)
    pipeline = {
        'text_vectorizer': text_vectorizer,
        'numerical_scaler': numerical_scaler,
        'classifier': classifier,
        'model_version': model_version,  # Store version in pipeline
        'feature_names': [
            'text_tfidf', 'amount', 'amount_abs', 'is_negative', 
            'day_of_week', 'month', 'day_of_month', 'amount_bucket',
            'has_hotel_keyword', 'has_gas_keyword', 'has_grocery_keyword',
            'has_restaurant_keyword', 'has_transport_keyword', 'has_shop_keyword',
            'has_flight_keyword', 'has_credit_fee_keyword', 'has_interest_keyword'
        ]
    }
    
    model_path = model_storage / f"transaction_classifier_{model_version}.pkl"
    joblib.dump(pipeline, model_path)
    
    # Save metrics
    metrics_path = model_storage / f"metrics_{model_version}.json"
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2)
    
    # Also save a "latest" symlink/reference
    latest_model_path = model_storage / "transaction_classifier_latest.pkl"
    latest_metrics_path = model_storage / "metrics_latest.json"
    
    if latest_model_path.exists():
        latest_model_path.unlink()
    if latest_metrics_path.exists():
        latest_metrics_path.unlink()
    
    # Copy to latest (since symlinks might not work in containers, just copy)
    import shutil
    shutil.copy(model_path, latest_model_path)
    shutil.copy(metrics_path, latest_metrics_path)
    
    context.log.info(f"Model saved to: {model_path}")
    context.log.info(f"Metrics saved to: {metrics_path}")
    
    engine.dispose()
    
    return {
        'model_path': str(model_path),
        'metrics': metrics,
        'n_training_samples': len(X_train_text),
        'n_test_samples': len(X_test_text),
        'accuracy': float(accuracy),
        'macro_f1': float(macro_f1)
    }
