"""Shared constants for the UI backend.

Single source of truth for values that were previously hardcoded (and drifting)
across multiple modules: Dagster job names, GraphQL connection details,
confidence thresholds, and the default category catalog.
"""
import os

# ---------------------------------------------------------------------------
# Dagster job names (must match the job names defined in dagster/repo.py)
# ---------------------------------------------------------------------------
JOB_INITIALIZATION = "1_dagster_init"
JOB_INGEST_AND_PREDICT = "2_ingest_and_predict"
JOB_REFRESH_VALIDATED_RETRAIN_REPREDICT = "4_refresh_validated_retrain_repredict"
JOB_FULL_REFRESH_VALIDATED_RETRAIN_REPREDICT = "5_full_refresh_validated_retrain_repredict"

# ---------------------------------------------------------------------------
# Dagster GraphQL connection
# ---------------------------------------------------------------------------
DAGSTER_URL = os.getenv("DAGSTER_URL", "http://dagster:3000")
DAGSTER_REPOSITORY_LOCATION_NAME = "repo.py"
DAGSTER_REPOSITORY_NAME = "__repository__"

# ---------------------------------------------------------------------------
# Prediction confidence
# ---------------------------------------------------------------------------
# Predictions between the pipeline's confidence_threshold and this value are
# shown with a "low confidence" tag in the UI.
LOW_CONFIDENCE_THRESHOLD = 0.35

# ---------------------------------------------------------------------------
# Debounce (seconds) before launching the full refresh + retrain job after
# category edits in the All Data editor. Multiple quick edits coalesce into one.
# ---------------------------------------------------------------------------
EDITOR_FIX_DEBOUNCE_SECONDS = 45

# Minimum validated transactions required before the classifier will train.
MIN_TRAINING_SAMPLES = 50

# ---------------------------------------------------------------------------
# Default master categories seeded into public.categories and used as the
# fallback list if the catalog cannot be read.
# ---------------------------------------------------------------------------
DEFAULT_CATEGORIES = [
    "Dining out",
    "Donation",
    "Flight",
    "Fun!™",
    "Gas",
    "Groceries",
    "Health care",
    "Home",
    "Income",
    "Insurance",
    "Interest",
    "Investments",
    "Miscellaneous",
    "Professional development",
    "Rent",
    "Shopping",
    "Transfers",
    "Transportation",
    "Utilities",
]
