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

The SimpleFIN API recommends a **45-day maximum per request**, so historical data is fetched via pagination.

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
- **`5_full_refresh_validated_retrain_repredict`**: Same full refresh, then retrain and re-predict (auto-scheduled ~45s after All Data editor category saves)

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
- Backup database (manual download or scheduled automatic backups)

All manual categorizations are stored in `public.user_categories` and feed back into the ML training process. Run the **`4_refresh_validated_retrain_repredict`** Dagster job (or use **Run Validated Transactions Pipeline** in the UI) to pull new validations into `fct_validated_trxns`, retrain the model, and re-run predictions.

### Database Backup

The Backup tab in the Web UI lets you:

1. **Manual Download** – Create a backup and download it through your browser. Uses `pg_dump` custom format (compressed).
2. **Save to Server** – Create a backup and save it to `./backups` on the host. Useful for one-off snapshots.
3. **Automatic Schedule** – Enable scheduled backups (e.g. daily at 2 AM). Backups are saved to `./backups`. Configure retention to automatically delete older backups (1–90 days).
4. **Backup List** – View backups stored on the server with size and creation date.
5. **Restore** – Restore the database from a server-stored backup. Select a backup, type RESTORE to confirm, then click Restore. Overwrites the current database.

Backups use `pg_dump -Fc` (custom format). For command-line restore:

```bash
pg_restore -h localhost -U dagster -d dagster -c ./backups/dagster_backup_YYYYMMDD_HHMMSS.dump
```

The `./backups` directory is mounted from the host, so backups persist across container restarts.

## Migration

Your transaction data lives in **Postgres** and a few **local files that are not in git** (`.env`, seed CSVs, model files, personal code tweaks). Cloning the repo alone is not enough to move to another machine.

### Export (current machine)

With containers running (`make up`):

```bash
make migration-bundle
```

This creates `migration_bundle/YYYYMMDD_HHMMSS/` containing:

| Item | Purpose |
|------|---------|
| `backups/dagster_backup_*.dump` | Full database (transactions, validations, predictions) |
| `.env` | SimpleFIN credentials, Postgres volume setting |
| `config.yaml` | Model settings |
| `dbt/seeds/*.csv` | Account mappings, historic data, exclusions (if present) |
| `dagster/models/*.pkl` | Trained classifier (optional — retrain works too) |
| `local/dagster/classifier_train.py` | Snapshot of your training script (personal filters, etc.) |
| `local/jupyter/notebooks/` | Your analysis notebooks (including uncommitted edits) |
| `README.txt` | Quick restore checklist |

Personal customizations live under `local/` so they are clearly separate from the shared repo. The bundle always snapshots the **full** `classifier_train.py` (not just the filter block) — one file to copy back beats merging snippets by hand.

The folder is gitignored. **It contains secrets and financial data** — treat it like a password.

**Google Drive / cloud:** Yes — drag the bundle folder (or a `.zip` of it) into Drive, Dropbox, etc. Use a private folder; consider Drive's encrypted zip or a personal-only share link. Typical bundle size is tens to low hundreds of MB.

### Import (new machine)

1. Install Docker, clone this repo, run `make up`.
2. Copy bundle contents into the matching project paths (see `README.txt` in the bundle).
3. Restore personal code (if `local/` is present):
   ```bash
   cp local/dagster/classifier_train.py dagster/classifier_train.py
   cp -R local/jupyter/notebooks/. jupyter/notebooks/
   ```
   If you have pulled newer shared repo changes since your export, diff `classifier_train.py` and merge by hand instead of overwriting blindly.
4. Restore the database — **Backup tab → Restore**, or:
   ```bash
   pg_restore -h localhost -U dagster -d dagster -c migration_bundle/.../backups/dagster_backup_*.dump
   ```
5. Open http://localhost:5173 and confirm **All Data** shows your transactions.

You do **not** need to re-run Initialize or Ingest after a full restore.

