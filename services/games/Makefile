.PHONY: check fmt lint test tidy image
## check   format, vet, tests (run through `make check-svc` at the root; needs the Docker socket)
check: lint test

lint:
	@out=$$(gofmt -l .); if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi
	go vet ./...

test:
	go test -race -count=1 ./...

fmt:
	gofmt -w .

## tidy    update go.mod and go.sum (run through `make in-toolchain DIR=services/games TARGET=tidy`)
tidy:
	go mod tidy

image:
	docker build -t rg/$(notdir $(CURDIR)):dev .
