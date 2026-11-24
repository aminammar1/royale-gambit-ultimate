.PHONY: check lint test fmt image
## check   lint, types, tests (run through `make check-svc` at the root; needs the Docker socket)
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
