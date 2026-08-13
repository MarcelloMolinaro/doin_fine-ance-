.PHONY: up down logs ps psql dbt-compile-restart reset-dev-postgres test migration-bundle

up:
	docker compose up -d

# Stop all services
down:
	docker compose down

# Show running containers
ps:
	docker compose ps

# Follow logs
logs:
	docker compose logs -f

psql:
	docker exec -it postgres psql -U dagster -d dagster

dbt-compile-restart:
	docker exec dagster dbt compile --project-dir /opt/dbt && \
	docker compose restart dagster

# Run backend + dagster unit tests inside their containers
test:
	docker exec ui-backend python -m pytest tests -q
	docker exec dagster python -m pytest tests -q

# Danger! This will delete all data in the dev postgres database!
reset-dev-postgres:
	docker volume rm dagster_finance_pipeline_postgres_dev

# Bundle everything needed to migrate to another machine (see README → Migration).
# Output: migration_bundle/YYYYMMDD_HHMMSS/  (gitignored — safe to copy to Drive/USB)
migration-bundle:
	@set -e; \
	TS=$$(date +%Y%m%d_%H%M%S); \
	BUNDLE="migration_bundle/$$TS"; \
	mkdir -p "$$BUNDLE/backups" "$$BUNDLE/dbt/seeds" "$$BUNDLE/dagster/models" \
		"$$BUNDLE/local/dagster" "$$BUNDLE/local/jupyter"; \
	echo "Creating migration bundle at $$BUNDLE ..."; \
	if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx postgres; then \
		echo "  → fresh pg_dump"; \
		docker exec postgres pg_dump -U dagster -Fc -f - dagster > "$$BUNDLE/backups/dagster_backup_$$TS.dump"; \
	else \
		echo "  ⚠ postgres not running — skipping fresh dump"; \
		if ls backups/*.dump >/dev/null 2>&1; then \
			cp backups/*.dump "$$BUNDLE/backups/"; \
			echo "  → copied existing backups/*.dump"; \
		else \
			echo "  ✗ no backup found — run 'make up' and retry, or create a backup in the UI first"; \
			exit 1; \
		fi; \
	fi; \
	for f in .env config.yaml; do \
		if [ -f "$$f" ]; then cp "$$f" "$$BUNDLE/"; echo "  → $$f"; \
		else echo "  ⚠ missing $$f (copy manually if you use it)"; fi; \
	done; \
	for f in dbt/seeds/historic_transactions.csv \
		dbt/seeds/seed_account_mapping_simplefin.csv \
		dbt/seeds/seed_account_mapping_historic.csv \
		dbt/seeds/seed_transaction_exclusions.csv; do \
		if [ -f "$$f" ]; then cp "$$f" "$$BUNDLE/dbt/seeds/"; echo "  → $$f"; fi; \
	done; \
	if ls dagster/models/*.pkl >/dev/null 2>&1; then \
		cp dagster/models/*.pkl "$$BUNDLE/dagster/models/"; \
		echo "  → dagster/models/*.pkl"; \
	else echo "  ⚠ no model .pkl files (you can retrain after restore)"; fi; \
	if [ -f dagster/classifier_train.py ]; then \
		cp dagster/classifier_train.py "$$BUNDLE/local/dagster/classifier_train.py"; \
		if git diff --quiet -- dagster/classifier_train.py 2>/dev/null; then \
			echo "  → local/dagster/classifier_train.py (matches git — no personal edits)"; \
		else \
			echo "  → local/dagster/classifier_train.py (includes your personal training filters)"; \
		fi; \
	fi; \
	if [ -d jupyter/notebooks ]; then \
		cp -R jupyter/notebooks/. "$$BUNDLE/local/jupyter/notebooks/"; \
		echo "  → local/jupyter/notebooks/ (your analysis notebooks)"; \
	fi; \
	printf '%s\n' \
		"Migration bundle — $$(date)" \
		"" \
		"Restore on the new machine:" \
		"  1. Clone this repo and run: make up" \
		"  2. Copy .env and config.yaml to the project root" \
		"  3. Copy dbt/seeds/*.csv into dbt/seeds/" \
		"  4. Copy dagster/models/*.pkl into dagster/models/ (if present)" \
		"  5. Personal customizations (if present in local/):" \
		"       cp local/dagster/classifier_train.py dagster/classifier_train.py" \
		"       cp -R local/jupyter/notebooks/. jupyter/notebooks/" \
		"     (If the repo has newer shared code, merge classifier_train.py by hand instead of blind overwrite.)" \
		"  6. Restore DB: Backup tab → Restore, or:" \
		"       pg_restore -h localhost -U dagster -d dagster -c backups/dagster_backup_*.dump" \
		"" \
		"See README → Migration for full steps." \
		> "$$BUNDLE/README.txt"; \
	echo ""; echo "Done → $$BUNDLE"; \
	du -sh "$$BUNDLE" | awk '{print "Size: " $$1}'
