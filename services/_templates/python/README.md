# Python service template (FastAPI)

Copy this folder to create a Python service (`review`, `bots`, `coach`). It implements `contracts/openapi/_template.yaml`. The package is always called `service`, so a copy needs no renaming inside the code.

**What you get:** `/health/live`, `/health/ready` (checks Postgres), `/metrics` (Prometheus), JSON logs with `trace_id`, W3C trace propagation (OpenTelemetry, OTLP export when configured), RFC 9457 problems for every error (validation errors are 400), SQLAlchemy async + psycopg 3, Alembic migrations, UUIDv7 ids, a non-root image with a health check, and an integration test on real Postgres (Testcontainers). Tooling: uv, ruff, mypy strict, pytest.

## Create a service from it
1. Write `contracts/openapi/<name>.yaml` first.
2. `cp -r services/_templates/python services/<name>`; set `name` in `pyproject.toml`, `SERVICE_NAME` and `PORT`.
3. Replace `service/items.py` and `migrations/versions/` with the service's own.
4. Add it to `infra/compose/docker-compose.yml` (profile `full`), its database to `SERVICE_DATABASES`, and its path to CI.

## Run
- Native: `make infra` at the root, then `make dev S=python` (reads `.env`, else `.env.example`).
- Docker: `make smoke` at the root.

## Env vars
| Var | Default | |
| --- | --- | --- |
| `SERVICE_NAME` | `template-py` | log and trace name |
| `PORT` | `8102` | |
| `DATABASE_URL` | (required) | `postgresql+psycopg://…` |
| `MIGRATE_ON_START` | `false` | dev only; production runs migrations as a release step |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | export spans over OTLP/HTTP when set |

## Test
`make check`: ruff format and lint, mypy strict, pytest (Docker needed for Testcontainers).
