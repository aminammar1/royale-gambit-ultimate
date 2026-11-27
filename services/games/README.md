# games (Go + Gin)

Each player's games (M8): saved from PGN or imported by username from Lichess and Chess.com, and
searched. Contract: `contracts/openapi/games.yaml`. Events: `import.requested` (its own import worker's
job), `game.saved` and `game.imported`, published through an outbox.

- **Chess:** PGN is read and every move checked by `corentings/chess` (ADR-03). Openings (ECO and name)
  come from the CC0 lichess-org/chess-openings table bundled with it. Standard chess only.
- **Duplicates:** a game is unique per owner by its site id (`lichess:<id>`, `chesscom:live/<id>`) or,
  without one, by players, day and moves. Saving or importing again adds only what is new.
- **Imports:** newest first, at most 2,000 games a username. Lichess is read as NDJSON, Chess.com month by
  month; a 429 waits as the site asks. The User-Agent names the project's page (Chess.com asks for a
  contact). Progress streams over SSE (`GET /v1/imports/{id}` with `Accept: text/event-stream`).
- **Retries:** a failed import message is retried three times, then dead-lettered to
  `games.import-requested.dead`. A site that fails ends the import as `failed` with a sentence for the player.

## Run (Docker only)
`make up` at the root starts it on `localhost:8085`, behind the gateway at `/v1/games` and `/v1/imports`.
Every route needs a bearer token (a guest's is fine):

```sh
T=$(curl -s -X POST localhost:8080/v1/auth/guest | jq -r .access_token)
curl -s -H "Authorization: Bearer $T" localhost:8080/v1/imports -d '{"site":"lichess","username":"DrNykterstein","max_games":100}'
curl -sN -H "Authorization: Bearer $T" -H 'Accept: text/event-stream' localhost:8080/v1/imports/<id>
curl -s -H "Authorization: Bearer $T" 'localhost:8080/v1/games?player=DrNykterstein&result=win&limit=5'
```

## Env vars
| Var | Default | |
| --- | --- | --- |
| `PORT` | `8085` | |
| `DATABASE_URL` | (required) | `postgres://games:games@postgres:5432/games?sslmode=disable` |
| `RABBITMQ_URL` | (required) | `amqp://rg:rg@rabbitmq:5672/` |
| `JWKS_URL` | (required) | auth-profile's `/.well-known/jwks.json` |
| `JWT_ISSUER` | `royale-gambit` | |
| `MIGRATE_ON_START` | `false` | apply the migrations at start (compose: true) |
| `IMPORT_WORKERS` | `2` | imports run at once |
| `MAX_IMPORT_GAMES` | `2000` | games one import reads, at most |
| `LICHESS_URL`, `CHESSCOM_URL` | the sites | API roots |
| `USER_AGENT` | names the project page | sent to both sites |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | export spans over OTLP/HTTP when set |

## Test
`make check-svc S=games` (root) runs gofmt, `go vet` and `go test -race` in the Dockerfile's
`toolchain` stage: PGN against `contracts/fixtures/pgn/`, the sites against fake servers (429, unknown
player, variants), the store and the full import (HTTP, outbox, RabbitMQ, worker) against real Postgres
and RabbitMQ through Testcontainers, every event checked against `contracts/events/`.
