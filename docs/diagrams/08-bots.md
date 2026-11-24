# bots (FastAPI)

Practice opponents. A roster of named bots with a target strength and style. Given a position and the clocks, returns the bot's move. Uses an opening book first, then asks analysis for a move at the bot's strength, and adds a human-like delay.
Owns: roster (versioned config), opening books. No database in the first version; game state lives in the client and the games service.
Milestone: M10.

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  subgraph BOT["bots"]
    API["REST API<br/>roster · move"]
    BK["opening book<br/>Polyglot file"]
    ST["strength policy<br/>Elo to skill · time · blunder rate"]
    API --> BK
    API --> ST
  end
  CFG[("roster.yaml<br/>versioned config")]
  ANA["analysis"]
  GW --> API
  API --> CFG
  ST -->|"position + strength options"| ANA
  class GW,API,BK,ST,ANA svc
  class CFG db
```

```mermaid
flowchart TB
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  A["POST /v1/bots/{id}/move<br/>FEN + move list + clocks"] --> B{"In opening book?"}
  B -->|yes| C["Pick a weighted book move"]
  B -->|no| D["Ask analysis at bot strength"]
  D --> E["Apply policy:<br/>occasional inaccuracy for lower Elo"]
  C --> F["Add think delay by clock"]
  E --> F
  F --> G["Return move"]
  class A,C,D,E,F,G svc
  class B mq
```

