"""Configuration from environment variables only (12-factor)."""

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "template-py"
    port: int = 8102
    database_url: str = Field(description="postgresql+psycopg://user:pass@host:5432/db")
    migrate_on_start: bool = False
