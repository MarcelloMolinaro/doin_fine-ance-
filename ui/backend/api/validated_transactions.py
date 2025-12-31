"""API routes for validated transactions (fct_validated_trxns)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from db.connection import get_db
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
import logging

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
    
    class Config:
        from_attributes = True


class ValidatedTransactionsResponse(BaseModel):
    """Response schema for validated transactions with total count."""
    transactions: List[ValidatedTransactionResponse]
    total_count: int


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
    
    # Build WHERE conditions
    conditions = []
    params = {}
    
    if category:
        conditions.append("master_category = :category")
        params["category"] = category
    
    if account_name_filter:
        conditions.append("account_name ILIKE :account_filter")
        params["account_filter"] = f"%{account_name_filter}%"
    
    if description_search:
        conditions.append("description ILIKE :description_search")
        params["description_search"] = f"%{description_search}%"
    
    # Always filter out NULL transaction_ids (they shouldn't exist but handle gracefully)
    base_conditions = ["transaction_id IS NOT NULL"]
    if conditions:
        base_conditions.extend(conditions)
    
    where_clause = " AND ".join(base_conditions)
    
    # First, get total count
    count_query_str = f"""
        SELECT COUNT(*) as total
        FROM analytics.fct_validated_trxns
        WHERE {where_clause}
    """
    
    # Build query - using f-string for ORDER BY is safe since we validate sort_column
    query_str = f"""
        SELECT 
            transaction_id,
            account_id,
            account_name,
            institution_name,
            amount,
            transacted_date,
            description,
            master_category,
            source_category,
            user_notes
        FROM analytics.fct_validated_trxns
        WHERE {where_clause}
        ORDER BY {sort_column} {sort_direction}
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
                user_notes=getattr(row, 'user_notes', None)
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
