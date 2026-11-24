# auth-profile (Spring Boot)

Who you are. Email code or link sign-in (no password), guest tokens, Lichess and Chess.com account linking, JWT issuing, and the player profile (username, country, settings, themes).
Owns: users, identities, sessions (refresh tokens), email codes, profiles, synced settings.
Events out: user.registered, profile.updated. Milestones: P2 (email, guest, profile), M11 (Lichess and Chess.com).

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  GW["gateway"]
  subgraph AUTH["auth-profile"]
    ID["identity<br/>codes · sessions · JWT"]
    OA["oauth<br/>Lichess · Chess.com"]
    PR["profile<br/>username · country · settings"]
  end
  DB[("PostgreSQL<br/>auth_profile")]
  MQ{{"RabbitMQ"}}
  SMTP["SMTP"]
  LI["Lichess OAuth"]
  CC["Chess.com OAuth"]
  GW --> ID
  GW --> PR
  GW --> OA
  ID --> DB
  PR --> DB
  OA --> DB
  ID -.->|"send code"| SMTP
  OA -.-> LI
  OA -.-> CC
  ID -.->|"user.registered"| MQ
  PR -.->|"profile.updated"| MQ
  class GW,ID,OA,PR svc
  class DB db
  class MQ mq
  class SMTP,LI,CC ext
```

```mermaid
stateDiagram-v2
  [*] --> Guest: first launch
  Guest --> CodeSent: enter email
  CodeSent --> SignedIn: valid code or link
  CodeSent --> CodeSent: wrong code (limited attempts)
  Guest --> SignedIn: Lichess OAuth (M11)
  SignedIn --> SignedIn: link another identity
  SignedIn --> Guest: sign out
```

