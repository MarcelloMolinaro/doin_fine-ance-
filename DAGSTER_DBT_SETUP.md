# Dagster-dbt Integration Setup

## Quick Start Commands

```bash
# 1. Rebuild the container to install dagster-dbt
docker compose build dagster

# 2. Start everything
docker compose up -d

# 3. Generate the dbt manifest (required for dagster-dbt to work)
docker exec dagster dbt compile --project-dir /opt/dbt

# 4. Restart Dagster to load the manifest
docker compose restart dagster
```

## What Changed

1. **Dockerfile**: Added `dagster-dbt` to pip install
2. **repo.py**: Added integration code that:
   - Loads all dbt models as Dagster assets automatically
   - Requires `manifest.json` to be generated first (via `dbt compile`)
   - Falls back gracefully if manifest doesn't exist

## Verification

1. Open http://localhost:3000
2. You should see all your dbt models as individual assets
3. Each model shows dependencies based on dbt's lineage
4. You can materialize individual models or entire DAGs

## Usage

- **Materialize individual models**: Click on any dbt model asset in the UI
- **Materialize with dependencies**: Dagster automatically handles upstream dependencies
- **Mix with Python assets**: dbt models work seamlessly with your existing Python assets

## Running Full-Refresh on Incremental Models

To run an incremental dbt model with `--full-refresh`:

### Option 1: Via Dagster UI (Recommended)
1. Go to the asset graph in Dagster UI (http://localhost:3000)
2. Find and select the incremental model asset you want to refresh (e.g., `fct_validated_trxns`, `int_trxns`)
3. Click "Materialize" button
4. In the config panel that appears, you'll see a JSON config editor
5. Add the following config in the **`ops`** section (NOT in `resources`):
   ```json
   {
     "ops": {
       "all_dbt_assets": {
         "config": {
           "full_refresh": true
         }
       }
     }
   }
   ```
6. Click "Materialize" to run with full-refresh

**Important**: The `full_refresh` config goes under `ops.all_dbt_assets.config`, NOT under `resources.dbt.config`. The `resources` section is for configuring the `DbtCliResource` itself (project_dir, profiles_dir, etc.), while `ops` config is for the asset function that uses the resource.

**Note**: The `full_refresh` config applies to all selected dbt models. Since you're selecting just one model, it will only affect that model.

### Option 2: Via CLI
```bash
docker exec dagster dagster asset materialize \
  --select <your_model_name> \
  -f /opt/dagster/app/repo.py \
  -c '{"ops": {"all_dbt_assets": {"config": {"full_refresh": true}}}}'
```

**Example**: To run `fct_validated_trxns` with full-refresh:
```bash
docker exec dagster dagster asset materialize \
  --select fct_validated_trxns \
  -f /opt/dagster/app/repo.py \
  -c '{"ops": {"all_dbt_assets": {"config": {"full_refresh": true}}}}'
```

## Workflow: Adding or Editing dbt Models

**Whenever you create a new dbt model or edit an existing one**, you need to regenerate the manifest so Dagster knows about the changes:

```bash
# 1. Regenerate the manifest (this updates manifest.json with your new/changed models)
docker exec dagster dbt compile --project-dir /opt/dbt

# 2. Restart Dagster to pick up the new manifest
docker compose restart dagster
```

**Why?** Dagster reads `manifest.json` at startup to discover which dbt models exist and understand their dependencies. Without regenerating it, Dagster won't see your new models or updated dependencies.

### Quick Reference

| Action | What to do |
|--------|------------|
| **Create new dbt model** | `dbt compile` → restart Dagster |
| **Edit existing model** (change SQL, columns, refs) | `dbt compile` → restart Dagster |
| **Add/remove dependencies** (change `ref()` or `source()`) | `dbt compile` → restart Dagster |
| **Only change model config** (not structure) | Usually no restart needed, but safe to do it anyway |

## Notes

- The manifest is in `dbt/target/manifest.json` (gitignored)
- The integration uses `dbt run` by default (you can change to `dbt build` in repo.py if you want tests)
- Your existing `run_dbt` asset still works as a fallback
