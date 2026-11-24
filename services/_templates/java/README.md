# Java service template (Spring Boot)

Copy this folder to create a Spring Boot service (only `auth-profile`, ADR-12). It implements `contracts/openapi/_template.yaml`. Java 25 LTS, Spring Boot 4, Maven wrapper (no system Maven needed).

**What you get:** `/health/live` and `/health/ready` (actuator probe groups; ready includes the database), `/metrics` (Prometheus), structured JSON logs with `trace_id` (logstash format), W3C tracing through Micrometer + OpenTelemetry, RFC 9457 problems for every error with `type` and `trace_id`, strict JSON input (unknown fields and non-string names rejected), JdbcClient, Flyway migrations, UUIDv7 ids, virtual threads, a non-root image with a health check, and an integration test on real Postgres (Testcontainers).

## Create a service from it
1. Write `contracts/openapi/<name>.yaml` first.
2. `cp -r services/_templates/java services/<name>`; set `artifactId` and `name` in `pom.xml`, `SERVICE_NAME` and `PORT`.
3. Replace `items/` and `db/migration/` with the service's own.
4. Add it to `infra/compose/docker-compose.yml` (profile `full`), its database to `SERVICE_DATABASES`, and its path to CI.

## Run (Docker only)
- `make up PROFILES=templates` at the root starts it with Postgres; `make smoke` also checks the contract.
- `make check-svc S=java` runs the checks inside the `toolchain` stage of the Dockerfile.

## Env vars
| Var | Default | |
| --- | --- | --- |
| `SERVICE_NAME` | `template-java` | log and trace name |
| `PORT` | `8103` | |
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | (required) | `jdbc:postgresql://…` |
| `MIGRATE_ON_START` | `false` | dev only; production runs Flyway as a release step |
| `MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT` | unset | full OTLP/HTTP traces URL, e.g. `http://localhost:4318/v1/traces` |

## Test
`make check-svc S=java` (root) runs `make check` = `./mvnw verify`: Spring Java Format check, compile, unit and integration tests (Docker needed). `make fmt` fixes formatting.
