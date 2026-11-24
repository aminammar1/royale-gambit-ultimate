# gateway (Go + Gin)

Single public entry. No business logic and no database.
Does: route /v1/<service>/** · validate the JWT (JWKS from auth-profile) · rate limit per user and IP (Redis) · CORS · request id and trace headers · merge OpenAPI docs.
Port 8080. Milestone: P2.

```mermaid
flowchart LR
  classDef svc fill:#F3EFE6,stroke:#1B1A17,stroke-width:1.5px,color:#1B1A17
  classDef db fill:#E9E3D6,stroke:#57534A,color:#1B1A17
  classDef mq fill:#E9E3D6,stroke:#9E2A2B,stroke-width:1.5px,color:#1B1A17
  classDef ext fill:#FFFFFF,stroke:#BDB5A6,stroke-dasharray:4 3,color:#57534A
  classDef cli fill:#1B1A17,stroke:#1B1A17,color:#F3EFE6
  C["desktop client"]
  subgraph GW["gateway"]
    F1["1 request id + trace"]
    F2["2 JWT check<br/>cached JWKS"]
    F3["3 rate limit"]
    F4["4 route by path"]
    F1 --> F2 --> F3 --> F4
  end
  RD[("Redis<br/>counters")]
  AUTH["auth-profile<br/>/v1/auth /v1/profile"]
  PUZ["puzzles<br/>/v1/puzzles"]
  LRN["learn<br/>/v1/learn"]
  GAM["games<br/>/v1/games /v1/explorer"]
  ANA["analysis<br/>/v1/analysis"]
  BOT["bots<br/>/v1/bots"]
  REV["review<br/>/v1/reviews"]
  COA["coach<br/>/v1/coach"]
  C --> F1
  F2 -.-> AUTH
  F3 --> RD
  F4 --> AUTH & PUZ & LRN & GAM & ANA & BOT & REV & COA
  class C cli
  class GW,AUTH,PUZ,LRN,GAM,ANA,BOT,REV,COA svc
  class RD db
```

