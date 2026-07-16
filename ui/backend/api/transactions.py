"""API routes for transaction management."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from constants import DEFAULT_CATEGORIES, LOW_CONFIDENCE_THRESHOLD
from db.connection import get_db
from services.transaction_service import (
    get_transaction_by_id,
    categorize_transaction,
    get_categories,
    get_transactions_filtered,
    update_validation,
    update_notes,
    update_exclude_from_forecast,
    bulk_validate_transactions
)
from schemas.transaction import (
    CategorizeRequest, 
    CategorizeResponse,
    UpdateValidationRequest,
    UpdateNotesRequest,
    UpdateExcludeFromForecastRequest,
)

logger = logging.getLogger(__name__)


class BulkValidateRequest(BaseModel):
    """Request schema for bulk validation."""
    transaction_ids: List[str] = Field(..., description="List of transaction IDs to validate")

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("")
def list_transactions(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    view_mode: Optional[str] = Query(None, description="View mode: 'unvalidated_predicted', 'unvalidated_unpredicted', or 'validated'"),
    description_search: Optional[str] = Query(None, description="Search filter for description field"),
    exclude_low_confidence: bool = Query(False, description="Hide predictions below low confidence threshold"),
    low_confidence_threshold: float = Query(LOW_CONFIDENCE_THRESHOLD, ge=0.0, le=1.0),
    sort_by: Optional[str] = Query(None, description="Sort column: transacted_date or prediction_confidence"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db)
):
    """Get list of transactions filtered by validation and prediction status."""
    result = get_transactions_filtered(
        db, 
        limit=limit, 
        offset=offset,
        view_mode=view_mode,
        description_search=description_search,
        exclude_low_confidence=exclude_low_confidence,
        low_confidence_threshold=low_confidence_threshold,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return result


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
        notes=user_category.notes,
        validated=bool(user_category.validated),
        exclude_from_forecast=bool(user_category.exclude_from_forecast),
        updated_at=user_category.updated_at
    )


@router.get("/categories/list", response_model=List[str])
def list_categories(db: Session = Depends(get_db)):
    """Get list of available categories."""
    try:
        return get_categories(db)
    except Exception as e:
        # Return the default catalog so the UI doesn't break if the DB read fails.
        logger.error(f"Error fetching categories: {str(e)}")
        return sorted(DEFAULT_CATEGORIES)


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


@router.put("/{transaction_id}/exclude-from-forecast")
def update_transaction_exclude_from_forecast(
    transaction_id: str,
    request: UpdateExcludeFromForecastRequest,
    db: Session = Depends(get_db)
):
    """Update whether a transaction should be excluded from forecasting."""
    try:
        user_category = update_exclude_from_forecast(
            db, transaction_id, request.exclude_from_forecast
        )
        return {
            "transaction_id": transaction_id,
            "exclude_from_forecast": user_category.exclude_from_forecast,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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


@router.post("/trigger-refresh-validated")
def trigger_refresh_validated_trxns():
    """Trigger Dagster job to refresh fct_validated_trxns model."""
    from services.dagster_trigger import trigger_refresh_validated_retrain_repredict

    try:
        run_id = trigger_refresh_validated_retrain_repredict()
        return {
            "success": True,
            "message": "Dagster job triggered successfully",
            "run_id": run_id,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error triggering Dagster job: {str(e)}",
        )
