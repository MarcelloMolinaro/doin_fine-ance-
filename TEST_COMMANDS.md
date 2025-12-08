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

## 2. Test dbt Project (after data is in Postgres)

### Load test data into Postgres first
```bash
docker exec -it dagster python3 -c "
import pandas as pd
from sqlalchemy import create_engine
engine = create_engine('postgresql+psycopg2://dagster:dagster@postgres:5432/dagster')
pd.DataFrame({'id': [1,2,3], 'value': [10,20,30]}).to_sql('source1', engine, if_exists='replace', index=False)
pd.DataFrame({'id': [1,2,3], 'score': [5,7,8]}).to_sql('source2', engine, if_exists='replace', index=False)
pd.DataFrame({'id': [1,2,3], 'category': ['A','B','A']}).to_sql('source3', engine, if_exists='replace', index=False)
print('Data loaded')
"
```

### Helpful dbt and Postgres commands
```bash
docker exec -it postgres psql -U dagster -d dagster -c "CREATE SCHEMA IF NOT EXISTS analytics;"      # (one-time) ensure dbt target schema exists
docker exec -it dagster dbt debug --project-dir /opt/dbt                                             # test dbt connection
docker exec -it dagster dbt run --project-dir /opt/dbt                                               # run dbt models
docker exec -it postgres psql -U dagster -d dagster -c "SELECT * FROM analytics.<your_model_name>;"  # verify results
```

---

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
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select source1,source2,source3,load_to_postgres,run_dbt

# Or use the workspace (if configured)
docker exec dagster dagster-webserver -h 0.0.0.0 -p 3000 -w /opt/dagster/app/workspace.yaml
# Then use the UI at http://localhost:3000 to materialize assets
```

### Train and predict with classifier
```bash
# Train the classifier (requires run_dbt to complete first)
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select train_transaction_classifier

# Predict categories for uncategorized transactions
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select predict_transaction_categories

# Or run the full pipeline including classifier
docker exec dagster dagster asset materialize -f /opt/dagster/app/repo.py --select simplefin_financial_data,load_to_postgres,run_dbt,train_transaction_classifier,predict_transaction_categories
```

**Note:** The easiest way to materialize assets is via the Dagster UI at http://localhost:3000. Navigate to Assets and click "Materialize" on the asset you want to run.
