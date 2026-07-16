"""FastAPI application entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from services.backup_service import BackupError
from api.transactions import router as transactions_router
from api.validated_transactions import router as validated_transactions_router
from api.control_center import router as control_center_router
from api.model_metrics import router as model_metrics_router
from api.backup import router as backup_router
from api.categories import router as categories_router
from db.connection import engine
from models.transaction import UserCategory, Category

# Only create tables we own. Do NOT create analytics.fct_trxns_with_predictions:
# that name is a dbt VIEW; create_all would add an empty TABLE and hide all uncategorized rows.
UserCategory.__table__.create(bind=engine, checkfirst=True)
Category.__table__.create(bind=engine, checkfirst=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    from api.backup_scheduler import start_scheduler
    start_scheduler()
    yield
    from api.backup_scheduler import shutdown_scheduler
    shutdown_scheduler()


app = FastAPI(
    title="Transaction Categorization API",
    description="API for managing transaction categorization",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware to allow React frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(BackupError)
async def backup_error_handler(request: Request, exc: BackupError):
    """Surface backup/restore subprocess failures as HTTP 500 with a message."""
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# Include routers
app.include_router(transactions_router)
app.include_router(validated_transactions_router)
app.include_router(control_center_router)
app.include_router(model_metrics_router)
app.include_router(backup_router)
app.include_router(categories_router)


@app.get("/")
def root():
    """Root endpoint."""
    return {"message": "Transaction Categorization API", "docs": "/docs"}


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/health/db")
def health_db():
    """
    Database connectivity check. Use this to verify the backend can reach Postgres.
    Returns connection details (host redacted) and status.
    """
    from sqlalchemy import text
    from db.connection import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_SCHEMA

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "connected",
            "host": POSTGRES_HOST,
            "port": int(POSTGRES_PORT),
            "database": POSTGRES_DB,
            "schema": POSTGRES_SCHEMA,
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "host": POSTGRES_HOST,
            "port": int(POSTGRES_PORT),
            "database": POSTGRES_DB,
            "hint": "If running backend outside Docker, set POSTGRES_HOST=localhost",
        }
