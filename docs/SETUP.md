# Setup: toolchain

Latest stable of everything (ADR-17); Java uses the latest LTS. Exact versions are pinned in lockfiles. This file records what was installed on the dev machine (Arch Linux) and how.

| Tool | Used for | Install (Arch) |
| --- | --- | --- |
| git, make, gh | repo, tasks, GitHub | `pacman -S git make github-cli` |
| Docker + Compose | infra containers, `make up` | `pacman -S docker docker-compose` (start the daemon, add yourself to the `docker` group) |
| Go | gateway, puzzles, learn, games, analysis | `pacman -S go` |
| JDK 25 LTS + Maven | auth-profile (Spring Boot) | `pacman -S jdk25-openjdk maven` (then `archlinux-java set java-25-openjdk`) |
| Python + uv | bots, review, coach | `pacman -S python uv` (uv installs the exact Python per project) |
| Node + pnpm | desktop web layer | `pacman -S nodejs npm`, then `npm install -g --prefix ~/.local pnpm` (or `pacman -S pnpm`) |
| Rust (rustup) | Tauri core, engine manager | official installer from rustup.rs, default profile (includes clippy, rustfmt); add `~/.cargo/bin` to PATH |
| Tauri Linux libraries | desktop build | `pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl libayatana-appindicator librsvg xdotool` |

Docker Compose profiles: `infra` (Postgres, Redis, RabbitMQ, MailHog) and `full` (plus all services); `obs` is optional. See ADR-18.

## Installed on 2026-11-24
Go 1.27.4 · Docker 29.10 + Compose 5.8 · Node 26.13 · pnpm 12.23 · Rust 1.100 (clippy 0.1.100) · Python 3.14.10 · uv 0.13.9 · make 4.4. JDK 25 LTS and Maven still need `sudo pacman -S jdk25-openjdk maven xdotool`.
