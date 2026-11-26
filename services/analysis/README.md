# analysis (Go + Gin)

Stockfish as a service (M4): a pool of engine processes behind `POST /v1/analysis/positions` (live
priority) and `POST /v1/analysis/batch` (batch priority), as JSON or server-sent events. Scores leave
here from **White's** point of view. Results are cached in Redis per engine version, EPD, depth and
MultiPV. Contract: `contracts/openapi/analysis.yaml`. Parsing fixtures: `contracts/fixtures/uci/`.

**Engine:** the official Stockfish 19 release (`stockfish-linux-x86-64-universal`), downloaded in the
Dockerfile with a pinned SHA-256. The service refuses to start if the binary reports another version.
To upgrade, change the tag, digest and `ENGINE_VERSION` in the Dockerfile.

**This is the reference Go service** (ADR-12): the Go template was retired once it was built. For a new
Go service, copy this folder and drop `internal/engine`, `internal/pool`, `internal/uci` and the
Stockfish stage of the Dockerfile.

## Run (Docker only)
`make up` at the root starts it with Redis on `localhost:8084`, behind the gateway at `/v1/analysis`.

```sh
curl -s localhost:8084/v1/analysis/positions -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":12}'
curl -sN -H 'Accept: text/event-stream' localhost:8084/v1/analysis/positions -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":20}'
```

## Env vars
| Var | Default | |
| --- | --- | --- |
| `PORT` | `8084` | |
| `REDIS_URL` | (required) | `redis://host:6379/0` |
| `ENGINE_POOL_SIZE` | `2` | engines, and positions of one batch searched at once |
| `ENGINE_THREADS` | `1` | threads per engine; pool × threads should not pass the container's CPUs |
| `ENGINE_HASH_MB` | `64` | hash per engine |
| `QUEUE_LIMIT` | `500` | jobs waiting per priority before 503 `engine-busy` |
| `SEARCH_LIMIT_MS` | `20000` | cap on one depth search (the gateway allows 30 s); a capped result is not cached |
| `CACHE_TTL` | `168h` | |
| `ENGINE_PATH` | `/usr/local/bin/stockfish` | |
| `ENGINE_VERSION` | set by the image | the version the binary must report |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | export spans over OTLP/HTTP when set |

## Test
`make check-svc S=analysis` (root) runs gofmt, `go vet` and `go test -race` in the Dockerfile's
`toolchain` stage, which holds the real Stockfish: parser fixtures, position checks against the shared
PGNs, engine stop/crash/no-zombie tests, pool priority and load, Redis through Testcontainers.
