"""Service layer for transaction business logic."""
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Tuple
from datetime import datetime
from models.transaction import Transaction, UserCategory
from schemas.transaction import TransactionResponse, CategorizeRequest


def get_transactions(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    include_categorized: bool = True
) -> List[TransactionResponse]:
    """
    Get transactions with user category overrides applied.
    
    Args:
        db: Database session
        limit: Maximum number of transactions to return
        offset: Number of transactions to skip
        include_categorized: Whether to include already categorized transactions
    """
    # Build query - predictions are suggestions, not actual categorizations
    # Only filter by actual categories (user override or source master_category), not predictions
    query = text("""
        SELECT 
            t.transaction_id,
            t.account_id,
            t.account_name,
            t.institution_name,
            t.amount,
            t.transacted_date,
            t.description,
            COALESCE(uc.master_category, t.master_category) as master_category,
            t.predicted_master_category,
            t.prediction_confidence,
            t.model_version,
            uc.notes,
            COALESCE(uc.validated, false) as validated,
            COALESCE(uc.exclude_from_forecast, false) as exclude_from_forecast
        FROM analytics.fct_trxns_with_predictions t
        LEFT JOIN public.user_categories uc ON t.transaction_id = uc.transaction_id
        WHERE (:include_categorized OR COALESCE(uc.master_category, t.master_category) IS NULL)
        ORDER BY t.transacted_date DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """)
    
    result = db.execute(
        query,
        {
            "include_categorized": include_categorized,
            "limit": limit,
            "offset": offset
        }
    )
    
    transactions = []
    for row in result:
        transactions.append(TransactionResponse(
            transaction_id=row.transaction_id,
            account_id=row.account_id,
            account_name=row.account_name,
            institution_name=row.institution_name,
            amount=row.amount,
            transacted_date=row.transacted_date,
            description=row.description,
            master_category=row.master_category,
            predicted_master_category=row.predicted_master_category,
            prediction_confidence=row.prediction_confidence,
            model_version=row.model_version,
            notes=row.notes,
            validated=row.validated,
            exclude_from_forecast=row.exclude_from_forecast,
        ))
    
    return transactions


def get_transaction_by_id(db: Session, transaction_id: str) -> Optional[TransactionResponse]:
    """Get a single transaction by ID."""
    query = text("""
        SELECT 
            t.transaction_id,
            t.account_id,
            t.account_name,
            t.institution_name,
            t.amount,
            t.transacted_date,
            t.description,
            COALESCE(uc.master_category, t.master_category) as master_category,
            t.predicted_master_category,
            t.prediction_confidence,
            t.model_version,
            uc.notes,
            COALESCE(uc.validated, false) as validated,
            COALESCE(uc.exclude_from_forecast, false) as exclude_from_forecast
        FROM analytics.fct_trxns_with_predictions t
        LEFT JOIN public.user_categories uc ON t.transaction_id = uc.transaction_id
        WHERE t.transaction_id = :transaction_id
    """)
    
    result = db.execute(query, {"transaction_id": transaction_id})
    row = result.first()
    
    if not row:
        return None
    
    return TransactionResponse(
        transaction_id=row.transaction_id,
        account_id=row.account_id,
        account_name=row.account_name,
        institution_name=row.institution_name,
        amount=row.amount,
        transacted_date=row.transacted_date,
        description=row.description,
        master_category=row.master_category,
        predicted_master_category=row.predicted_master_category,
        prediction_confidence=row.prediction_confidence,
        model_version=row.model_version,
        notes=row.notes,
        validated=row.validated,
        exclude_from_forecast=row.exclude_from_forecast,
    )


