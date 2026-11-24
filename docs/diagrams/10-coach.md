# coach (FastAPI, later)

Personalized advice. Builds a profile of the player's recurring mistakes from reviews, puzzles and games, then writes a short weekly plan and explanations. Stockfish facts come from the other services; the language model only explains, and every claim must cite a game and a move.
Owns: weakness stats, advice, weekly plans, usage and cost counters. Events in: review.completed, puzzle.attempted.
Milestone: M17.

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  subgraph COA["coach"]
    API["REST API<br/>advice · plan"]
    AGG["weakness aggregator<br/>from events"]
    WR["writer<br/>LLM with citations + cost cap"]
    API --> WR
    AGG --> WR
  end
  DB[("PostgreSQL<br/>coach")]
  MQ{{"RabbitMQ"}}
  REV["review"]
  PUZ["puzzles"]
  GAM["games"]
  LLM["LLM API"]
  GW --> API
  MQ -.->|"review.completed<br/>puzzle.attempted"| AGG
  AGG --> DB
  WR --> DB
  WR -->|"fetch cited games and moves"| REV
  WR --> PUZ
  WR --> GAM
  WR -.-> LLM
  class GW,API,AGG,WR,REV,PUZ,GAM svc
  class DB db
  class MQ mq
  class LLM ext
```

