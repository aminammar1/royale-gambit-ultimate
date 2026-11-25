.PHONY: check lint test fmt image
## check   format check, compile, tests (run through `make check-svc` at the root; needs the Docker socket)
check:
	./mvnw -B verify

fmt:
	./mvnw -B -q spring-javaformat:apply

image:
	docker build -t rg/$(notdir $(CURDIR)):dev .
