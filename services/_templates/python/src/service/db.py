"""Database engine and migrations (Alembic)."""

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

# alembic.ini and migrations/ sit in the service root: /app in the image, the project folder in
# tests. The installed package lives in site-packages, so its own path cannot be used.
ROOT = Path(os.environ.get("SERVICE_ROOT", Path.cwd()))


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True)


def migrate(url: str) -> None:
    """Apply every pending migration (`alembic upgrade head`)."""
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(cfg, "head")
