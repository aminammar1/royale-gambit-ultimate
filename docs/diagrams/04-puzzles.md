# puzzles (Go + Gin)

Tactics training. Serves puzzles by rating and theme, checks attempts, keeps the player's puzzle rating, picks the daily puzzle, and holds kits (and kids puzzles in M15).
Owns: puzzles (imported from the Lichess subset), kits, attempts, puzzle ratings.
Events in: user.registered. Events out: puzzle.attempted. Milestone: M6.

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  subgraph PUZ["puzzles"]
    API["REST API<br/>next · attempt · daily · kits"]
    RT["rating<br/>Glicko-lite"]
    IMP["importer<br/>Lichess CSV subset"]
  end
  DB[("PostgreSQL<br/>puzzles")]
  MQ{{"RabbitMQ"}}
  COA["coach"]
  GW --> API
  API --> RT
  API --> DB
  RT --> DB
  IMP --> DB
  MQ -.->|"user.registered"| RT
  API -.->|"puzzle.attempted"| MQ
  COA -->|"history"| API
  class GW,API,RT,IMP,COA svc
  class DB db
  class MQ mq
```

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant P as puzzles
  C->>P: GET /v1/puzzles/next?theme=fork
  P-->>C: puzzle (FEN, setup move, rating band)
  Note over C: opponent setup move auto-plays,<br/>player solves locally with chess.js
  C->>P: POST /v1/puzzles/{id}/attempts (moves, time, hints)
  P->>P: validate solution, update rating
  P-->>C: result + new rating
```

