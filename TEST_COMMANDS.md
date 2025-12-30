# Pipeline Testing Commands

## 1. Test Postgres Connection & Persistence

### Start containers 
```bash
docker compose up -d
```

### Test Postgres connection
```bash
docker exec -it postgres psql -U dagster -d dagster -c "SELECT version();"
```

### Create test data and verify
```bash
docker exec -it postgres psql -U dagster -d dagster -c "CREATE TABLE IF NOT EXISTS test_persistence (id INT, message TEXT); INSERT INTO test_persistence VALUES (1, 'test'); SELECT * FROM test_persistence;"
```

### Restart and verify persistence
```bash
docker compose restart postgres
sleep 5
docker exec -it postgres psql -U dagster -d dagster -c "SELECT * FROM test_persistence;"
```

---

## 2. Test dbt Project

### Helpful dbt and Postgres commands
```bash
docker exec -it postgres psql -U dagster -d dagster -c "CREATE SCHEMA IF NOT EXISTS analytics;"      # (one-time) ensure dbt target schema exists
docker exec -it dagster dbt debug --project-dir /opt/dbt                                             # test dbt connection
docker exec -it dagster dbt run --project-dir /opt/dbt                                               # run dbt models
docker exec -it postgres psql -U dagster -d dagster -c "SELECT * FROM analytics.<your_model_name>;"  # verify results
```

### Helpful dbt + Dagster commands
```bash
# recompile and restarts Dagster
docker exec dagster dbt compile --project-dir /opt/dbt && docker compose restart dagster
```


## 3. Testing the simplefin_api.py script

```bash
docker compose exec dagster python /opt/dagster/app/extractors/simplefin_api.py
```

## 4. Run via Dagster

### Check Dagster is running
```bash
curl http://localhost:3000/health || echo "Dagster not responding"
```

### View in browser
Open: http://localhost:3000

### Or trigger via CLI (if needed)
```bash
# Materialize specific assets (use --select with comma-separated asset names)
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select simplefin_financial_data,load_to_postgres,dbt_models

# Or use the workspace (if configured)
docker exec dagster dagster-webserver -h 0.0.0.0 -p 3000 -w /opt/dagster/app/workspace.yaml
# Then use the UI at http://localhost:3000 to materialize assets
```

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

## 5. Check SimpleFIN Data

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

**Warning**: After running this and re-materializing your fct_validated_trxns model using the http://localhost:3000/locations/repo.py/jobs/full_refresh_validated_trxns job, you will only have categorized transaction that were in your user_categories table and your historic data.
```sql
-- Removes all data from the validated table
TRUNCATE TABLE analytics.fct_validated_trxns;
```