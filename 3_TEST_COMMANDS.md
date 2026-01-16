# Pipeline Testing& Troubleshooting Commands

## 1. Spin up App


```bash
# starts containers 
make up

# View logs
make logs

# Test postgres connection in interactive shell
make psql
# Then run: SELECT version();
```


---

## 2. Test dbt Project

### Helpful dbt and Postgres commands
```bash

# Test dbt connection
docker exec -it dagster dbt debug --project-dir /opt/dbt

# Run dbt models
docker exec -it dagster dbt run --project-dir /opt/dbt

# Verify results (interactive shell)
make psql
# Then run: SELECT * FROM analytics.<your_model_name>;

```

**Note**: For dbt + Dagster workflow commands, use `make dbt-compile-restart` (see [2_DAGSTER_DBT_SETUP.md](2_DAGSTER_DBT_SETUP.md) for details).


## 3. Testing the simplefin_api.py script

```bash
docker compose exec dagster python /opt/dagster/app/extractors/simplefin_api.py
```

## 4. Using Dagster

### View in browser
Open: http://localhost:3000



**Note**: The Dagster UI (http://localhost:3000) is the recommended way to materialize assets. See [README.md](README.md) for information about pre-configured jobs.

### Train and predict with classifier
```bash
# Train the classifier (requires dbt_models to complete first)
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select train_transaction_classifier

# Predict categories for uncategorized transactions
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select predict_transaction_categories

# Or run the full pipeline including classifier
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select simplefin_financial_data,load_to_postgres,dbt_models,train_transaction_classifier,predict_transaction_categories
```

**Note:** The easiest way to materialize assets is via the Dagster UI at http://localhost:3000. Navigate to Assets and click "Materialize" on the asset you want to run.

## 5. SimpleFIN Data Checks

### Query to check current data ranges
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

Run via:
```bash
# Interactive shell (recommended for long queries)
make psql

# Turns on helpful visulaization mode for postgres
\x on;

# Then paste the query

# Or run directly
docker exec -it postgres psql -U dagster -d dagster -c "SELECT account_name, institution_name, MIN(transacted_date) as earliest_date, MAX(transacted_date) as latest_date, COUNT(*) as transaction_count, (MAX(transacted_date) - MIN(transacted_date)) as date_range_days FROM public.simplefin WHERE transacted_date IS NOT NULL GROUP BY account_name, institution_name ORDER BY institution_name, account_name;"
```

## 6. Testing & Resetting the Incremental Validated Transactions Process

```sql
-- See the most recent transaction update from the UI
select * from public.user_categories order by updated_at desc;
```

**Warning**: This removes all manual categorization you have done!

```sql
-- Cleans up Categorization tables -- Nothing shows as "validated"
TRUNCATE TABLE public.user_categories;
```

**Warning**: After running this and re-materializing your fct_validated_trxns model using the http://localhost:3000/locations/repo.py/jobs/z_b_full_refresh_validated_trxns job, you will only have categorized transaction that were in your user_categories table and your historic data.
```sql
-- Removes all data from the validated table
TRUNCATE TABLE analytics.fct_validated_trxns;
```

## 7. Porting Configuration Data [WIP might not work/there might be a better way!]

To port your configuration to a new instance, you only need:

1. **`public.user_categories` Postgres table** - Contains all manual transaction categorizations
2. **`historic_transactions.csv`** - Your historical transaction data
3. **Account mapping seed files** - `seed_account_mapping_simplefin.csv` and `seed_account_mapping_historic.csv`

The full refresh will grab your historic data and all categorizations will be stored in `public.user_categories`.