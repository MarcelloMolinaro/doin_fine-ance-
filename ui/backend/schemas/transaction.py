"""Pydantic schemas for API request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class TransactionResponse(BaseModel):
    """Transaction response schema."""
    transaction_id: str
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    institution_name: Optional[str] = None
    amount: Optional[Decimal] = None
    transacted_date: Optional[datetime] = None
    description: Optional[str] = None
    master_category: Optional[str] = None
    predicted_master_category: Optional[str] = None
    prediction_confidence: Optional[Decimal] = None
    model_version: Optional[str] = None
    notes: Optional[str] = None
    validated: Optional[bool] = False
    
    class Config:
        from_attributes = True


class CategorizeRequest(BaseModel):
    """Request schema for categorizing a transaction."""
    master_category: str = Field(..., description="Master category to assign")
    source_category: Optional[str] = Field(None, description="Optional source category")
    notes: Optional[str] = Field(None, description="Optional notes")
    validated: Optional[bool] = Field(False, description="Whether transaction is validated")


class CategorizeResponse(BaseModel):
    """Response schema for categorization."""
    transaction_id: str
    master_category: str
    source_category: Optional[str] = None
    notes: Optional[str] = None
    validated: bool = False
    updated_at: datetime
    
    class Config:
        from_attributes = True


class BulkCategorizeRequest(BaseModel):
    """Request schema for bulk categorization of validated transactions."""
    master_category: str = Field(..., description="Master category to assign to all validated transactions")


class UpdateValidationRequest(BaseModel):
    """Request schema for updating validation status."""
    validated: bool = Field(..., description="Validation status")


class UpdateNotesRequest(BaseModel):
    """Request schema for updating notes."""
    notes: Optional[str] = Field(None, description="Notes to add/update")
