# Dagster + dbt + Postgres Starter Stack

## Overview
Local data platform with Dagster, dbt, and Postgres using Docker. Includes 3 synthetic data sources + 1 weather extractor + summary table.

## Project Structure
See the folder layout in the instructions above.

## Running the stack
docker compose up --build
Dagit UI: http://localhost:3000
Postgres: localhost:5432 (user: dagster, password: dagster)

## Adding your own extraction scripts
Put Python files in dagster/extractors/

## Running the pipeline
Dagit → launch the job → extracts, loads, dbt run