"""API routes for validated transactions (fct_validated_trxns)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from db.connection import get_db
from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import datetime
import logging
from services.transaction_service import update_validated_transaction_category, get_categories

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/validated-transactions", tags=["validated-transactions"])


class ValidatedTransactionResponse(BaseModel):
    """Response schema for validated transaction."""
    transaction_id: Optional[str] = None  # Made Optional to handle NULL values
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    institution_name: Optional[str] = None
    amount: Optional[Decimal] = None
    transacted_date: Optional[datetime] = None
    description: Optional[str] = None
    master_category: Optional[str] = None
    source_category: Optional[str] = None
    user_notes: Optional[str] = None
    exclude_from_forecast: Optional[bool] = False
    
    class Config:
        from_attributes = True


class ValidatedTransactionsResponse(BaseModel):
    """Response schema for validated transactions with total count."""
    transactions: List[ValidatedTransactionResponse]
    total_count: int


class UpdateValidatedCategoryRequest(BaseModel):
    """Request schema for updating a validated transaction's category."""
    master_category: str = Field(..., min_length=1)


class UpdateValidatedCategoryResponse(BaseModel):
    transaction_id: str
    master_category: str
    message: str


@router.get("", response_model=ValidatedTransactionsResponse)
def list_validated_transactions(
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = Query(None, description="Column to sort by (e.g., 'transacted_date', 'amount')"),
    sort_order: str = Query("desc", description="Sort order: 'asc' or 'desc'"),
    category: Optional[str] = Query(None, description="Filter by master_category"),
    account_name_filter: Optional[str] = Query(None, description="Filter by account_name (partial match)"),
    description_search: Optional[str] = Query(None, description="Search filter for description field"),
    db: Session = Depends(get_db)
):
    """Get list of validated transactions with optional filtering and sorting."""
    # Validate and set sort column (prevent SQL injection)
    allowed_sort_columns = {
        "transacted_date", "amount", "account_name", "master_category", 
        "description", "institution_name", "transaction_id"
    }
    if sort_by and sort_by not in allowed_sort_columns:
        sort_by = "transacted_date"  # Default to safe column
    
    sort_column = sort_by if sort_by else "transacted_date"
    sort_direction = "DESC" if sort_order.lower() == "desc" else "ASC"
    
    # Build WHERE conditions (qualified for join with user_categories)
    conditions = []
    params = {}
    
    if category:
        conditions.append("v.master_category = :category")
        params["category"] = category
    
    if account_name_filter:
        conditions.append("v.account_name ILIKE :account_filter")
        params["account_filter"] = f"%{account_name_filter}%"
    
    if description_search:
        conditions.append("v.description ILIKE :description_search")
        params["description_search"] = f"%{description_search}%"
    
    # Always filter out NULL transaction_ids (they shouldn't exist but handle gracefully)
    base_conditions = ["v.transaction_id IS NOT NULL"]
    if conditions:
        base_conditions.extend(conditions)
    
    where_clause = " AND ".join(base_conditions)
    
    count_query_str = f"""
        SELECT COUNT(*) as total
        FROM analytics.fct_validated_trxns v
        LEFT JOIN public.user_categories uc ON v.transaction_id = uc.transaction_id
        WHERE {where_clause}
    """
    
    # Build query - using f-string for ORDER BY is safe since we validate sort_column
    query_str = f"""
        SELECT 
            v.transaction_id,
            v.account_id,
            v.account_name,
            v.institution_name,
            v.amount,
            v.transacted_date,
            v.description,
            v.master_category,
            v.source_category,
            v.user_notes,
            COALESCE(uc.exclude_from_forecast, false) as exclude_from_forecast
        FROM analytics.fct_validated_trxns v
        LEFT JOIN public.user_categories uc ON v.transaction_id = uc.transaction_id
        WHERE {where_clause}
        ORDER BY v.{sort_column} {sort_direction}
        LIMIT :limit OFFSET :offset
    """
    
    params["limit"] = limit
    params["offset"] = offset
    
    try:
        # Get total count
        count_query = text(count_query_str)
        count_result = db.execute(count_query, params)
        total_count = count_result.scalar() or 0
        
        # Get paginated results
        query = text(query_str)
        result = db.execute(query, params)
        
        transactions = []
        for row in result:
            # Access row columns - SQLAlchemy Row objects support attribute access
            transactions.append(ValidatedTransactionResponse(
                transaction_id=getattr(row, 'transaction_id', None),
                account_id=getattr(row, 'account_id', None),
                account_name=getattr(row, 'account_name', None),
                institution_name=getattr(row, 'institution_name', None),
                amount=getattr(row, 'amount', None),
                transacted_date=getattr(row, 'transacted_date', None),
                description=getattr(row, 'description', None),
                master_category=getattr(row, 'master_category', None),
                source_category=getattr(row, 'source_category', None),
                user_notes=getattr(row, 'user_notes', None),
                exclude_from_forecast=bool(getattr(row, 'exclude_from_forecast', False)),
            ))
        
        return ValidatedTransactionsResponse(
            transactions=transactions,
            total_count=total_count
        )
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error querying validated transactions: {error_details}")
        logger.error(f"Query: {query_str}")
        logger.error(f"Params: {params}")
        
        # Return error with details for debugging
        raise HTTPException(
            status_code=500,
            detail=f"Error querying validated transactions: {str(e)}"
        )


@router.get("/categories/list", response_model=List[str])
def list_categories(db: Session = Depends(get_db)):
    """Get list of unique categories from validated transactions."""
    query = text("""
        SELECT DISTINCT master_category 
        FROM analytics.fct_validated_trxns 
        WHERE master_category IS NOT NULL
        ORDER BY master_category
    """)
    
    result = db.execute(query)
    categories = [row.master_category for row in result if row.master_category]
    return categories


@router.get("/categories/all", response_model=List[str])
def list_all_categories_for_editor(db: Session = Depends(get_db)):
    """All categories available when editing validated data (includes training categories)."""
    return get_categories(db)


@router.put("/{transaction_id}/category", response_model=UpdateValidatedCategoryResponse)
def update_validated_category(
    transaction_id: str,
    request: UpdateValidatedCategoryRequest,
    db: Session = Depends(get_db),
):
    """Update master_category for a validated transaction (All Data editor)."""
    try:
        user_category = update_validated_transaction_category(
            db, transaction_id, request.master_category
        )
        return UpdateValidatedCategoryResponse(
            transaction_id=user_category.transaction_id,
            master_category=user_category.master_category,
            message="Category updated. Full refresh + retrain scheduled (~45s after your last edit).",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to update validated category: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
