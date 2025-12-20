"""API routes for validated transactions (fct_validated_trxns)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from db.connection import get_db
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime

router = APIRouter(prefix="/api/validated-transactions", tags=["validated-transactions"])


class ValidatedTransactionResponse(BaseModel):
    """Response schema for validated transaction."""
    transaction_id: str
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


@router.get("", response_model=List[ValidatedTransactionResponse])
def list_validated_transactions(
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = Query(None, description="Column to sort by (e.g., 'transacted_date', 'amount')"),
    sort_order: str = Query("desc", description="Sort order: 'asc' or 'desc'"),
    category: Optional[str] = Query(None, description="Filter by master_category"),
    account_name_filter: Optional[str] = Query(None, description="Filter by account_name (partial match)"),
    db: Session = Depends(get_db)
):
    """Get list of validated transactions with optional filtering and sorting."""
    # Build WHERE conditions
    conditions = []
    params = {
        "limit": limit,
        "offset": offset
    }
    
    if category:
        conditions.append("master_category = :category")
        params["category"] = category
    
    if account_name_filter:
        conditions.append("account_name ILIKE :account_filter")
        params["account_filter"] = f"%{account_name_filter}%"
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # Validate and set sort column (prevent SQL injection)
    allowed_sort_columns = {
        "transacted_date", "amount", "account_name", "master_category", 
        "description", "institution_name", "transaction_id"
    }
    if sort_by and sort_by not in allowed_sort_columns:
        sort_by = "transacted_date"  # Default to safe column
    
    sort_column = sort_by if sort_by else "transacted_date"
    sort_direction = "DESC" if sort_order.lower() == "desc" else "ASC"
    
    query = text(f"""
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
    """)
    
    result = db.execute(query, params)
    
    transactions = []
    for row in result:
        transactions.append(ValidatedTransactionResponse(
            transaction_id=row.transaction_id,
            account_id=row.account_id,
            account_name=row.account_name,
            institution_name=row.institution_name,
            amount=row.amount,
            transacted_date=row.transacted_date,
            description=row.description,
            master_category=row.master_category,
            source_category=row.source_category,
            user_notes=row.user_notes
        ))
    
    return transactions


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
