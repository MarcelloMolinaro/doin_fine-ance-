"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.transactions import router as transactions_router
from api.validated_transactions import router as validated_transactions_router
from db.connection import engine
from models.transaction import Base

# Create database tables if they don't exist
# Note: This only creates user_categories table, not the analytics schema tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Transaction Categorization API",
    description="API for managing transaction categorization",
    version="1.0.0"
)

# CORS middleware to allow React frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(transactions_router)
app.include_router(validated_transactions_router)


@app.get("/")
def root():
    """Root endpoint."""
    return {"message": "Transaction Categorization API", "docs": "/docs"}


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy"}