def categorize_transaction(
    db: Session,
    transaction_id: str,
    categorize_request: CategorizeRequest
) -> UserCategory:
    """
    Create or update a user category for a transaction.
    
    Args:
        db: Database session
        transaction_id: Transaction ID to categorize
        categorize_request: Category assignment request
    """
    # Check if user category already exists
    user_category = db.query(UserCategory).filter(
        UserCategory.transaction_id == transaction_id
    ).first()
    
    if user_category:
        # Update existing
        user_category.master_category = categorize_request.master_category
        user_category.source_category = categorize_request.source_category
        if categorize_request.notes is not None:
            user_category.notes = categorize_request.notes
        if categorize_request.validated is not None:
            user_category.validated = categorize_request.validated
        if categorize_request.exclude_from_forecast is not None:
            user_category.exclude_from_forecast = categorize_request.exclude_from_forecast
        user_category.updated_at = datetime.utcnow()
    else:
        # Create new
        user_category = UserCategory(
            transaction_id=transaction_id,
            master_category=categorize_request.master_category,
            source_category=categorize_request.source_category,
            notes=categorize_request.notes,
            validated=categorize_request.validated if categorize_request.validated is not None else False,
            exclude_from_forecast=(
                categorize_request.exclude_from_forecast
                if categorize_request.exclude_from_forecast is not None
                else False
            ),
            updated_at=datetime.utcnow()
        )
        db.add(user_category)
    
    db.commit()
    db.refresh(user_category)
    return user_category


def get_categories(db: Session) -> List[str]:
    """Get active category names for assignment dropdowns."""
    from services.category_service import get_active_category_names
    try:
        return get_active_category_names(db)
    except Exception:
        from init_db import DEFAULT_CATEGORIES
        return sorted(DEFAULT_CATEGORIES)


def get_transactions_filtered(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    view_mode: Optional[str] = None,  # 'unvalidated_predicted', 'unvalidated_unpredicted', 'validated', None (all)
    description_search: Optional[str] = None,
    exclude_low_confidence: bool = False,
    low_confidence_threshold: float = 0.35,
    sort_by: Optional[str] = None,
    sort_order: str = "desc",
) -> dict:
    """
    Get transactions filtered by validation and prediction status.
    
    Args:
        db: Database session
        limit: Maximum number of transactions to return
        offset: Number of transactions to skip
        view_mode: Filter mode:
            - 'unvalidated_predicted': Unvalidated transactions with predictions (not UNCERTAIN)
            - 'unvalidated_unpredicted': Unvalidated transactions without predictions or with UNCERTAIN
            - 'validated': Validated transactions
            - None: All transactions
    """
    params = {
        "limit": limit,
        "offset": offset
    }
    
    # Build WHERE conditions based on view_mode
    conditions = []
    
    if view_mode == 'unvalidated_predicted':
        # Unvalidated AND has prediction that is not "UNCERTAIN"
        conditions.append("COALESCE(uc.validated, false) = false")
        conditions.append("t.predicted_master_category IS NOT NULL")
        conditions.append("t.predicted_master_category != 'UNCERTAIN'")
    elif view_mode == 'unvalidated_unpredicted':
        # Unvalidated AND (no prediction OR prediction is "UNCERTAIN")
        conditions.append("COALESCE(uc.validated, false) = false")
        conditions.append("(t.predicted_master_category IS NULL OR t.predicted_master_category = 'UNCERTAIN')")
    elif view_mode == 'validated':
        # Validated transactions
        conditions.append("COALESCE(uc.validated, false) = true")
    
    # Add description search filter
    if description_search:
        conditions.append("t.description ILIKE :description_search")
        params["description_search"] = f"%{description_search}%"

    if exclude_low_confidence and view_mode == 'unvalidated_predicted':
        conditions.append(
            "(t.prediction_confidence IS NULL OR t.prediction_confidence >= :low_confidence_threshold)"
        )
        params["low_confidence_threshold"] = low_confidence_threshold
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"

    allowed_sort_columns = {
        "transacted_date": "t.transacted_date",
        "prediction_confidence": "t.prediction_confidence",
    }
    order_column = allowed_sort_columns.get(sort_by or "transacted_date", "t.transacted_date")
    order_direction = "ASC" if sort_order.lower() == "asc" else "DESC"
    order_clause = f"{order_column} {order_direction} NULLS LAST"
    
    # First, get total count for pagination
    count_query = text(f"""
        SELECT COUNT(*) as total
        FROM analytics.fct_trxns_with_predictions t
        LEFT JOIN public.user_categories uc ON t.transaction_id = uc.transaction_id
        WHERE {where_clause}
    """)
    count_params = {k: v for k, v in params.items() if k != 'limit' and k != 'offset'}
    count_result = db.execute(count_query, count_params)
    total_count = count_result.scalar() or 0
    
    # Then get the paginated results
    query = text(f"""
        SELECT 
            t.transaction_id,
            t.account_id,
            t.account_name,
            t.institution_name,
            t.amount,
            t.transacted_date,
            t.description,
            COALESCE(uc.master_category, t.master_category) as master_category,
            t.predicted_master_category,
            t.prediction_confidence,
            t.model_version,
            uc.notes,
            COALESCE(uc.validated, false) as validated,
            COALESCE(uc.exclude_from_forecast, false) as exclude_from_forecast
        FROM analytics.fct_trxns_with_predictions t
        LEFT JOIN public.user_categories uc ON t.transaction_id = uc.transaction_id
        WHERE {where_clause}
        ORDER BY {order_clause}
        LIMIT :limit OFFSET :offset
    """)
    
    result = db.execute(query, params)
    
    transactions = []
    for row in result:
        transactions.append(TransactionResponse(
            transaction_id=row.transaction_id,
            account_id=row.account_id,
            account_name=row.account_name,
            institution_name=row.institution_name,
            amount=row.amount,
            transacted_date=row.transacted_date,
            description=row.description,
            master_category=row.master_category,
            predicted_master_category=row.predicted_master_category,
            prediction_confidence=row.prediction_confidence,
            model_version=row.model_version,
            notes=row.notes,
            validated=row.validated,
            exclude_from_forecast=row.exclude_from_forecast,
        ))
    
    return {
        "transactions": transactions,
        "total_count": total_count
    }


