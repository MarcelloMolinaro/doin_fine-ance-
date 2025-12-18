"""Database connection abstraction layer for Postgres and future Databricks support."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

# Database configuration from environment variables
DB_TYPE = os.getenv("DB_TYPE", "postgres")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_USER = os.getenv("POSTGRES_USER", "dagster")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "dagster")
POSTGRES_DB = os.getenv("POSTGRES_DB", "dagster")
POSTGRES_SCHEMA = os.getenv("POSTGRES_SCHEMA", "analytics")

# Databricks configuration (for future use)
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "")
DATABRICKS_HTTP_PATH = os.getenv("DATABRICKS_HTTP_PATH", "")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "")


def get_engine():
    """Create database engine based on DB_TYPE."""
    if DB_TYPE == "postgres":
        database_url = (
            f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
            f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
        )
        return create_engine(database_url, pool_pre_ping=True)
    
    elif DB_TYPE == "databricks":
        # Future: Databricks connection
        # from databricks import sql
        database_url = (
            f"databricks://token:{DATABRICKS_TOKEN}@{DATABRICKS_HOST}"
            f":443/{DATABRICKS_HTTP_PATH}"
        )
        return create_engine(database_url)
    
    else:
        raise ValueError(f"Unsupported DB_TYPE: {DB_TYPE}")


# Create engine and session factory
engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency for FastAPI to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
