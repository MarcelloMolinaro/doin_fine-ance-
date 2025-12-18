from dagster import Definitions, asset
import pandas as pd
from sqlalchemy import create_engine, text
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

# disable testing assets for now [source1, source2, source3, weather_source,]
all_assets = [
    simplefin_financial_data, 
    load_to_postgres, 
    run_dbt,
    train_transaction_classifier,
    predict_transaction_categories
]

definitions = Definitions(assets=all_assets)