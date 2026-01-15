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

dagster_init_job = define_asset_job(
    name="1_dagster_init",
    selection=(
        # Ingest & predict: simplefin data ingestion and predictions
        AssetSelection.keys("simplefin_financial_data").downstream() |
        # Run all dbt models
        AssetSelection.kind("dbt") |
        # Refresh validated transactions and retrain/re-predict
        AssetSelection.keys("fct_validated_trxns").downstream()
    ),
    description="Complete initialization pipeline: ingest & predict -> run all dbt models -> refresh validated transactions & retrain",
)

ingest_and_predict_job = define_asset_job(
    name="2_ingest_and_predict",
    selection=(
        AssetSelection.keys("simplefin_financial_data").downstream()
    ),
    description="Load Simplefin financial data to db, run prediction model on all data"
)

run_all_dbt_models_job = define_asset_job(
    name="3_run_all_dbt_models",
    selection=AssetSelection.kind("dbt"),
)

refresh_validated_trxns_job = define_asset_job(
    name="4_refresh_validated_retrain_repredict",
    selection=(
        AssetSelection.keys("fct_validated_trxns").downstream()
    ),
    description="Runs incremental refresh of validated transactions table, retrains the model, and re-runs predicitions",
)

rebuild_historic_data_job = define_asset_job(
    name="z_a_rebuild_historic_data",
    selection=(
        AssetSelection.keys("historic_transactions") |
        AssetSelection.keys("fct_validated_trxns") |
        AssetSelection.kind("dbt") |
        AssetSelection.keys("fct_validated_trxns").downstream()
    ),
    config=RunConfig(
        ops={
            "dbt_models": {
                "config": {
                    "full_refresh": True
                }
            }
        }
    ),
    description="Runs historic dbt seed refresh, full refreshes validated transacitons - Use when updating your historic seed data",
)

full_refresh_validated_trxns_job = define_asset_job(
    name="z_b_full_refresh_validated_trxns",
    selection=AssetSelection.keys("fct_validated_trxns"),
    description="Full refresh of only validated transactions table, combining historic data with manual user defined categories",
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
        dagster_init_job,
        ingest_and_predict_job,
        run_all_dbt_models_job,
        refresh_validated_trxns_job,
        rebuild_historic_data_job,
        full_refresh_validated_trxns_job,
    ],
)