def update_validation(db: Session, transaction_id: str, validated: bool) -> UserCategory:
    """Update validation status for a transaction. Creates user_category entry if needed."""
    user_category = db.query(UserCategory).filter(
        UserCategory.transaction_id == transaction_id
    ).first()
    
    if not user_category:
        # Get the predicted or existing category to create the entry
        query = text("""
            SELECT 
                COALESCE(t.master_category, t.predicted_master_category) as category
            FROM analytics.fct_trxns_with_predictions t
            WHERE t.transaction_id = :transaction_id
        """)
        result = db.execute(query, {"transaction_id": transaction_id})
        row = result.first()
        
        if not row or not row.category:
            raise ValueError(f"No category found for transaction {transaction_id}. Please assign a category first.")
        
        # Create new user_category entry
        user_category = UserCategory(
            transaction_id=transaction_id,
            master_category=row.category,
            validated=validated,
            updated_at=datetime.utcnow()
        )
        db.add(user_category)
    else:
        user_category.validated = validated
        user_category.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(user_category)
    return user_category


def update_notes(db: Session, transaction_id: str, notes: Optional[str]) -> UserCategory:
    """Update notes for a transaction."""
    user_category = db.query(UserCategory).filter(
        UserCategory.transaction_id == transaction_id
    ).first()
    
    if not user_category:
        raise ValueError(f"No user category found for transaction {transaction_id}")
    
    user_category.notes = notes
    user_category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user_category)
    return user_category


