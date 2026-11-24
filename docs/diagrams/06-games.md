# games (Go)

The games database. Stores games (PGN plus indexed fields), imports games by username from Chess.com and Lichess, searches them, and computes opening-explorer statistics (most played moves per position).
Owns: games, import jobs, position stats (key = EPD).
Events in: import.requested, review.completed. Events out: game.saved, game.imported. Milestones: M8 (games and import), M12 (explorer).

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  subgraph GAM["games"]
    API["REST API<br/>save · search · stats"]
    WK["import worker"]
    EX["explorer stats<br/>EPD to move counts"]
  end
  DB[("PostgreSQL<br/>games")]
  RD[("Redis<br/>stats cache")]
  MQ{{"RabbitMQ"}}
  LI["Lichess API"]
  CC["Chess.com API"]
  REV["review"]
  GW --> API
  API --> DB
  API --> EX
  EX --> DB
  EX --> RD
  API -.->|"import.requested"| MQ
  MQ -.-> WK
  WK --> LI
  WK --> CC
  WK --> DB
  WK -.->|"game.imported"| MQ
  MQ -.->|"review.completed"| API
  REV -->|"GET game"| API
  class GW,API,WK,EX,REV svc
  class DB,RD db
  class MQ mq
  class LI,CC ext
```

```mermaid
flowchart TB
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  Q["Position in the explorer panel"] --> K["Key = EPD<br/>FEN without move clocks"]
  K --> H{"Redis hit?"}
  H -->|yes| R["Return stats"]
  H -->|no| S["Query position_stats in Postgres"]
  S --> M["Merge: Lichess dump stats + the player's own games"]
  M --> W["Write to Redis with TTL"]
  W --> R
  class Q,K,S,M,W,R svc
  class H mq
```

