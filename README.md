# Dagster Finance Pipeline

## Overview
Local data platform with Dagster, dbt, and Postgres using Docker. Extracts financial transactions via SimpleFIN, categorizes them with ML, and provides a web UI for validation.

## Quick Start

### 1. Configure Your Environment

Before running the pipeline, you'll need to:
1. Set up SimpleFIN credentials (see [SimpleFIN Setup](#simplefin-setup))
2. Create account mapping files (*Optional*) (see [Account Mappings](#account-mappings))
3. Add Historic Data files (*Optional*) (see [Account Mappings](#account-mappings))

### 2. Initial Setup

```bash
# Start all containers
make up
```

```bash
# Generate the manifest and restart Dagster
make dbt-compile-restart
```

Then access the Web UI (see below) and start the initial data loading.

**Note**: This project includes a `makefile` with convenient shortcuts. See available commands with `make` or check the `makefile` directly.

### 3. Access the UIs

- **Web UI**: http://localhost:5173 - Validate and categorize transactions
- **Dagster UI**: http://localhost:3000 - Orchestrate and monitor data pipelines
- **Jupyter Lab**: http://localhost:8888 - Create Python visualizations and data analysis notebooks
- **Postgres**: localhost:5432 (user: `dagster`, password: `dagster`)

## SimpleFIN Setup

The SimpleFIN extractor connects to bank accounts and credit cards via SimpleFIN Bridge.

Script here: `dagster/extractors/simplefin_api.py`

### Setup


**Note**: SimpleFIN Bridge requires registration and monthly payment of a whopping $1.50, well worth the price of your data! Doesn't feel too steep to me! Don't worry, I don't get a  cut ;) For more details, see: https://www.simplefin.org/protocol.html

1. **Get a SimpleFIN Token**:
   - Visit: https://bridge.simplefin.org/simplefin/create
   - Follow the prompts to connect your bank account or credit cards
   - Copy the Base64-encoded token

2. **Claim Your Access URL**:
   ```bash
   TOKEN="<your_token_here>"
   CLAIM_URL=$(echo "${TOKEN}" | base64 --decode)
   ACCESS_URL=$(curl -X POST "${CLAIM_URL}")
   echo "${ACCESS_URL}"
   ```
   
   Or use Python:
   ```python
   from dagster.extractors.simplefin_api import claim_simplefin_token
   access_url = claim_simplefin_token("<your_token_here>")
   print(access_url)
   ```

3. **Configure Environment Variable**:
   
   
   - Add your credentials to the `.env` file
   
   - Replace `your_actual_username` and `your_actual_password` with the credentials from the Access URL.
   
   - Docker Compose automatically loads variables from `.env`.

   - The Access URL format is: `https://username:password@bridge.simplefin.org/simplefin`


### Institution-Specific Data Availability

Different institutions provide different volumes of historical transaction data:

| Institution | Earliest Date Available |
|------------|--------------|
| **Various Banks** | 60 days - 145 days|
| **American Express** | 90 days |
| **Chase Bank** | 90 days |

The SimpleFIN API enforces a **60-day maximum per request**, so historical data is fetched via pagination.

### Example SimpleFIN Transaction Data

Here's an example of what a transaction record looks like when extracted from SimpleFIN:

```
transaction_id     | TRN-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
account_id         | ACT-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
account_name       | Savings Account
institution_domain | www.example-bank.com
institution_name   | Example Bank
amount             | 0.05
posted             | 1764331200
posted_date        | 2025-11-28T12:00:00
transacted_at      | 1764331200
transacted_date    | 2025-11-28T12:00:00
description        | Interest Credit Income/Interest Income
pending            | f
import_timestamp   | 2025-12-07T08:53:35.218346
import_date        | 2025-12-07
extra              | 
```



## Account Mappings

**⚠️ Required**: The pipeline requires account mapping seed files to function. These files map raw account names from your financial institutions to standardized account names.

### Setup - `dagster_finance_pipeline/dbt/seeds/`

1. **You can leave these seed files as they are (i.e. empty)**: 
   - If you want to just useSimpleFIN's account names, no need to touch these. The mappings *can* be especially helpful when combining historic data with SimpleFIN data to consolidate account names.

2. **You can customize the mapping files** with your account information:
   - **SimpleFIN mappings** (`seed_account_mapping_simplefin.csv`): Maps SimpleFIN account names (and optional account IDs) to your standardized names
   - **Historic mappings** (`seed_account_mapping_historic.csv`): Maps historic transaction account names (and optional additional fields) to standardized names
   - **Transaction exclusions** (`seed_transaction_exclusions.csv`): Patterns to exclude from processing (e.g., credit card payments). 
      - Add patterns to exclude transactions (e.g., credit card payments, transfers)
      - Uses SQL `ILIKE` pattern matching (supports `%` wildcards)

3. **If you have historic data, add it here!**:
   - Make sure that the data matches the example file in schema (what's in each column) and data types.
   - If you don't have all of the columns that the example does, that's ok, leave them blank!
   - If you need to add a critical column, too bad! You'll need to build that out yourself 🥇
   - I'd recommend exporting the example file, editing it in a spreadsheet tool and then converting that back into a csv

## Running the Pipeline

### 1. Easiest way! The Web UI!!

http://localhost:5173 - Follow instructions on the Control Center Page. The jobs listed below are triggered by various Web UI buttons.

### 2. Dagster Jobs

http://localhost:3000 - If you want to see the ins and outs of the the pipeline. The Dagster UI will also help trouble shoot any errors that appear, get to know it if you like! The pipeline also includes several pre-configured jobs:

- **`1_dagster_init`**: Complete initialization pipeline - ingests data, runs all dbt models, and refreshes validated transactions with retraining
- **`2_ingest_and_predict`**: Load SimpleFIN data and run predictions
- **`3_run_all_dbt_models`**: Run all dbt transformations
- **`4_refresh_validated_retrain_repredict`**: Incremental refresh of validated transactions, retrain model, and re-run predictions
- **`z_a_rebuild_historic_data`**: Full rebuild when updating historic seed data
- **`z_b_full_refresh_validated_trxns`**: Full refresh of validated transactions table (combines historic data with manual categorizations)

   **Recommended workflow**: Use the Dagster UI to materialize assets rather than the terminal. Navigate to Assets and click "Materialize" on the asset you want to run. Dagster automatically handles dependencies.

### Working with dbt Models

**Important**: Whenever you create or edit a dbt model, you must regenerate the manifest:

```bash
# Regenerate manifest and restart Dagster
make dbt-compile-restart
```

Dagster reads `manifest.json` at startup to discover dbt models and their dependencies. Without regenerating it, Dagster won't see your changes.

For more details on the dagster-dbt integration, see [2_DAGSTER_DBT_SETUP.md](2_DAGSTER_DBT_SETUP.md).

### Web UI for Transaction Validation

The Web UI (http://localhost:5173) provides an interface to:
- View uncategorized transactions
- Validate ML predictions
- Manually categorize transactions
- Review transaction history

All manual categorizations are stored in `public.user_categories` and feed back into the ML training process.

## ML Transaction Classifier

The project includes a machine learning classifier to automatically categorize financial transactions.

### Implementation

**Text Vectorization:**
- Uses **TF-IDF** to vectorize transaction text
- Combines description, account name, and institution name
- Includes unigrams and bigrams (1-2 word combinations)

**Classifier:**
- **RandomForestClassifier** with 200 trees
- Optimized for precision over recall (confidence threshold: 0.45)
- Uses stratified train/test split (80/20)

**Features:**
- **Text**: Combined description + account_name + institution_name (TF-IDF vectorized)
- **Date**: Day of week, month, day of month
- **Amount**: Raw amount, absolute value, is_negative flag, amount buckets
- **Keywords**: Boolean flags for hotel, gas, grocery, restaurant, transport, and shopping keywords

**Confidence Scoring:**
- Uses `predict_proba()` from RandomForest (maximum class probability)
- Predictions below 45% confidence are marked as "UNCERTAIN"
- Model version and prediction timestamp are tracked for each prediction

The classifier is trained via the `train_transaction_classifier` Dagster asset and predictions are generated by the `predict_transaction_categories` asset.

### Adding New Features

To add a new feature to the model:

1. **Add the feature in dbt** (`dbt/models/marts/int_trxns_features.sql`):
   ```sql
   -- Add your feature calculation
   case 
       when lower(coalesce(description, '')) ~* 'your_pattern' then 1 
       else 0 
   end as has_your_feature,
   ```

2. **Update `fct_validated_trxns.sql`** to include the feature in the bootstrap query (around line 49-65):
   ```sql
   has_your_feature
   ```

3. **Update the training script** (`dagster/classifier_train.py`):
   - Add the feature name to the `X_numerical` list (around line 125-132)

4. **Update the prediction script** (`dagster/classifier_predict.py`):
   - Add the feature name to the `X_numerical` list (around line 84-91)

5. **Alter the predictions table** to store the new feature:
   ```sql
   ALTER TABLE analytics.predicted_transactions
   ADD COLUMN IF NOT EXISTS has_your_feature INTEGER;
   ```

After making these changes, rebuild the dbt models and retrain the classifier.

**Note**: This process could probably be improved!

## Jupyter Lab for Visualizations

The project includes Jupyter Lab for creating Python visualizations and analyzing your financial data.

### Accessing Jupyter Lab

1. Start the containers: `make up`
2. Open your browser: http://localhost:8888
3. Jupyter Lab runs without authentication (no token/password needed in development)
4. Notebooks are stored in `jupyter/notebooks/` and persist between container restarts

### Getting Started

A sample notebook `00_getting_started.ipynb` is included with:
- Database connection examples
- Query examples for your transaction data
- Visualization examples using matplotlib, seaborn, and plotly
- Tips for working with the analytics schema

### Database Connection

From within Jupyter notebooks, connect to Postgres using:

```python
from sqlalchemy import create_engine

connection_string = "postgresql://dagster:dagster@postgres:5432/dagster"
engine = create_engine(connection_string)
```

The connection uses the Docker service name `postgres` (not `localhost`) since notebooks run in the same Docker network.

### Key Tables for Analysis

- `analytics.fct_validated_trxns` - Final validated transaction fact table (recommended)
- `analytics.fct_trxns_categorized` - Categorized transactions
- `analytics.fct_trxns_uncategorized` - Uncategorized transactions
- `analytics.fct_trxns_with_predictions` - Transactions with ML predictions

## Makefile Commands

This project includes a `makefile` with convenient shortcuts:

- `make up` - Start all containers
- `make down` - Stop all containers
- `make ps` - Show running containers
- `make logs` - Follow container logs
- `make psql` - Open Postgres shell
- `make dbt-compile-restart` - Compile dbt manifest and restart Dagster
- `make reset-dev-postgres` - ⚠️ Reset dev Postgres database (deletes all data!)

## Additional Resources

- **[3_TEST_COMMANDS.md](3_TEST_COMMANDS.md)**: Useful commands for testing and debugging the pipeline
- **[2_DAGSTER_DBT_SETUP.md](2_DAGSTER_DBT_SETUP.md)**: Advanced dagster-dbt integration details and troubleshooting
