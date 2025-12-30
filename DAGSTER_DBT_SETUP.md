# Dagster-dbt Integration Setup

## Quick Start Commands

```bash
# 1. Rebuild just the container for dagster (dagster = ptional)
docker compose build dagster

# 2. Start everything
docker compose up -d

# 3. Generate the dbt manifest (required for dagster-dbt to work)
docker exec dagster dbt compile --project-dir /opt/dbt

# 4. Restart Dagster to load the manifest
docker compose restart dagster
```

## How It Works

The integration automatically:
- Loads all dbt models as Dagster assets
- Requires `manifest.json` to be generated first (via `dbt compile`)
- Uses `dbt build` to run models and tests
- repo.py file contains dagster jobs and dbt configurations
- If you make any changes to dbt models, you must recompile and restart
```bash
# recompile and restarts Dagster
docker exec dagster dbt compile --project-dir /opt/dbt && docker compose restart dagster
```

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

This pipeline has one incremental model: `fct_validated_trxns`. To run it with `--full-refresh`:

### Option 1: Via Dagster UI - Use the Full-Refresh Job (Recommended)
1. Go to the Jobs page in Dagster UI (http://localhost:3000)
2. Find the `full_refresh_validated_trxns` job
3. Click on the job and go to the Launchpad
4. Click "Launch Run" to execute (pre-configured for full-refresh)

### Option 2: Via Dagster UI - Materialize Asset
1. Go to the asset graph in Dagster UI (http://localhost:3000)
2. Find and select the `fct_validated_trxns` asset
3. Shift + click "Materialize" button
4. In the config panel, add the following config in the **`ops`** section:
   ```yaml
   ops:
     dbt_models:
       config:
         full_refresh: true
   ```
5. Click "Materialize" to run with full-refresh

**Note**: You can also run via CLI if you prefer. The `full_refresh` config goes under `ops.dbt_models.config`.

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
- The integration uses `dbt build` by default (runs models and tests)
