# review (FastAPI)

Post-game review. Takes a PGN or a game id, asks analysis for every position, converts evaluations to win probability, classifies each move (inaccuracy, mistake, blunder), computes accuracy per side and picks key moments. Runs as an asynchronous job with progress.
Owns: reviews, review jobs. Events in: review.requested. Events out: review.completed.
Milestone: M5.

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  subgraph REV["review"]
    API["REST API<br/>create job · status · result · SSE"]
    WK["worker<br/>consumes review.requested"]
    MATH["review math<br/>win % · accuracy · classes · key moments"]
    API --> WK --> MATH
  end
  DB[("PostgreSQL<br/>reviews")]
  MQ{{"RabbitMQ"}}
  ANA["analysis"]
  GAM["games"]
  COA["coach"]
  GW --> API
  API --> DB
  API -.->|"review.requested"| MQ
  MQ -.-> WK
  WK -->|"positions batch"| ANA
  WK -->|"load game"| GAM
  MATH --> DB
  WK -.->|"review.completed"| MQ
  COA -->|"history"| API
  class GW,API,WK,MATH,ANA,GAM,COA svc
  class DB db
  class MQ mq
```

```mermaid
stateDiagram-v2
  [*] --> Queued: POST /v1/reviews returns 202
  Queued --> Analyzing: worker picks the job
  Analyzing --> Analyzing: next position (progress %)
  Analyzing --> Scoring: all positions done
  Scoring --> Done: stored + review.completed
  Analyzing --> Cancelled: DELETE /v1/reviews/{id}
  Analyzing --> Failed: analysis unavailable (retry x3)
  Done --> [*]
```

