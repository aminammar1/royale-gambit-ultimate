# Royal Gambit Ultimate: root tasks. See CLAUDE.md and ADR-18.
SHELL := /bin/bash
COMPOSE := docker compose --env-file .env -f infra/compose/docker-compose.yml
# Every service folder that has a Makefile: real services and the language templates.
SERVICES := $(patsubst %/Makefile,%,$(wildcard services/*/Makefile services/_templates/*/Makefile))
# S=<name> resolves to services/<name>, or services/_templates/<name> for templates (S=go|python|java).
svc = $(firstword $(wildcard services/$(S) services/_templates/$(S)))

.PHONY: help env infra infra-down up down logs dev check check-svc check-desktop smoke obs ps

help:
	@grep -E '^## ' Makefile | sed 's/## //'

## env            create .env from .env.example (once)
env: .env
.env:
	cp .env.example .env

## infra          only postgres, redis, rabbitmq, mailpit in Docker (then: make dev S=<svc>)
infra: .env
	$(COMPOSE) up -d --wait

## infra-down     stop infra (data volume kept)
infra-down: .env
	$(COMPOSE) down

## up             infra + every service in Docker (PROFILES="full obs" to add observability)
PROFILES ?= full
up: .env
	$(COMPOSE) $(addprefix --profile ,$(PROFILES)) up -d --build --wait
	@$(COMPOSE) ps --format 'table {{.Service}}\t{{.Status}}'

## down           stop everything
down: .env
	$(COMPOSE) --profile '*' down

## logs S=<svc>   follow logs of one compose service
logs: .env
	$(COMPOSE) --profile '*' logs -f $(S)

## ps             list running containers
ps: .env
	$(COMPOSE) --profile '*' ps

## dev S=<svc>    run one service natively against `make infra` (less RAM)
dev:
	@test -n "$(svc)" || { echo "unknown service S=$(S)"; exit 1; }
	$(MAKE) -C $(svc) run

## check          every check (all services + desktop)
check: $(addprefix check-,$(SERVICES)) check-desktop
check-services/%:
	$(MAKE) -C services/$* check

## check-svc S=<svc>   one service's checks
check-svc:
	@test -n "$(svc)" || { echo "unknown service S=$(S)"; exit 1; }
	$(MAKE) -C $(svc) check

## check-desktop  the client checks (from M0)
check-desktop:
	@if [ -f apps/desktop/package.json ]; then cd apps/desktop && pnpm check; else echo "apps/desktop not created yet (M0): skipped"; fi

## smoke          start infra + templates in Docker, check health and the contract, stop
smoke: .env
	$(COMPOSE) --profile templates up -d --build --wait
	./scripts/smoke.sh
