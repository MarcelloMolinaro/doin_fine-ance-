"""SQLAlchemy models for transactions and user categories."""
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
from typing import Optional

Base = declarative_base()


class Transaction(Base):
    """Transaction model representing analytics.fct_trxns_with_predictions."""
    __tablename__ = "fct_trxns_with_predictions"
    __table_args__ = {"schema": "analytics"}
    
    transaction_id = Column(Text, primary_key=True)
    account_id = Column(Text)
    original_account_name = Column(Text)
    account_name = Column(Text)
    detailed_account_name = Column(Text)
    owner_name = Column(Text)
    institution_domain = Column(Text)
    institution_name = Column(Text)
    amount = Column(Numeric)
    posted = Column(DateTime)
    posted_date = Column(DateTime)
    transacted_at = Column(DateTime)
    transacted_date = Column(DateTime)
    description = Column(Text)
    pending = Column(Boolean)
    source_category = Column(Text)
    master_category = Column(Text)
    import_timestamp = Column(DateTime)
    import_date = Column(DateTime)
    source_name = Column(Text)
    predicted_master_category = Column(Text)
    prediction_confidence = Column(Numeric)
    model_version = Column(Text)
    prediction_timestamp = Column(DateTime)


class UserCategory(Base):
    """User-defined category overrides for transactions."""
    __tablename__ = "user_categories"
    __table_args__ = {"schema": "public"}
    
    transaction_id = Column(Text, primary_key=True)
    master_category = Column(Text, nullable=False)
    source_category = Column(Text)
    notes = Column(Text)
    validated = Column(Boolean, default=False)
    updated_by = Column(Text, default="system")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
