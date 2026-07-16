"""Pydantic schemas for API request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional
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
    exclude_from_forecast: Optional[bool] = False
    
    class Config:
        from_attributes = True


class CategorizeRequest(BaseModel):
    """Request schema for categorizing a transaction."""
    master_category: str = Field(..., description="Master category to assign")
    source_category: Optional[str] = Field(None, description="Optional source category")
    notes: Optional[str] = Field(None, description="Optional notes")
    validated: Optional[bool] = Field(False, description="Whether transaction is validated")
    exclude_from_forecast: Optional[bool] = Field(
        None, description="Whether to exclude this transaction from forecasting"
    )


class CategorizeResponse(BaseModel):
    """Response schema for categorization."""
    transaction_id: str
    master_category: str
    source_category: Optional[str] = None
    notes: Optional[str] = None
    validated: bool = False
    exclude_from_forecast: bool = False
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UpdateExcludeFromForecastRequest(BaseModel):
    """Request schema for updating forecast exclusion."""
    exclude_from_forecast: bool = Field(..., description="Exclude from forecasting")


class UpdateValidationRequest(BaseModel):
    """Request schema for updating validation status."""
    validated: bool = Field(..., description="Validation status")


class UpdateNotesRequest(BaseModel):
    """Request schema for updating notes."""
    notes: Optional[str] = Field(None, description="Notes to add/update")
