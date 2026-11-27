-- The games service's tables (M8). One database, owned by the games role (ADR-06).

-- Trigram search over players, opening and event; trusted, so the database owner may add it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Each player's own games. A game is unique per owner by its hash (pgn.Game.Hash).
CREATE TABLE games (
    id            uuid PRIMARY KEY,
    owner_id      uuid        NOT NULL,
    game_hash     text        NOT NULL,
    source        text        NOT NULL CHECK (source IN ('lichess', 'chesscom', 'pgn')),
    import_job_id uuid,
    site_url      text,
    white         text        NOT NULL,
    black         text        NOT NULL,
    white_elo     integer,
    black_elo     integer,
    result        text        NOT NULL CHECK (result IN ('1-0', '0-1', '1/2-1/2', '*')),
    played_at     timestamptz,
    event         text,
    time_control  text,
    eco           text,
    opening       text,
    ply_count     integer     NOT NULL,
    first_moves   text        NOT NULL,
    pgn           text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    -- Newest first: when it was played, else when it was saved.
    sort_at       timestamptz GENERATED ALWAYS AS (coalesce(played_at, created_at)) STORED,
    search_text   text        GENERATED ALWAYS AS (
        lower(white || ' ' || black || ' ' || coalesce(opening, '') || ' ' || coalesce(event, ''))
    ) STORED,
    UNIQUE (owner_id, game_hash)
);
CREATE INDEX games_owner_recent ON games (owner_id, sort_at DESC, id DESC);
CREATE INDEX games_owner_white ON games (owner_id, lower(white));
CREATE INDEX games_owner_black ON games (owner_id, lower(black));
CREATE INDEX games_owner_eco ON games (owner_id, eco text_pattern_ops);
CREATE INDEX games_search ON games USING gin (search_text gin_trgm_ops);

CREATE TABLE import_jobs (
    id          uuid PRIMARY KEY,
    owner_id    uuid        NOT NULL,
    site        text        NOT NULL CHECK (site IN ('lichess', 'chesscom')),
    username    text        NOT NULL,
    max_games   integer     NOT NULL,
    status      text        NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
    fetched     integer     NOT NULL DEFAULT 0,
    saved       integer     NOT NULL DEFAULT 0,
    duplicates  integer     NOT NULL DEFAULT 0,
    error       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
-- One live import per owner, site and username: asking again returns it.
CREATE UNIQUE INDEX import_jobs_active ON import_jobs (owner_id, site, lower(username))
    WHERE status IN ('queued', 'running');

-- Events written with the change that causes them, published to RabbitMQ by the relay.
CREATE TABLE outbox (
    id           uuid PRIMARY KEY,
    type         text        NOT NULL,
    envelope     jsonb       NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL;

-- Events this service has consumed, so a redelivery is not handled twice.
CREATE TABLE processed_events (
    id           uuid PRIMARY KEY,
    processed_at timestamptz NOT NULL DEFAULT now()
);
