# Royale Gambit Ultimate: root tasks. See CLAUDE.md and ADR-18.
SHELL := /bin/bash
COMPOSE := docker compose --env-file .env -f infra/compose/docker-compose.yml
# Every service folder that has a Makefile: real services and the language templates.
SERVICES := $(patsubst %/Makefile,%,$(wildcard services/*/Makefile services/_templates/*/Makefile))
# S=<name> resolves to services/<name>, or services/_templates/<name> for templates (S=go|python).
svc = $(firstword $(wildcard services/$(S) services/_templates/$(S)))

.PHONY: help env infra up watch down logs check check-svc fmt-svc check-desktop smoke ps clean

help:
	@grep -E '^## ' Makefile | sed 's/## //'

## env            create .env from .env.example (once)
env: .env
.env:
	cp .env.example .env

## infra          only postgres, redis, rabbitmq, mailpit (no services)
# `up --wait` reads a one-shot container's exit as a failure when nothing depends on it, so the
# database init runs on its own once the stores are healthy.
infra: .env
	$(COMPOSE) up -d --wait postgres redis rabbitmq mailpit
	$(COMPOSE) run --rm postgres-init

## up             infra + every service in Docker (PROFILES="full obs" to add observability)
PROFILES ?= full
up: .env
	$(COMPOSE) $(addprefix --profile ,$(PROFILES)) up -d --build --wait
	@$(COMPOSE) ps --format 'table {{.Service}}\t{{.Status}}'

## watch          like up, and rebuild a service container when its files change
watch: .env
	$(COMPOSE) $(addprefix --profile ,$(PROFILES)) watch

## down           stop everything
down: .env
	$(COMPOSE) --profile '*' down

## logs S=<svc>   follow logs of one compose service
logs: .env
	$(COMPOSE) --profile '*' logs -f $(S)

## ps             list running containers
ps: .env
	$(COMPOSE) --profile '*' ps

## check          every check (all services + desktop)
check: $(addprefix check-,$(SERVICES)) check-desktop
check-services/%:
	@$(MAKE) --no-print-directory in-toolchain DIR=services/$*

## check-svc S=<svc>   one service's checks
check-svc:
	@test -n "$(svc)" || { echo "unknown service S=$(S)"; exit 1; }
	@$(MAKE) --no-print-directory in-toolchain DIR=$(svc)

## fmt-svc S=<svc>     apply the service's formatter (same toolchain image as the checks)
fmt-svc:
	@test -n "$(svc)" || { echo "unknown service S=$(S)"; exit 1; }
	@$(MAKE) --no-print-directory in-toolchain DIR=$(svc) TARGET=fmt

# Runs `make check` for DIR inside the `toolchain` stage of its Dockerfile (ADR-18): source
# mounted, your uid, the Docker socket shared so Testcontainers can start databases, and one
# cache volume for Go modules, uv and Maven.
TOOLCHAIN_IMAGE = rg-toolchain/$(subst _,,$(subst /,-,$(subst services/,,$(DIR))))
DOCKER_GID := $(shell stat -c %g /var/run/docker.sock 2>/dev/null)
in-toolchain:
	docker build -q --target toolchain -t $(TOOLCHAIN_IMAGE) $(DIR) >/dev/null
	docker run --rm -u 0 -v rg-cache:/cache $(TOOLCHAIN_IMAGE) sh -c 'mkdir -p /cache/home && chown -R $(shell id -u):$(shell id -g) /cache/home /cache' 
	docker run --rm -u $(shell id -u):$(shell id -g) --group-add $(DOCKER_GID) \
	  -v $(abspath $(DIR)):/src -w /src -v rg-cache:/cache \
	  -v /var/run/docker.sock:/var/run/docker.sock --add-host host.docker.internal:host-gateway \
	  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
	  -e HOME=/cache/home -e GOMODCACHE=/cache/go/mod -e GOCACHE=/cache/go/build \
	  -e UV_CACHE_DIR=/cache/uv -e UV_PROJECT_ENVIRONMENT=/cache/venv/$(notdir $(TOOLCHAIN_IMAGE)) \
	  -e MAVEN_USER_HOME=/cache/home/.m2 -e MAVEN_OPTS=-Duser.home=/cache/home \
	  $(TOOLCHAIN_IMAGE) make $(or $(TARGET),check)

## check-desktop  the client checks (from M0)
check-desktop:
	@if [ -f apps/desktop/package.json ]; then cd apps/desktop && pnpm check; else echo "apps/desktop not created yet (M0): skipped"; fi

## clean          free disk: the desktop's Rust build and WebKit cache, unused Docker build cache and dangling images (volumes kept)
# The next `pnpm tauri:dev` rebuilds the Rust side once (about a minute). Named volumes (the
# databases, the toolchain caches) are never touched.
clean:
	cd apps/desktop/src-tauri && cargo clean
	rm -rf apps/desktop/node_modules/.vite "$$HOME/.local/share/dev.royalegambit.ultimate/WebKitCache"
	-docker builder prune -f
	-docker image prune -f
	@df -h /

## smoke          start infra, templates and services in Docker, check health and the contracts, then stop
SMOKE = $(COMPOSE) --profile templates --profile full
smoke: .env
	$(SMOKE) up -d --build --wait || { $(SMOKE) ps; $(SMOKE) logs --tail 40; $(SMOKE) down; exit 1; }
	./scripts/smoke.sh; status=$$?; $(SMOKE) down; exit $$status
