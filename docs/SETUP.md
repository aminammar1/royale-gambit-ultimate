# Setup: toolchain

Latest stable of everything (ADR-17); Java uses the latest LTS. Exact versions are pinned in lockfiles. Backend services run, build and test **only in Docker** (ADR-18), so their toolchains (Go, JDK, Python/uv) live in each service's Dockerfile, not on the host.

| Tool | Used for | Install (Arch) |
| --- | --- | --- |
| Docker + Compose | every backend service, infra, checks | `pacman -S docker docker-compose` (start the daemon, add yourself to the `docker` group) |
| git, make, gh | repo, tasks, GitHub | `pacman -S git make github-cli` |
| Node + pnpm | desktop web layer (M0) | `pacman -S nodejs npm`, then `npm install -g --prefix ~/.local pnpm` |
| Rust (rustup) | desktop Rust core (M0) | official installer from rustup.rs (default profile includes clippy, rustfmt) |
| Tauri Linux libraries | desktop build (M0) | `pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl libayatana-appindicator librsvg xdotool` |

Toolchains pinned in Dockerfiles (latest stable on 2026-11-25): Go 1.27.4, Python 3.15.2 with uv 0.13.9, Temurin JDK 25 LTS; infra images Postgres 19, Redis 8.8, RabbitMQ 4.4, Mailpit 1.34.

Compose profiles: none (infra only), `full` (all services), `templates` (the three templates, for `make smoke` and CI), `obs` (OpenTelemetry collector, Jaeger, Prometheus, Grafana).

## Real email in dev

Sign-in codes go to **Mailpit** by default: open http://localhost:8025 to read them. Nothing reaches a real inbox. To send real mail from your machine, put an SMTP server in `.env` (never in `.env.example`), then `make up`:

```
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_STARTTLS=true
MAIL_USER=you@gmail.com
MAIL_PASSWORD=<a Gmail app password: Google account → Security → App passwords>
MAIL_FROM=Royal Gambit <you@gmail.com>
```

Remove those lines to go back to Mailpit.