**Without a backup:** You can only recover ~60–145 days from SimpleFIN plus any historic seed CSV — and you lose all manual validations. Always export a bundle before migrating.

### Local personalizations (git skip-worktree)

Some files are intentionally **personal** (not committed to GitHub). Git can hide local edits so `git status` stays clean:

| File | skip-worktree? | Why |
|------|----------------|-----|
| `dagster/classifier_train.py` | recommended | Uncommented training filters are local-only |
| `jupyter/notebooks/01_m_and_a_charts.ipynb` | yes | Personal analysis |
| `jupyter/notebooks/02_net_change_by_month.ipynb` | yes | Personal analysis |
| `jupyter/notebooks/00_getting_started.ipynb` | no | Shared starter notebook |

Set once on a machine (already applied for 01 & 02 on the primary dev machine):

```bash
git update-index --skip-worktree dagster/classifier_train.py
git update-index --skip-worktree jupyter/notebooks/01_m_and_a_charts.ipynb
git update-index --skip-worktree jupyter/notebooks/02_net_change_by_month.ipynb
```

List skip-worktree files: `git ls-files -v | grep '^S'`

To commit a shared change to one of these files later: `git update-index --no-skip-worktree <path>`, then commit, then re-enable skip-worktree if desired.

Personal versions are still captured by `make migration-bundle` under `local/`.

### Hosting on a remote server

Same restore steps, plus:

- Set `POSTGRES_VOLUME=postgres_prod` in `.env` for a persistent prod volume.
- Change default Postgres credentials before exposing anything to the internet.
- Do **not** expose port 5432 publicly; put HTTPS in front of the UI/API (5173/8000) via a reverse proxy.
- If accessing remotely, update `VITE_API_URL` in `docker-compose.yml` to your server's backend URL and rebuild the frontend container.

## ML Transaction Classifier

The project includes a machine learning classifier to automatically categorize financial transactions.

### Implementation

**Text Vectorization:**
- Uses **TF-IDF** to vectorize transaction text
- Combines description, account name, and institution name
- Includes unigrams and bigrams (1-2 word combinations)

**Classifier:**
- **RandomForestClassifier** with 200 trees
- Confidence threshold: 0.10 (predictions below this are UNCERTAIN); UI flags 10–35% as low confidence
- Uses stratified train/test split (80/20)

**Features:**
- **Text**: Combined description + account_name + institution_name (TF-IDF vectorized)
- **Date**: Day of week, month, day of month
- **Amount**: Raw amount, absolute value, is_negative flag, amount buckets
- **Keywords**: Boolean flags for hotel, gas, grocery, restaurant, transport, and shopping keywords

**Confidence Scoring:**
- Uses `predict_proba()` from RandomForest (maximum class probability)
- Predictions below 10% confidence are marked as "UNCERTAIN"; 10–35% show a low-confidence tag in the UI
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
- `make migration-bundle` - Export DB backup + local config/seeds for moving to another machine
- `make test` - Run backend and Dagster unit tests
- `make reset-dev-postgres` - ⚠️ Reset dev Postgres database (deletes all data!)

## Troubleshooting

### `make up` fails with `docker-credential-desktop: executable file not found`

Happens when the Docker CLI (e.g. the Homebrew `docker`) is on PATH but Docker Desktop's `bin/` isn't, and `~/.docker/config.json` has `"credsStore": "desktop"`. Either:

- Add Docker Desktop's helper to PATH: `/Applications/Docker.app/Contents/Resources/bin`, or
- If you don't have private-registry logins (`"auths": {}` in `~/.docker/config.json`), just remove the `"credsStore": "desktop"` line — public image pulls don't need a credential helper.

## Additional Resources

- **[3_TEST_COMMANDS.md](3_TEST_COMMANDS.md)**: Useful commands for testing and debugging the pipeline
- **[2_DAGSTER_DBT_SETUP.md](2_DAGSTER_DBT_SETUP.md)**: Advanced dagster-dbt integration details and troubleshooting
