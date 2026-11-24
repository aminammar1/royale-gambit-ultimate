# System architecture

Everything the product is made of. The desktop app talks only to the gateway. Services own their data, call each other over REST for questions and use RabbitMQ events for things that happened.
Legend: black = client, cream = service, grey cylinder = data store, red outline = message broker, dashed = outside world.

```mermaid
flowchart TB
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  subgraph CLIENT["Desktop app · Tauri 2"]
    direction LR
    UI["React UI<br/>Newsprint design"]
    RUST["Rust core<br/>SQLite · Stockfish sidecar"]
    UI --- RUST
  end
  GW["gateway · Go + Gin<br/>JWT check · rate limit · routing"]
  subgraph SVC["Services · each owns its data · talk over REST and events"]
    direction LR
    AUTH["auth-profile<br/>Spring Boot"]
    PUZ["puzzles<br/>Go + Gin"]
    LRN["learn<br/>Go + Gin"]
    GAM["games<br/>Go"]
    ANA["analysis<br/>Go + Gin<br/>Stockfish pool"]
    BOT["bots<br/>FastAPI"]
    REV["review<br/>FastAPI"]
    COA["coach<br/>FastAPI · later"]
    REV -->|"evals"| ANA
    BOT -->|"moves"| ANA
    REV -->|"game"| GAM
    COA -->|"history"| REV
  end
  subgraph INFRA["Shared infrastructure"]
    direction LR
    PG[("PostgreSQL<br/>one database per service")]
    RD[("Redis<br/>cache · rate limits")]
    MQ{{"RabbitMQ<br/>events and jobs"}}
  end
  subgraph WORLD["Outside world"]
    direction LR
    LI["Lichess"]
    CC["Chess.com"]
    SMTP["Email SMTP"]
    LLM["LLM API"]
    YT["YouTube"]
  end
  CLIENT ==>|"HTTPS REST + SSE"| GW
  CLIENT -.->|"video embed"| YT
  GW ==>|"/v1/*"| SVC
  SVC --> PG
  SVC --> RD
  SVC -.->|"events"| MQ
  AUTH -.-> SMTP
  AUTH -.-> LI
  AUTH -.-> CC
  GAM -.-> LI
  GAM -.-> CC
  COA -.-> LLM
  class UI,RUST cli
  class GW,AUTH,PUZ,LRN,GAM,ANA,BOT,REV,COA svc
  class PG,RD db
  class MQ mq
  class LI,CC,YT,SMTP,LLM ext
```

