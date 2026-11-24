"""Application factory and entry point."""

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text
from starlette.routing import Match

from service import items, problems
from service.config import Settings
from service.db import make_engine, migrate
from service.telemetry import setup_logging, setup_tracing

log = logging.getLogger("service")

REQUESTS = Counter("http_requests_total", "HTTP requests", ["route", "method", "status"])
LATENCY = Histogram("http_request_duration_seconds", "HTTP latency", ["route", "method"])
QUIET = {"/health/live", "/health/ready", "/metrics"}


def _route(request: Request) -> str:
    for route in request.app.router.routes:
        match, _ = route.matches(request.scope)
        if match == Match.FULL:
            return str(getattr(route, "path", "unmatched"))
    return "unmatched"


def create_app(settings: Settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.migrate_on_start:
            await asyncio.to_thread(migrate, settings.database_url)
            log.info("migrations applied")
        app.state.engine = make_engine(settings.database_url)
        yield
        await app.state.engine.dispose()

    app = FastAPI(title=settings.service_name, lifespan=lifespan, docs_url=None, redoc_url=None)
    problems.install(app)
    app.include_router(items.router)

    @app.middleware("http")
    async def observe(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        route, elapsed = _route(request), time.perf_counter() - start
        REQUESTS.labels(route, request.method, str(response.status_code)).inc()
        LATENCY.labels(route, request.method).observe(elapsed)
        if route not in QUIET:
            log.info(
                "request",
                extra={
                    "fields": {
                        "method": request.method,
                        "route": route,
                        "status": response.status_code,
                        "duration_ms": round(elapsed * 1000),
                    }
                },
            )
        return response

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready(request: Request) -> JSONResponse:
        try:
            async with asyncio.timeout(1):
                async with request.app.state.engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
        except Exception as exc:
            log.warning("not ready", extra={"fields": {"error": str(exc)}})
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return JSONResponse({"status": "ok"})

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    FastAPIInstrumentor.instrument_app(app, excluded_urls="health/live,health/ready,metrics")
    return app


def serve() -> None:
    settings = Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
    setup_logging(settings.service_name)
    setup_tracing(settings.service_name)
    uvicorn.run(create_app(settings), host="0.0.0.0", port=settings.port, log_config=None)  # noqa: S104


if __name__ == "__main__":
    serve()
