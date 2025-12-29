# import pandas as pd # might not need
# import json # might not need


# -- New Code --
from pathlib import Path

from dagster import (
    Definitions,
    AssetSelection,
    define_asset_job,
    Config,
    RunConfig,
)

from dagster_dbt import (
    DbtCliResource,
    dbt_assets,
)

# -------------------------
# Non-dbt assets
# -------------------------
from extractors.simplefin_api import simplefin_financial_data
from classifier_train import train_transaction_classifier
from classifier_predict import predict_transaction_categories

from dagster import asset, AssetExecutionContext
from sqlalchemy import create_engine

# -- End New Code --


@asset
def load_to_postgres(context: AssetExecutionContext, simplefin_financial_data):
    """
    Loads extracted financial data into Postgres.
    This asset represents the boundary between Python ingestion
    and warehouse-based transformations (dbt).
    """
    engine = create_engine(
        "postgresql+psycopg2://dagster:dagster@postgres:5432/dagster"
    )

    simplefin_financial_data.to_sql(
        "simplefin",
        engine,
        schema="public",
        if_exists="append",
        index=False,
        method="multi",
    )

    engine.dispose()
    context.log.info("Loaded simplefin data into Postgres.")


# -------------------------
# dbt assets
# -------------------------

DBT_PROJECT_DIR = Path("/opt/dbt")
DBT_MANIFEST_PATH = DBT_PROJECT_DIR / "target" / "manifest.json"

dbt_resource = DbtCliResource(
    project_dir=DBT_PROJECT_DIR,
    profiles_dir=DBT_PROJECT_DIR,
)


class DbtModelsConfig(Config):
    """Configuration for dbt models asset."""
    full_refresh: bool = False


@dbt_assets(manifest=DBT_MANIFEST_PATH)
def dbt_models(context: AssetExecutionContext, dbt: DbtCliResource, config: DbtModelsConfig):
    """
    Materializes all dbt models defined in the manifest.
    Each dbt model becomes a first-class Dagster asset.
    
    Config:
        full_refresh: If True, runs dbt with --full-refresh flag for incremental models.
    """
    dbt_args = ["build"]
    if config.full_refresh:
        dbt_args.append("--full-refresh")
        context.log.info("Running dbt with --full-refresh flag")
    yield from dbt.cli(dbt_args, context=context).stream()


# -------------------------
# Jobs
# -------------------------

refresh_validated_trxns_job = define_asset_job(
    name="refresh_validated_trxns",
    selection=(
        AssetSelection.keys("fct_validated_trxns")
        .downstream()
        | AssetSelection.keys("fct_validated_trxns")
    ),
)

full_refresh_validated_trxns_job = define_asset_job(
    name="full_refresh_validated_trxns",
    selection=AssetSelection.keys("fct_validated_trxns"),
    config=RunConfig(
        ops={
            "dbt_models": {
                "config": {
                    "full_refresh": True
                }
            }
        }
    ),
)


ingest_and_predict_job = define_asset_job(
    name="ingest_and_predict",
    selection=(
        AssetSelection.keys("simplefin_financial_data")
        .downstream()
        # "load_to_postgres" -> "predict_transaction_categories" --> fct_trxns_with_predictions"
    ),
)

run_all_dbt_models_job = define_asset_job(
    name="run_all_dbt_models",
    selection=AssetSelection.kind("dbt"),
)


# -------------------------
# Definitions
# -------------------------

definitions = Definitions(
    assets=[
        simplefin_financial_data,
        load_to_postgres,
        dbt_models,
        train_transaction_classifier,
        predict_transaction_categories,
    ],
    resources={
        "dbt": dbt_resource,
    },
    jobs=[
        refresh_validated_trxns_job,
        full_refresh_validated_trxns_job,
        ingest_and_predict_job,
        run_all_dbt_models_job,
    ],
)