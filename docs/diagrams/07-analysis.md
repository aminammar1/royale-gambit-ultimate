# analysis (Go + Gin)

A pool of Stockfish processes behind an API. Answers "evaluate this position" for other services and for clients without a local engine. Caches results per position so the same position is never analyzed twice at the same depth.
Owns: nothing permanent. Redis cache key: EPD + depth + multipv + engine version.
Called by: review, bots, (coach, mobile later). Milestone: M4.

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  REV["review"]
  BOT["bots"]
  subgraph ANA["analysis"]
    API["REST + SSE<br/>POST positions · stream"]
    Q["job queue<br/>priority: live over batch"]
    P["Stockfish pool<br/>N processes · UCI"]
    API --> Q --> P
  end
  RD[("Redis<br/>result cache")]
  GW --> API
  REV -->|"batch of positions"| API
  BOT -->|"one position, strength options"| API
  API <--> RD
  class GW,REV,BOT,API,Q,P svc
  class RD db
```

```mermaid
sequenceDiagram
  autonumber
  participant R as review
  participant A as analysis API
  participant C as Redis
  participant P as Stockfish pool
  R->>A: POST /v1/analysis/batch (40 positions, depth 18)
  loop each position
    A->>C: GET key (EPD, depth, multipv, engine version)
    alt cached
      C-->>A: result
    else miss
      A->>P: go depth 18 (UCI)
      P-->>A: info + bestmove
      A->>C: SET result
    end
  end
  A-->>R: results (scores normalized to White)
```

