# syntax=docker/dockerfile:1
# toolchain: used by `make check-svc` (tests run here) and as the build base.
FROM golang:1.27.4-trixie AS toolchain
WORKDIR /src

FROM toolchain AS build
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/server /server
USER nonroot:nonroot
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 CMD ["/server", "healthcheck"]
ENTRYPOINT ["/server"]
