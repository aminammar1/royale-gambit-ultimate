# syntax=docker/dockerfile:1
# Stockfish: the official release, pinned and checksum-verified (ADR-05, ADR-17).
# To upgrade: change the tag, its x86-64 universal asset digest and ENGINE_VERSION (twice) below,
# and the version in the README.
FROM debian:trixie-slim AS stockfish
ARG STOCKFISH_TAG=sf_19
ARG STOCKFISH_SHA256=9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f
ADD --checksum=sha256:${STOCKFISH_SHA256} \
    https://github.com/official-stockfish/Stockfish/releases/download/${STOCKFISH_TAG}/stockfish-linux-x86-64-universal.tar.gz \
    /tmp/stockfish.tar.gz
RUN tar -xzf /tmp/stockfish.tar.gz -C /tmp stockfish/stockfish-linux-x86-64-universal stockfish/Copying.txt \
 && install -m 0755 /tmp/stockfish/stockfish-linux-x86-64-universal /usr/local/bin/stockfish \
 && install -D -m 0644 /tmp/stockfish/Copying.txt /usr/share/doc/stockfish/Copying.txt

# toolchain: used by `make check-svc` (tests run here, against the real engine) and as the build base.
FROM golang:1.27.4-trixie AS toolchain
COPY --from=stockfish /usr/local/bin/stockfish /usr/local/bin/stockfish
ENV ENGINE_VERSION=19
WORKDIR /src

FROM toolchain AS build
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# cc, not static: Stockfish links against glibc (libc, libm).
FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=stockfish /usr/local/bin/stockfish /usr/local/bin/stockfish
COPY --from=stockfish /usr/share/doc/stockfish /usr/share/doc/stockfish
COPY --from=build /out/server /server
# The service refuses to start if the engine reports another version.
ENV ENGINE_VERSION=19
USER nonroot:nonroot
EXPOSE 8084
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 CMD ["/server", "healthcheck"]
ENTRYPOINT ["/server"]
