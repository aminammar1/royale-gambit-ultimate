.PHONY: run check lint test fmt image
ENV_FILE := $(if $(wildcard .env),.env,.env.example)

## run     native run with config from .env (or .env.example)
run:
	set -a && . ./$(ENV_FILE) && set +a && uv run serve

## check   lint, types, tests (integration tests need Docker)
check: lint test

lint:
	uv run ruff format --check .
	uv run ruff check .
	uv run mypy src tests

test:
	uv run pytest -q

fmt:
	uv run ruff format .
	uv run ruff check --fix .

image:
	docker build -t rg/$(notdir $(CURDIR)):dev .
