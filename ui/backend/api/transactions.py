"""API routes for transaction management."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from db.connection import get_db
from services.transaction_service import (
    get_transactions,
    get_transaction_by_id,
    categorize_transaction,
    get_categories,
    get_transactions_filtered,
    update_validation,
    update_notes,
    bulk_validate_transactions
)
from schemas.transaction import (
    TransactionResponse, 
    CategorizeRequest, 
    CategorizeResponse,
    UpdateValidationRequest,
    UpdateNotesRequest
)


class BulkValidateRequest(BaseModel):
    """Request schema for bulk validation."""
    transaction_ids: List[str] = Field(..., description="List of transaction IDs to validate")

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=List[TransactionResponse])
def list_transactions(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    view_mode: Optional[str] = Query(None, description="View mode: 'unvalidated_predicted', 'unvalidated_unpredicted', or 'validated'"),
    db: Session = Depends(get_db)
):
    """Get list of transactions filtered by validation and prediction status."""
    return get_transactions_filtered(
        db, 
        limit=limit, 
        offset=offset,
        view_mode=view_mode
    )


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: str, db: Session = Depends(get_db)):
    """Get a single transaction by ID."""
    transaction = get_transaction_by_id(db, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


@router.post("/{transaction_id}/categorize", response_model=CategorizeResponse)
def categorize_transaction_endpoint(
    transaction_id: str,
    request: CategorizeRequest,
    db: Session = Depends(get_db)
):
    """Categorize a transaction with a master category."""
    # Verify transaction exists
    transaction = get_transaction_by_id(db, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Create/update category
    user_category = categorize_transaction(db, transaction_id, request)
    
    return CategorizeResponse(
        transaction_id=user_category.transaction_id,
        master_category=user_category.master_category,
        source_category=user_category.source_category,
        updated_at=user_category.updated_at
    )


@router.get("/categories/list", response_model=List[str])
def list_categories(db: Session = Depends(get_db)):
    """Get list of available categories."""
    return get_categories(db)


@router.put("/{transaction_id}/validate")
def update_transaction_validation(
    transaction_id: str,
    request: UpdateValidationRequest,
    db: Session = Depends(get_db)
):
    """Update validation status for a transaction."""
    try:
        user_category = update_validation(db, transaction_id, request.validated)
        return {"transaction_id": transaction_id, "validated": user_category.validated}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{transaction_id}/notes")
def update_transaction_notes(
    transaction_id: str,
    request: UpdateNotesRequest,
    db: Session = Depends(get_db)
):
    """Update notes for a transaction."""
    try:
        user_category = update_notes(db, transaction_id, request.notes)
        return {"transaction_id": transaction_id, "notes": user_category.notes}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/bulk-validate")
def bulk_validate_transactions_endpoint(
    request: BulkValidateRequest,
    db: Session = Depends(get_db)
):
    """Mark multiple transactions as validated."""
    updated_count = bulk_validate_transactions(db, request.transaction_ids)
    return {
        "message": f"Marked {updated_count} transactions as validated",
        "updated_count": updated_count
    }
