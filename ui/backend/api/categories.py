"""API routes for category catalog management."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from db.connection import get_db
from services.category_service import (
    list_categories_catalog,
    add_category,
    set_category_active,
)


router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryResponse(BaseModel):
    name: str
    is_default: bool = False
    is_active: bool = True
    in_use: bool = False
    created_at: Optional[datetime] = None


class AddCategoryRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Category name to add")


class SetActiveRequest(BaseModel):
    is_active: bool = Field(..., description="Whether the category should appear in dropdowns")


@router.get("", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    """List all categories with default / active / in-use status."""
    return list_categories_catalog(db)


@router.post("", response_model=CategoryResponse)
def create_category(request: AddCategoryRequest, db: Session = Depends(get_db)):
    """Add a new category (or reactivate an inactive one)."""
    try:
        return add_category(db, request.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{category_name}/active", response_model=CategoryResponse)
def update_category_active(
    category_name: str,
    request: SetActiveRequest,
    db: Session = Depends(get_db),
):
    """Activate or deactivate a category. Leaves existing transactions unchanged."""
    try:
        return set_category_active(db, category_name, request.is_active)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
