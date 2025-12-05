from dagster import Definitions, asset
import pandas as pd
from sqlalchemy import create_engine, text
from extractors.weather_api import weather_source

@asset
def source1():
    data = pd.DataFrame({"id": [1,2,3], "value": [100,20,30]})
    return data

@asset
def source2():
    data = pd.DataFrame({"id": [1,2,3], "score": [5,7,82]})
    return data

@asset
def source3():
    data = pd.DataFrame({"id": [1,2,3], "category": ['A','A','A']})
    return data

@asset
def load_to_postgres(context, source1, source2, source3, weather_source):
    engine = create_engine('postgresql+psycopg2://dagster:dagster@postgres:5432/dagster')
    # Avoid dropping raw tables (dbt views depend on them). Truncate then append.
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE public.source1"))
        conn.execute(text("TRUNCATE TABLE public.source2"))
        conn.execute(text("TRUNCATE TABLE public.source3"))
        conn.execute(text("DROP TABLE IF EXISTS public.weather"))
    source1.to_sql('source1', engine, schema='public', if_exists='append', index=False, method='multi')
    source2.to_sql('source2', engine, schema='public', if_exists='append', index=False, method='multi')
    source3.to_sql('source3', engine, schema='public', if_exists='append', index=False, method='multi')
    weather_source.to_sql('weather', engine, schema='public', if_exists='replace', index=False, method='multi')
    engine.dispose()
    context.log.info("Loaded all sources into Postgres.")

@asset
def run_dbt(context, load_to_postgres):
    import subprocess
    import os

    os.environ["DBT_PROFILES_DIR"] = "/opt/dbt"
    
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

all_assets = [source1, source2, source3, weather_source, load_to_postgres, run_dbt]
definitions = Definitions(assets=all_assets)