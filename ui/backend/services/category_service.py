"""Service layer for category catalog management."""
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from utils import utc_now
from models.transaction import Category
from constants import DEFAULT_CATEGORIES


def _in_use_category_names(db: Session) -> set:
    """Collect category names currently assigned anywhere in the pipeline."""
    in_use = set()
    queries = [
        "SELECT DISTINCT master_category FROM public.user_categories WHERE master_category IS NOT NULL",
        """
        SELECT DISTINCT master_category
        FROM analytics.fct_trxns_categorized
        WHERE master_category IS NOT NULL
        """,
        """
        SELECT DISTINCT master_category
        FROM analytics.fct_trxns_with_predictions
        WHERE master_category IS NOT NULL
        """,
        """
        SELECT DISTINCT predicted_master_category
        FROM analytics.fct_trxns_with_predictions
        WHERE predicted_master_category IS NOT NULL
          AND predicted_master_category <> 'UNCERTAIN'
        """,
    ]
    for query in queries:
        try:
            result = db.execute(text(query))
            for row in result:
                name = row[0]
                if name:
                    in_use.add(name)
        except Exception:
            pass
    return in_use


def ensure_default_categories(db: Session) -> None:
    """Insert any missing default categories (idempotent)."""
    for name in DEFAULT_CATEGORIES:
        existing = db.query(Category).filter(Category.name == name).first()
        if not existing:
            db.add(Category(name=name, is_default=True, is_active=True, created_at=utc_now()))
    db.commit()


def sync_in_use_categories(db: Session) -> None:
    """Add in-use categories missing from the catalog. Does not override deactivation."""
    in_use = _in_use_category_names(db)
    for name in in_use:
        if name == "UNCERTAIN":
            continue
        existing = db.query(Category).filter(Category.name == name).first()
        if not existing:
            db.add(Category(
                name=name,
                is_default=name in DEFAULT_CATEGORIES,
                is_active=True,
                created_at=utc_now(),
            ))
    db.commit()


def list_categories_catalog(db: Session) -> List[dict]:
    """Return catalog entries with default / active / in-use metadata."""
    ensure_default_categories(db)
    sync_in_use_categories(db)
    in_use = _in_use_category_names(db)
    rows = db.query(Category).order_by(Category.name).all()

    catalog = []
    for row in rows:
        catalog.append({
            "name": row.name,
            "is_default": bool(row.is_default),
            "is_active": bool(row.is_active),
            "in_use": row.name in in_use,
            "created_at": row.created_at,
        })

    catalog.sort(key=lambda c: c["name"].lower())
    return catalog


def get_active_category_names(db: Session) -> List[str]:
    """Active category names for assignment dropdowns."""
    ensure_default_categories(db)
    sync_in_use_categories(db)
    rows = (
        db.query(Category.name)
        .filter(Category.is_active.is_(True))
        .order_by(Category.name)
        .all()
    )
    return [row.name for row in rows]


def add_category(db: Session, name: str) -> dict:
    """Add a custom category (or reactivate an inactive one)."""
    cleaned = (name or "").strip()
    if not cleaned:
        raise ValueError("Category name is required")
    if cleaned.upper() == "UNCERTAIN":
        raise ValueError("UNCERTAIN is reserved and cannot be added")

    existing = db.query(Category).filter(Category.name == cleaned).first()
    if existing:
        if existing.is_active:
            raise ValueError(f"Category '{cleaned}' already exists")
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        in_use = cleaned in _in_use_category_names(db)
        return {
            "name": existing.name,
            "is_default": bool(existing.is_default),
            "is_active": True,
            "in_use": in_use,
            "created_at": existing.created_at,
        }

    category = Category(
        name=cleaned,
        is_default=cleaned in DEFAULT_CATEGORIES,
        is_active=True,
        created_at=utc_now(),
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return {
        "name": category.name,
        "is_default": bool(category.is_default),
        "is_active": True,
        "in_use": False,
        "created_at": category.created_at,
    }


def set_category_active(db: Session, name: str, is_active: bool) -> dict:
    """Activate or deactivate a category. Existing transactions are left unchanged."""
    category = db.query(Category).filter(Category.name == name).first()
    if not category:
        # Allow deactivating/activating orphan in-use names by creating a row
        if not is_active:
            category = Category(
                name=name,
                is_default=name in DEFAULT_CATEGORIES,
                is_active=False,
                created_at=utc_now(),
            )
            db.add(category)
        else:
            raise ValueError(f"Category '{name}' not found")
    else:
        category.is_active = is_active

    db.commit()
    db.refresh(category)
    in_use = name in _in_use_category_names(db)
    return {
        "name": category.name,
        "is_default": bool(category.is_default),
        "is_active": bool(category.is_active),
        "in_use": in_use,
        "created_at": category.created_at,
    }
