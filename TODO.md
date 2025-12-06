# TODOs

- Delete committed artifacts/logs and tighten `.gitignore`
- Add a Databricks source integration and test end-to-end
- Build Python models to pull data from SimpleFIN
- Enable dbt <> dagster connection so I don't need to define each source? I haven't built any of this out yet
- Stop truncating source tables and start inserting/appending (especially finance data!)

- Create a config files that manages all secrets, passwords, etc.
- Move profiles OUT of dbt or stop tracking it, or both

## Testing SimpleFIN Extractor (simplefin_api.py)

### Testing the Extractor in Docker Container

You can test the extractor directly in the Dagster container without running the full Dagster UI:

**Option 1: Run directly in the container**
```bash
# Make sure your container is running
docker-compose up -d

# Run the extractor with environment variable
docker-compose exec -e SIMPLEFIN_ACCESS_URL="https://username:password@bridge.simplefin.org/simplefin" dagster python /opt/dagster/app/extractors/simplefin_api.py
```

**Option 2: Add environment variable to docker-compose.yml**
Add to the `dagster` service environment section:
```yaml
environment:
  DAGSTER_HOME: /opt/dagster/app
  DBT_PROFILES_DIR: /opt/dbt
  SIMPLEFIN_ACCESS_URL: "https://username:password@bridge.simplefin.org/simplefin"
```

Then run:
```bash
docker-compose exec dagster python /opt/dagster/app/extractors/simplefin_api.py
```

**Option 3: Interactive shell in container**
```bash
# Get a shell in the container
docker-compose exec dagster bash

# Inside the container, set the environment variable and run
export SIMPLEFIN_ACCESS_URL="https://username:password@bridge.simplefin.org/simplefin"
python /opt/dagster/app/extractors/simplefin_api.py
```

### Testing the Extractor in Dagster UI

1. **Add the asset to repo.py**:
   - Import: `from extractors.simplefin_api import simplefin_financial_data`
   - Add to `all_assets` list: `all_assets = [source1, source2, source3, weather_source, simplefin_financial_data, load_to_postgres, run_dbt]`

2. **Run Dagster and test the asset**:
   ```bash
   dagster dev
   ```
   - Navigate to the Dagster UI (usually http://localhost:3000)
   - Find the `simplefin_financial_data` asset
   - Click "Materialize" to run it

3. **Verify the output**:
   - Check that the asset materializes successfully
   - View the output DataFrame in the Dagster UI
   - Verify it contains:
     - Transaction data (transaction_id, amount, posted_date, description, etc.)
     - Account information merged with transactions
     - Expected columns: account_id, account_name, institution_domain, amount, posted_date, description, etc.

4. **Test with multiple accounts**:
   - SimpleFIN can return multiple accounts in a single response
   - Verify that transactions from different accounts are properly labeled

### Troubleshooting

- **Missing credentials**: Verify `SIMPLEFIN_ACCESS_URL` is set correctly
- **403 Authentication failed**: The access URL may be invalid, expired, or revoked. Generate a new SimpleFIN token
- **402 Payment required**: The SimpleFIN service may require payment (unlikely for bridge)
- **No transactions returned**: Check the date range (currently last 30 days) and verify the account has transactions in that period
- **Invalid token format**: Ensure the SimpleFIN token is properly Base64-encoded
- **Network errors**: Check your internet connection and that bridge.simplefin.org is accessible

