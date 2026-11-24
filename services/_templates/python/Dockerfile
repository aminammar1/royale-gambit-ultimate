# syntax=docker/dockerfile:1
# toolchain: used by `make check-svc` (tests run here) and as the build base.
FROM python:3.15.2-slim-trixie AS toolchain
RUN pip install --no-cache-dir --root-user-action=ignore uv==0.13.9
RUN apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /src

FROM toolchain AS build
ENV UV_COMPILE_BYTECODE=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-editable

FROM python:3.15.2-slim-trixie
RUN useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY alembic.ini ./
COPY migrations ./migrations
ENV PATH="/app/.venv/bin:$PATH" PORT=8102 PYTHONUNBUFFERED=1
USER app
EXPOSE 8102
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD ["python", "-c", "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health/live', timeout=2).status == 200 else 1)"]
CMD ["serve"]
