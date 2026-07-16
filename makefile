.PHONY: up down logs ps psql dbt-compile-restart reset-dev-postgres test

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