def update_exclude_from_forecast(
    db: Session,
    transaction_id: str,
    exclude_from_forecast: bool,
) -> UserCategory:
    """Set exclude_from_forecast for a transaction. Creates user_category if needed."""
    user_category = db.query(UserCategory).filter(
        UserCategory.transaction_id == transaction_id
    ).first()

    if not user_category:
        query = text("""
            SELECT COALESCE(t.master_category, t.predicted_master_category) as category
            FROM analytics.fct_trxns_with_predictions t
            WHERE t.transaction_id = :transaction_id
        """)
        result = db.execute(query, {"transaction_id": transaction_id})
        row = result.first()
        if not row or not row.category:
            raise ValueError(
                f"No category found for transaction {transaction_id}. "
                "Please assign a category before excluding from forecast."
            )
        user_category = UserCategory(
            transaction_id=transaction_id,
            master_category=row.category,
            exclude_from_forecast=exclude_from_forecast,
            updated_at=datetime.utcnow(),
        )
        db.add(user_category)
    else:
        user_category.exclude_from_forecast = exclude_from_forecast
        user_category.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user_category)
    return user_category


def bulk_validate_transactions(db: Session, transaction_ids: List[str]) -> int:
    """
    Mark multiple transactions as validated.
    
    Args:
        db: Database session
        transaction_ids: List of transaction IDs to validate
    
    Returns:
        Number of transactions updated
    """
    updated_count = 0
    
    for transaction_id in transaction_ids:
        # Get or create user_category entry
        user_category = db.query(UserCategory).filter(
            UserCategory.transaction_id == transaction_id
        ).first()
        
        if not user_category:
            # Get the predicted or existing category to create the entry
            query = text("""
                SELECT 
                    COALESCE(t.master_category, t.predicted_master_category) as category
                FROM analytics.fct_trxns_with_predictions t
                WHERE t.transaction_id = :transaction_id
            """)
            result = db.execute(query, {"transaction_id": transaction_id})
            row = result.first()
            
            if row and row.category:
                # Create new user_category entry with validated=True
                user_category = UserCategory(
                    transaction_id=transaction_id,
                    master_category=row.category,
                    validated=True,
                    updated_at=datetime.utcnow()
                )
                db.add(user_category)
                updated_count += 1
        else:
            # Update existing entry
            if not user_category.validated:
                user_category.validated = True
                user_category.updated_at = datetime.utcnow()
                updated_count += 1
    
    db.commit()
    return updated_count


def update_validated_transaction_category(
    db: Session,
    transaction_id: str,
    master_category: str,
) -> UserCategory:
    """Update category for a validated transaction (All Data source of truth)."""
    from schemas.transaction import CategorizeRequest

    user_category = db.query(UserCategory).filter(
        UserCategory.transaction_id == transaction_id
    ).first()

    if not user_category or not user_category.validated:
        raise ValueError(
            f"Transaction {transaction_id} is not validated. "
            "Only validated transactions can be edited in All Data."
        )

    result = categorize_transaction(
        db,
        transaction_id,
        CategorizeRequest(
            master_category=master_category,
            source_category=user_category.source_category,
            notes=user_category.notes,
            validated=True,
            exclude_from_forecast=user_category.exclude_from_forecast,
        ),
    )

    from services.dagster_trigger import schedule_editor_category_fix_pipeline
    schedule_editor_category_fix_pipeline()

    return result


def bulk_categorize_validated(db: Session, master_category: str) -> Tuple[int, int]:
    """
    Apply a category to all validated transactions that don't already have that category.
    
    Returns:
        Tuple of (updated_count, total_validated_count)
    """
    # Get all validated transaction IDs
    validated_query = text("""
        SELECT transaction_id, master_category
        FROM public.user_categories
        WHERE validated = true
    """)
    
    result = db.execute(validated_query)
    validated_transactions = {row.transaction_id: row.master_category for row in result}
    
    updated_count = 0
    for transaction_id, current_category in validated_transactions.items():
        if current_category != master_category:
            user_category = db.query(UserCategory).filter(
                UserCategory.transaction_id == transaction_id
            ).first()
            if user_category:
                user_category.master_category = master_category
                user_category.updated_at = datetime.utcnow()
                updated_count += 1
    
    db.commit()
    return updated_count, len(validated_transactions)
