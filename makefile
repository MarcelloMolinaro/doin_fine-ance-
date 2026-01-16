.PHONY: prod dev down down-dev logs ps \
	psql dbt-compile-restart

prod:
	docker compose --profile prod up -d

dev:
	docker compose --profile dev up -d

down:
	docker compose --profile prod down

down-dev:
	docker compose --profile dev down

ps:
	docker compose --profile prod ps

logs:
	docker compose --profile prod logs -f

psql:
	docker exec -it postgres psql -U dagster -d dagster

dbt-compile-restart:
	docker exec dagster dbt compile --project-dir /opt/dbt && \
	docker compose restart dagster
