"""The template's example resource. Delete it in a real service."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


class NewItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    # No control characters: Postgres text cannot hold NUL, and the others are never meant.
    name: Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[^\x00-\x1f\x7f-\x9f]*$")]


class Item(BaseModel):
    id: uuid.UUID
    name: str
    created_at: str


router = APIRouter()


def _engine(request: Request) -> AsyncEngine:
    engine: AsyncEngine = request.app.state.engine
    return engine


def _to_item(row: tuple[uuid.UUID, str, datetime]) -> Item:
    return Item(id=row[0], name=row[1], created_at=row[2].astimezone(UTC).isoformat())


@router.post("/v1/items", status_code=201, response_model=Item)
async def create_item(body: NewItem, request: Request, response: Response) -> Item:
    async with _engine(request).begin() as conn:
        result = await conn.execute(
            text("INSERT INTO items (id, name) VALUES (:id, :name) RETURNING id, name, created_at"),
            {"id": uuid.uuid7(), "name": body.name},
        )
        row = result.one()
    item = _to_item((row[0], row[1], row[2]))
    response.headers["Location"] = f"/v1/items/{item.id}"
    return item


@router.get("/v1/items/{item_id}", response_model=Item)
async def get_item(item_id: uuid.UUID, request: Request) -> Item:
    async with _engine(request).connect() as conn:
        result = await conn.execute(
            text("SELECT id, name, created_at FROM items WHERE id = :id"), {"id": item_id}
        )
        row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="no item with this id")
    return _to_item((row[0], row[1], row[2]))
