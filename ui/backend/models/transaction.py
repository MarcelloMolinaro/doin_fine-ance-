"""SQLAlchemy models for user categories and the category catalog.

Read access to transaction data (analytics.fct_trxns_with_predictions) is done
via raw SQL in the service layer; that name is a dbt VIEW, so it is deliberately
NOT mapped as an ORM table here (create_all would clobber the view).
"""
from sqlalchemy import Column, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base

from utils import utc_now

Base = declarative_base()


class UserCategory(Base):
    """User-defined category overrides for transactions."""
    __tablename__ = "user_categories"
    __table_args__ = {"schema": "public"}
    
    transaction_id = Column(Text, primary_key=True)
    master_category = Column(Text, nullable=False)
    source_category = Column(Text)
    notes = Column(Text)
    validated = Column(Boolean, default=False)
    exclude_from_forecast = Column(Boolean, default=False)
    updated_by = Column(Text, default="system")
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class Category(Base):
    """Catalog of master categories available for assignment."""
    __tablename__ = "categories"
    __table_args__ = {"schema": "public"}

    name = Column(Text, primary_key=True)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
