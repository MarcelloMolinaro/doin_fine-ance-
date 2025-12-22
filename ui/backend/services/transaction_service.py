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
            COALESCE(uc.validated, false) as validated
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
            validated=row.validated
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
            COALESCE(uc.validated, false) as validated
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
        validated=row.validated
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
        user_category.updated_at = datetime.utcnow()
    else:
        # Create new
        user_category = UserCategory(
            transaction_id=transaction_id,
            master_category=categorize_request.master_category,
            source_category=categorize_request.source_category,
            notes=categorize_request.notes,
            validated=categorize_request.validated if categorize_request.validated is not None else False,
            updated_at=datetime.utcnow()
        )
        db.add(user_category)
    
    db.commit()
    db.refresh(user_category)
    return user_category


def get_categories(db: Session) -> List[str]:
    """Get list of unique master categories from training data, user categories, transactions, and predictions."""
    categories = set()
    
    # First, get ALL categories from training data (fct_trxns_categorized)
    # This ensures all categories the model was trained on are available
    # Wrap in try/except in case table doesn't exist yet
    try:
        training_categories_query = text("""
            SELECT DISTINCT master_category 
            FROM analytics.fct_trxns_categorized 
            WHERE master_category IS NOT NULL
        """)
        training_result = db.execute(training_categories_query)
        for row in training_result:
            if row.master_category:
                categories.add(row.master_category)
    except Exception as e:
        # Table might not exist yet, that's okay - continue with other sources
        pass
    
    # Get categories from user_categories table
    try:
        user_categories_query = text("""
            SELECT DISTINCT master_category 
            FROM public.user_categories 
            WHERE master_category IS NOT NULL
        """)
        user_result = db.execute(user_categories_query)
        for row in user_result:
            if row.master_category:
                categories.add(row.master_category)
    except Exception as e:
        # Table might not exist yet, that's okay
        pass
    
    # Get from transactions (source categories)
    try:
        transaction_categories_query = text("""
            SELECT DISTINCT master_category 
            FROM analytics.fct_trxns_with_predictions 
            WHERE master_category IS NOT NULL
        """)
        trans_result = db.execute(transaction_categories_query)
        for row in trans_result:
            if row.master_category:
                categories.add(row.master_category)
    except Exception as e:
        # Table might not exist yet, that's okay
        pass
    
    # Also get predicted categories (so users can see what the model predicts)
    try:
        predicted_categories_query = text("""
            SELECT DISTINCT predicted_master_category 
            FROM analytics.fct_trxns_with_predictions 
            WHERE predicted_master_category IS NOT NULL
        """)
        predicted_result = db.execute(predicted_categories_query)
        for row in predicted_result:
            if row.predicted_master_category:
                categories.add(row.predicted_master_category)
    except Exception as e:
        # Table might not exist yet, that's okay
        pass
    
    # Add common categories if the list is empty (fallback)
    if not categories:
        categories = {
            "Dining out", "Groceries", "Income", "Bars & Restaurants",
            "Auto & Transport", "Bills & Utilities", "Rent", "Entertainment",
            "Shopping", "Travel", "Gas & Fuel", "Coffee Shops", "Restaurants"
        }
    
    # Filter out UNCERTAIN - users don't need to assign this category
    categories.discard('UNCERTAIN')
    
    return sorted(list(categories))


def get_transactions_filtered(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    view_mode: Optional[str] = None,  # 'unvalidated_predicted', 'unvalidated_unpredicted', 'validated', None (all)
    description_search: Optional[str] = None
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
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # First, get total count for pagination
    count_query = text(f"""
        SELECT COUNT(*) as total
        FROM analytics.fct_trxns_with_predictions t
        LEFT JOIN public.user_categories uc ON t.transaction_id = uc.transaction_id
        WHERE {where_clause}
    """)
    count_params = {k: v for k, v in params.items() if k != 'limit' and k != 'offset'}
    if description_search:
        count_params["description_search"] = f"%{description_search}%"
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
            COALESCE(uc.validated, false) as validated
        FROM analytics.fct_trxns_with_predictions t
        LEFT JOIN public.user_categories uc ON t.transaction_id = uc.transaction_id
        WHERE {where_clause}
        ORDER BY t.transacted_date DESC NULLS LAST
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
            validated=row.validated
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
