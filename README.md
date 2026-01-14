# Dagster Finance Pipeline

## Overview
Local data platform with Dagster, dbt, and Postgres using Docker. Extracts financial transactions via SimpleFIN, categorizes them with ML, and provides a web UI for validation.

## Running the Stack

```bash
docker compose up --build
```

- **Dagster UI**: http://localhost:3000
- **Web UI**: http://localhost:5173
- **Postgres**: localhost:5432 (user: `dagster`, password: `dagster`)

## SimpleFIN Setup

The SimpleFIN extractor connects to bank accounts and credit cards via SimpleFIN Bridge.
- (`dagster/extractors/simplefin_api.py`)

### Quick Setup

1. **Get a SimpleFIN Token**:
   - Visit: https://bridge.simplefin.org/simplefin/create
   - Follow the prompts to connect your bank account
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
   
   **⚠️ Security Warning**: Never commit credentials to git! Use a `.env` file instead.
   
   Create a `.env` file in the project root (copy from `.env.example`):
   ```bash
   SIMPLEFIN_ACCESS_URL=https://your_actual_username:your_actual_password@bridge.simplefin.org/simplefin
   ```
   
   Replace `your_actual_username` and `your_actual_password` with the credentials from the Access URL.
   
   Docker Compose automatically loads variables from `.env` when you run `docker-compose up`.

The Access URL format is: `https://username:password@bridge.simplefin.org/simplefin`

**Note**: SimpleFIN Bridge requires registration and monthly payment of $1.50, well worth the prive of your data! For more details, see: https://www.simplefin.org/protocol.html

### Institution-Specific Data Availability

Different institutions provide different volumes of historical transaction data:

| Institution | Earliest Date Available |
|------------|--------------|
| **Amalgamated Bank** | 60 days |
| **American Express** | 90 days |
| **Chase Bank** | 90 days |
| **Wintrust Community Banks** | <145 days |

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

## Porting Configuration Data

To port your configuration to a new instance, you only need:

1. **`public.user_categories` Postgres table** - Contains all manual transaction categorizations
2. **`historic_transactions.csv`** - Your historical transaction data
3. **Account mapping seed files** - `seed_account_mapping_simplefin.csv` and `seed_account_mapping_historic.csv`

The full refresh will grab your historic data and all categorizations will be stored in `public.user_categories`.

## Account Mappings

**⚠️ Required**: The pipeline requires account mapping seed files to function. These files map raw account names from your financial institutions to standardized account names.

### Setup

1. **Copy the example files** from `dbt/seeds/examples/` to create your mapping files:
   ```bash
   cp dbt/seeds/examples/seed_account_mapping_simplefin_example.csv dbt/seeds/seed_account_mapping_simplefin.csv
   cp dbt/seeds/examples/seed_account_mapping_historic_example.csv dbt/seeds/seed_account_mapping_historic.csv
   cp dbt/seeds/examples/seed_transaction_exclusions_example.csv dbt/seeds/seed_transaction_exclusions.csv
   ```

2. **Customize the mapping files** with your account information:
   - **SimpleFIN mappings** (`seed_account_mapping_simplefin.csv`): Maps SimpleFIN account names (and optional account IDs) to your standardized names
   - **Historic mappings** (`seed_account_mapping_historic.csv`): Maps historic transaction account names (and optional additional fields) to standardized names
   - **Transaction exclusions** (`seed_transaction_exclusions.csv`): Patterns to exclude from processing (e.g., credit card payments). Currently managed manually - see TODO.md for future sync script from `config.yaml`

3. **Load the seeds** into your database:
   Either locally or materializing in dagster
   ```bash
   dbt seed
   ```

**Note**: The mapping seed files are git-ignored to keep your personal account information private. The example files in `dbt/seeds/examples/` are provided as templates and are disabled from loading into dagster/dbt.

## Configuration

The pipeline uses a `config.yaml` file to manage transaction exclusion rules.

### Initial Setup

1. **Copy the example configuration**:
   ```bash
   cp config.example.yaml config.yaml
   ```

2. **Customize `config.yaml`** with your transaction exclusion patterns:
   - **Transaction Exclusions**: Add patterns to exclude transactions (e.g., credit card payments, transfers)
     - Uses SQL `ILIKE` pattern matching (supports `%` wildcards)

### Transaction Exclusions

Add patterns to exclude non-transactional items like credit card payments:
```yaml
transaction_exclusions:
  description_patterns:
    - "%Credit Card Payment%"
    - "%AUTOPAY PAYMENT%"
```

**Note**: `config.yaml` is git-ignored to keep your personal configuration private.

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
