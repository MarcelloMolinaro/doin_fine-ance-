"""
Shared helpers for Dagster assets.

Single source of truth for the database connection, config loading, and the
ML feature column list so that the training and prediction assets can never
drift out of sync.
"""

import os
from pathlib import Path

import yaml
from sqlalchemy import create_engine


def get_database_url() -> str:
    """Build the Postgres connection URL from env vars (with dev defaults)."""
    user = os.getenv("POSTGRES_USER", "dagster")
    password = os.getenv("POSTGRES_PASSWORD", "dagster")
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "dagster")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"


def get_engine():
    """Return a SQLAlchemy engine for the pipeline database."""
    return create_engine(get_database_url())


# Text feature fed to the TF-IDF vectorizer.
TEXT_FEATURE = "combined_text"

# Numerical/boolean feature columns used by BOTH training and prediction.
# This list MUST match the columns produced by int_trxns_features.sql. Keeping
# it in one place prevents the train/predict feature drift that previously
# required editing two files by hand.
NUMERICAL_FEATURES = [
    "amount",
    "is_negative",
    "day_of_week",
    "day_of_month",
    "amount_bucket",
    "has_hotel_keyword",
    "has_gas_keyword",
    "has_grocery_keyword",
    "has_restaurant_keyword",
    "has_transport_keyword",
    "has_shop_keyword",
    "has_flight_keyword",
    "has_credit_fee_keyword",
    "has_interest_keyword",
]

# Human-readable feature names stored in the model artifact metadata.
FEATURE_NAMES = ["text_tfidf"] + NUMERICAL_FEATURES

# Default confidence threshold when config.yaml is missing or incomplete.
DEFAULT_CONFIDENCE_THRESHOLD = 0.40

# Minimum validated transactions required before the classifier will train.
MIN_TRAINING_SAMPLES = 50


def load_config(config_paths=None) -> dict:
    """Load configuration from config.yaml, falling back to sane defaults.

    Args:
        config_paths: Optional iterable of candidate paths (used in tests). When
            omitted, the standard docker-compose mount locations are used.
    """
    possible_paths = config_paths or [
        Path("/opt/dagster/config.yaml"),  # Root directory (mounted in docker-compose)
        Path("/opt/dagster/app/config.yaml"),  # In dagster directory (fallback)
    ]

    config_path = next((p for p in possible_paths if p.exists()), None)

    if config_path is None:
        return {"model": {"confidence_threshold": DEFAULT_CONFIDENCE_THRESHOLD}}

    with open(config_path, "r") as f:
        config = yaml.safe_load(f) or {}

    config.setdefault("model", {})
    config["model"].setdefault("confidence_threshold", DEFAULT_CONFIDENCE_THRESHOLD)
    return config
