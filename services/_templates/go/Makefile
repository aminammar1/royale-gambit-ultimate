.PHONY: run check fmt lint test sqlc image
ENV_FILE := $(if $(wildcard .env),.env,.env.example)

## run     native run with hot config from .env (or .env.example)
run:
	set -a && . ./$(ENV_FILE) && set +a && go run ./cmd/server

## check   format, vet, tests (integration tests need Docker)
check: lint test

lint:
	@out=$$(gofmt -l .); if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi
	go vet ./...

test:
	go test -race -count=1 ./...

fmt:
	gofmt -w .

## sqlc    regenerate internal/db from queries/ and migrations/
sqlc:
	docker run --rm -u $$(id -u):$$(id -g) -v "$$PWD":/src -w /src sqlc/sqlc:1.31.1 generate

image:
	docker build -t rg/$(notdir $(CURDIR)):dev .
