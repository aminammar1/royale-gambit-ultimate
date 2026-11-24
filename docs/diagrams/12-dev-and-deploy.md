# Local development and delivery

How the system runs on your machine (Docker Compose) and how a change reaches production (v2.0). Everything backend runs in Docker: `make up` starts infra and services, `make watch` rebuilds on change, `make check-svc S=<name>` tests inside the service's toolchain image. Only the desktop app runs on the host.

```mermaid
flowchart TB
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  subgraph HOST["Your computer"]
    DESK["Desktop app<br/>pnpm tauri:dev"]
    subgraph COMPOSE["docker compose · make up"]
      GW["gateway :8080"]
      S1["auth-profile"]
      S2["puzzles"]
      S3["learn"]
      S4["games"]
      S5["analysis"]
      S6["bots"]
      S7["review"]
      PG[("postgres<br/>one database per service")]
      RD[("redis")]
      MQ{{"rabbitmq<br/>management UI :15672"}}
      MH["mailhog<br/>catches sign-in emails :8025"]
      OBS["profile obs:<br/>OpenTelemetry · Jaeger · Prometheus · Grafana"]
    end
  end
  DESK -->|"http://localhost:8080"| GW
  GW --> S1 & S2 & S3 & S4 & S5 & S6 & S7
  S1 --> MH
  class DESK cli
  class GW,S1,S2,S3,S4,S5,S6,S7,OBS svc
  class PG,RD db
  class MQ mq
```

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  P["git push"] --> F["CI: detect changed paths"]
  F --> T["per-service: lint · unit tests · contract check"]
  T --> I["build image"]
  I --> S["compose smoke test<br/>all services + health checks"]
  S --> R["push image to registry"]
  R --> ST["deploy to staging"]
  ST --> PR["manual approval"]
  PR --> PROD["deploy to production"]
  class P,F,T,I,S,R,ST,PR,PROD svc
```

