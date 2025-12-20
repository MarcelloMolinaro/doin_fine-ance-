from dagster import Definitions, asset, Config, AssetExecutionContext
import pandas as pd
from sqlalchemy import create_engine, text
from pydantic import Field
from extractors.weather_api import weather_source
from extractors.simplefin_api import simplefin_financial_data
from classifier_train import train_transaction_classifier
from classifier_predict import predict_transaction_categories

@asset 
def load_to_postgres(context, simplefin_financial_data): # source1, source2, source3, weather_source, 
    engine = create_engine('postgresql+psycopg2://dagster:dagster@postgres:5432/dagster')
    simplefin_financial_data.to_sql('simplefin', engine, schema='public', if_exists='append', index=False, method='multi')
    engine.dispose()
    context.log.info("Loaded all sources into Postgres.")

@asset
def run_dbt(context, load_to_postgres):
    import subprocess
    import os

    os.environ["DBT_PROFILES_DIR"] = "/opt/dbt"
    
    # First run dbt seed
    seed_result = subprocess.run(
        ["dbt", "seed", "--project-dir", "/opt/dbt"], 
        cwd="/opt/dagster/app",
        capture_output=True,
        text=True
    )
    context.log.info(seed_result.stdout)
    context.log.info(seed_result.stderr)

    # Then run dbt run
    result = subprocess.run(
        ["dbt", "run", "--project-dir", "/opt/dbt"], 
        cwd="/opt/dagster/app",
        capture_output=True,
        text=True
    )
    context.log.info(result.stdout)
    context.log.info(result.stderr)

    if result.returncode != 0:
        raise Exception("dbt run failed")
    context.log.info("dbt transformations complete.")


class FctValidatedTrxnsConfig(Config):
    full_refresh: bool = Field(
        default=False,
        description="If True, run dbt with --full-refresh flag"
    )


@asset
def run_fct_validated_trxns(context: AssetExecutionContext, config: FctValidatedTrxnsConfig):
    """Run only the fct_validated_trxns dbt model."""
    import subprocess
    import os

    os.environ["DBT_PROFILES_DIR"] = "/opt/dbt"
    
    # Build dbt command
    cmd = ["dbt", "run", "--project-dir", "/opt/dbt", "--select", "fct_validated_trxns"]
    
    if config.full_refresh:
        cmd.append("--full-refresh")
        context.log.info("Running fct_validated_trxns with --full-refresh")
    else:
        context.log.info("Running fct_validated_trxns (incremental)")
    
    result = subprocess.run(
        cmd,
        cwd="/opt/dagster/app",
        capture_output=True,
        text=True
    )
    
    context.log.info(result.stdout)
    if result.stderr:
        context.log.warning(result.stderr)
    
    if result.returncode != 0:
        raise Exception(f"dbt run failed for fct_validated_trxns: {result.stderr}")
    
    context.log.info("fct_validated_trxns model run complete.")

# disable testing assets for now [source1, source2, source3, weather_source,]
all_assets = [
    simplefin_financial_data, 
    load_to_postgres, 
    run_dbt,
    run_fct_validated_trxns,
    train_transaction_classifier,
    predict_transaction_categories
]

definitions = Definitions(assets=all_assets)