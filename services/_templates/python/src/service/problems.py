"""RFC 9457 problem details for every error response."""

from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from service.telemetry import current_trace_id

PROBLEM = "application/problem+json"


def problem(
    request: Request, status: int, detail: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    body: dict[str, object] = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "detail": detail,
        "instance": request.url.path,
    }
    if trace_id := current_trace_id():
        body["trace_id"] = trace_id
    return JSONResponse(body, status_code=status, media_type=PROBLEM, headers=headers)


def install(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else HTTPStatus(exc.status_code).phrase
        if exc.status_code == 404 and detail == "Not Found":
            detail = "no such route"
        # Keep the headers the framework set, such as Allow on 405 (RFC 9110).
        return problem(request, exc.status_code, detail, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid(request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
        return problem(request, 400, f"{where}: {first.get('msg', 'invalid request')}".strip(": "))

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception) -> JSONResponse:
        import logging

        logging.getLogger("service").exception("unhandled error")
        return problem(request, 500, "unexpected error")
