.PHONY: check fmt lint test sqlc image
## check   format, vet, tests (run through `make check-svc` at the root; needs the Docker socket)
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
