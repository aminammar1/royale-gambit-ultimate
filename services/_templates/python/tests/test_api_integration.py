"""Runs migrations on a real Postgres (Testcontainers) and exercises the contract."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from testcontainers.community.postgres import PostgresContainer

from service.config import Settings
from service.main import create_app
from service.telemetry import setup_tracing


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    setup_tracing("test")
    with PostgresContainer("postgres:19.0-trixie", driver="psycopg") as pg:
        settings = Settings(database_url=pg.get_connection_url(), migrate_on_start=True)
        with TestClient(create_app(settings)) as c:
            yield c


def test_health(client: TestClient) -> None:
    assert client.get("/health/live").json() == {"status": "ok"}
    assert client.get("/health/ready").status_code == 200


def test_create_and_get(client: TestClient) -> None:
    r = client.post("/v1/items", json={"name": "Opera Game"})
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["name"] == "Opera Game"
    assert item["id"][14] == "7"  # UUIDv7
    assert r.headers["location"] == f"/v1/items/{item['id']}"
    got = client.get(f"/v1/items/{item['id']}")
    assert got.status_code == 200
    assert got.json() == item


@pytest.mark.parametrize(
    ("method", "path", "body", "status"),
    [
        ("GET", "/v1/items/0190f6a8-0000-7000-8000-000000000000", None, 404),
        ("GET", "/v1/items/not-a-uuid", None, 400),
        ("POST", "/v1/items", {"name": ""}, 400),
        ("POST", "/v1/items", {"nom": "x"}, 400),
        ("GET", "/v1/nowhere", None, 404),
        ("DELETE", "/v1/items", None, 405),
    ],
)
def test_problems(client: TestClient, method: str, path: str, body: object, status: int) -> None:
    r = client.request(method, path, json=body)
    assert r.status_code == status
    assert r.headers["content-type"].startswith("application/problem+json")
    p = r.json()
    assert p["status"] == status
    assert p["type"]
    assert len(p.get("trace_id", "")) == 32


def test_metrics(client: TestClient) -> None:
    assert "http_requests_total" in client.get("/metrics").text
