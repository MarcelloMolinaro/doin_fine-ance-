# Pipeline Testing Commands

## 1. Test Postgres Connection & Persistence

### Start containers
```bash
docker compose up -d
```

### Test connection
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

### (One-time) ensure dbt target schema exists
```bash
docker exec -it postgres psql -U dagster -d dagster -c "CREATE SCHEMA IF NOT EXISTS analytics;"
```

### Test dbt connection
```bash
docker exec -it dagster dbt debug --project-dir /opt/dbt
```

### Run dbt models
```bash
docker exec -it dagster dbt run --project-dir /opt/dbt
```

### Verify results
```bash
docker exec -it postgres psql -U dagster -d dagster -c "SELECT * FROM analytics.summary;"
```

---

## 3. Run via Dagster

### Check Dagster is running
```bash
curl http://localhost:3000/health || echo "Dagster not responding"
```

### View in browser
Open: http://localhost:3000

### Or trigger via CLI (if needed)
```bash
docker exec -it dagster dagster asset materialize -m repo -a source1 source2 source3 load_to_postgres run_dbt
```

