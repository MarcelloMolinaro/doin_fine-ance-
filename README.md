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

## SimpleFIN Setup

The SimpleFIN extractor (`dagster/extractors/simplefin_api.py`) connects to bank accounts and credit cards via SimpleFIN Bridge.

### Quick Setup

1. **Get a SimpleFIN Token**:
   - Visit: https://bridge.simplefin.org/simplefin/create
   - Follow the prompts to connect your bank account
   - Copy the Base64-encoded token you receive

2. **Claim Your Access URL**:
   ```bash
   # Decode the token to get the claim URL
   TOKEN="<your_token_here>"
   CLAIM_URL=$(echo "${TOKEN}" | base64 --decode)
   
   # Claim the access URL
   ACCESS_URL=$(curl -X POST "${CLAIM_URL}")
   echo "${ACCESS_URL}"
   ```
   
   Or use Python:
   ```python
   from dagster.extractors.simplefin_api import claim_simplefin_token
   access_url = claim_simplefin_token("<your_token_here>")
   print(access_url)
   ```

3. **Configure Environment Variable** (Recommended: Use `.env` file):
   
   **⚠️ Security Warning**: Never commit credentials to git! Use a `.env` file instead.
   
   Create a `.env` file in the project root (copy from `.env.example`):
   ```bash
   cp .env.example .env
   # Then edit .env and replace with your actual credentials
   ```
   
   The `.env` file should contain:
   ```bash
   # .env file
   SIMPLEFIN_ACCESS_URL=https://your_actual_username:your_actual_password@bridge.simplefin.org/simplefin
   ```
   
   Replace `your_actual_username` and `your_actual_password` with the credentials from the Access URL you received in step 2.
   
   Update `docker-compose.yml` to use the `.env` file. Add to the `dagster` service:
   ```yaml
   environment:
     DAGSTER_HOME: /opt/dagster/app
     DBT_PROFILES_DIR: /opt/dbt
     SIMPLEFIN_ACCESS_URL: ${SIMPLEFIN_ACCESS_URL}
   ```
   
   Docker Compose will automatically load variables from `.env` when you run `docker-compose up`.
   
   **Alternative**: Set it at runtime (without modifying docker-compose.yml):
   ```bash
   docker-compose exec -e SIMPLEFIN_ACCESS_URL="https://your_actual_username:your_actual_password@bridge.simplefin.org/simplefin" dagster python /opt/dagster/app/extractors/simplefin_api.py
   ```

4. **Add to Dagster Assets**:
   
   In `dagster/repo.py`, add:
   ```python
   from extractors.simplefin_api import simplefin_financial_data
   
   all_assets = [source1, source2, source3, weather_source, simplefin_financial_data, load_to_postgres, run_dbt]
   ```

The Access URL format is: `https://username:password@bridge.simplefin.org/simplefin`

**Note**: SimpleFIN Bridge is free and doesn't require registration. For more details, see: https://www.simplefin.org/protocol.html

### Institution-Specific Data Availability

Different institutions provide different amounts of historical transaction data. The SimpleFIN API allows up to 60 days per request, but the actual available history varies by institution:

| Institution | Account Type | Earliest Date Available |
|------------|--------------|------------------------|-------|
| **Amalgamated Bank** | ONLINE CHECKING-3633 | 60 days |
| **American Express** | Blue Cash Preferred® | 90 days |
| **Chase Bank** | Chase Freedom Unlimited | 90 days |
| **Wintrust Community Banks** | Junior Savers Savings | <145 days |

**Important Notes:**
- The SimpleFIN API enforces a **60-day maximum per request**, so historical data is fetched via pagination

**Query to check current data ranges:**
```sql
SELECT 
    account_name, 
    institution_name, 
    MIN(transacted_date) as earliest_date, 
    MAX(transacted_date) as latest_date, 
    COUNT(*) as transaction_count,
    (MAX(transacted_date) - MIN(transacted_date)) as date_range_days
FROM public.simplefin 
WHERE transacted_date IS NOT NULL 
GROUP BY account_name, institution_name 
ORDER BY institution_name, account_name;
```