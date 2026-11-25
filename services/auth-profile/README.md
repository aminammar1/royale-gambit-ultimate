# auth-profile

Who you are, and your profile (Spring Boot, Java 25 LTS). Contract: `contracts/openapi/auth-profile.yaml`. Port 8081.

Work in progress for P2; this README is completed with the service.

## Run and test (Docker only)
- `make up` at the root starts it with Postgres, RabbitMQ and Mailpit.
- `make check-svc S=auth-profile` runs format check, unit and integration tests (Testcontainers).
- `make fmt-svc S=auth-profile` applies the formatter.
