# Go service template (Go + Gin)

Copy this folder to create a Go service (`gateway`, `puzzles`, `learn`, `games`, `analysis`). It implements `contracts/openapi/_template.yaml`.

**What you get:** `/health/live`, `/health/ready` (pings Postgres), `/metrics` (Prometheus), JSON logs (`log/slog`) with `trace_id`, W3C trace propagation (OpenTelemetry, OTLP export when configured), RFC 9457 problems, pgx + sqlc, golang-migrate (embedded), distroless non-root image with a health check, and an integration test on real Postgres (Testcontainers).

## Create a service from it
1. Write `contracts/openapi/<name>.yaml` first.
2. `cp -r services/_templates/go services/<name>`; change the module path in `go.mod` and imports; set `SERVICE_NAME` and `PORT`.
3. Replace `internal/items`, `queries/` and `migrations/` with the service's own; run `make sqlc`.
4. Add it to `infra/compose/docker-compose.yml` (profile `full`), its database to `SERVICE_DATABASES`, and its path to CI.

## Run
- Native: `make infra` at the root, then `make dev S=go` (reads `.env`, else `.env.example`).
- Docker: `make smoke` at the root.

## Env vars
| Var | Default | |
| --- | --- | --- |
| `SERVICE_NAME` | `template-go` | log and trace name |
| `PORT` | `8101` | |
| `DATABASE_URL` | (required) | `postgres://…` |
| `MIGRATE_ON_START` | `false` | dev only; production runs migrations as a release step |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | export spans over OTLP/HTTP when set |

## Test
`make check`: gofmt, `go vet`, `go test -race` (Docker needed for Testcontainers).
