# learn (Go + Gin)

Lessons and YouTube lesson files. Serves lessons by level, tracks progress, and stores lesson files that link video timestamps to board positions (video id + list of time, FEN, note).
Owns: lessons, steps, progress, lesson files.
Events out: lesson.completed. Milestones: M13 (Learn), M14 (YouTube mode).

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  subgraph LRN["learn"]
    LS["lessons API<br/>levels · steps · progress"]
    YL["lesson files API<br/>video id + timestamps to FEN"]
  end
  DB[("PostgreSQL<br/>learn")]
  MQ{{"RabbitMQ"}}
  YT["YouTube embed<br/>in the client only"]
  GW --> LS
  GW --> YL
  LS --> DB
  YL --> DB
  LS -.->|"lesson.completed"| MQ
  YL -.->|"client plays video"| YT
  class GW,LS,YL svc
  class DB db
  class MQ mq
  class YT ext
```

