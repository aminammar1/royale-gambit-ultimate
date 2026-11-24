# Desktop client

Local-first: the board, local games, local engine analysis, settings and the local profile all work with no network. Everything shared (review, puzzles, library, bots, accounts) goes through the gateway.
Owner milestones: M0 to M3 (local core), then each feature as its service lands.

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  subgraph UI["React + TypeScript · Vite"]
    FEAT["features/<br/>game · analysis · review · puzzles<br/>library · bots · learn · settings · profile"]
    CHESS["chess/<br/>chess.js · PGN · notation<br/>no React · no Tauri"]
    API["api/<br/>generated REST client<br/>token · retry · offline queue"]
    ENG["engine/ + db/<br/>typed Tauri invoke clients"]
    FEAT --> CHESS
    FEAT --> API
    FEAT --> ENG
  end
  subgraph CORE["Rust core · src-tauri"]
    EM["EngineManager<br/>UCI over stdin/stdout"]
    SQL[("SQLite<br/>local games · settings<br/>outbox · cache")]
    KEY["OS keychain<br/>refresh token"]
  end
  SF["Stockfish sidecar"]
  GW["gateway"]
  ENG -->|"IPC commands + events"| EM
  ENG -->|"IPC"| SQL
  API -->|"token via IPC"| KEY
  EM --> SF
  API -->|"HTTPS"| GW
  class GW svc
  class SQL db
  class SF ext
```

```mermaid
sequenceDiagram
  autonumber
  participant U as Player
  participant F as Feature (UI)
  participant A as api client
  participant O as Outbox (SQLite)
  participant G as Gateway
  U->>F: save a game
  F->>O: write locally first
  F-->>U: saved (works offline)
  A->>G: POST /v1/games (when online)
  alt network or 5xx
    G--xA: error
    A->>O: keep, retry with backoff
  else accepted
    G-->>A: 201 + server id
    A->>O: mark synced
  end
```

