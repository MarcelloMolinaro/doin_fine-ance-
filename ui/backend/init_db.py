"""Initialize database tables and schemas."""
from sqlalchemy import text
from db.connection import engine

def init_analytics_schema():
    """Create analytics schema if it doesn't exist."""
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
        conn.commit()
        print("✓ analytics schema initialized successfully")


def init_predicted_transactions_table():
    """Create predicted_transactions table if it doesn't exist."""
    with engine.connect() as conn:
        # Create table with all columns from fct_trxns_uncategorized plus prediction columns
        # No primary key since we allow multiple predictions per transaction_id (historical predictions)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS analytics.predicted_transactions (
                transaction_id TEXT,
                account_id TEXT,
                original_account_name TEXT,
                account_name TEXT,
                detailed_account_name TEXT,
                owner_name TEXT,
                institution_name TEXT,
                amount NUMERIC,
                posted_date DATE,
                transacted_date DATE,
                description TEXT,
                pending BOOLEAN,
                source_category TEXT,
                master_category TEXT,
                import_timestamp TEXT,
                import_date TEXT,
                source_name TEXT,
                combined_text TEXT,
                day_of_week INTEGER,
                month INTEGER,
                day_of_month INTEGER,
                is_negative INTEGER,
                amount_abs NUMERIC,
                amount_bucket INTEGER,
                has_hotel_keyword INTEGER,
                has_gas_keyword INTEGER,
                has_grocery_keyword INTEGER,
                has_restaurant_keyword INTEGER,
                has_transport_keyword INTEGER,
                has_shop_keyword INTEGER,
                has_flight_keyword INTEGER,
                has_credit_fee_keyword INTEGER,
                has_interest_keyword INTEGER,
                predicted_master_category TEXT,
                prediction_confidence NUMERIC,
                model_version TEXT,
                prediction_timestamp TIMESTAMP
            )
        """))
        
        # Create index on transaction_id for faster lookups
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_predicted_transactions_transaction_id 
                ON analytics.predicted_transactions(transaction_id)
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        # Create index on prediction_timestamp for time-based queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_predicted_transactions_timestamp 
                ON analytics.predicted_transactions(prediction_timestamp DESC)
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        conn.commit()
        print("✓ predicted_transactions table initialized successfully")


def init_simplefin_table():
    """Create simplefin table if it doesn't exist."""
    with engine.connect() as conn:
        # Create table with columns matching the SimpleFIN extractor output
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.simplefin (
                transaction_id TEXT,
                account_id TEXT,
                account_name TEXT,
                institution_domain TEXT,
                institution_name TEXT,
                amount NUMERIC,
                posted BIGINT,
                posted_date TEXT,
                transacted_at BIGINT,
                transacted_date TEXT,
                description TEXT,
                pending BOOLEAN,
                import_timestamp TEXT,
                import_date TEXT,
                extra TEXT
            )
        """))
        
        # Create index on transaction_id for faster lookups and deduplication
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_simplefin_transaction_id 
                ON public.simplefin(transaction_id)
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        # Create index on transacted_date for time-based queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_simplefin_transacted_date 
                ON public.simplefin(transacted_date)
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        # Create index on account_id for account-based queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_simplefin_account_id 
                ON public.simplefin(account_id)
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        conn.commit()
        print("✓ simplefin table initialized successfully")


def init_user_categories_table():
    """Create user_categories table if it doesn't exist."""
    with engine.connect() as conn:
        # Create table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.user_categories (
                transaction_id TEXT PRIMARY KEY,
                master_category TEXT NOT NULL,
                source_category TEXT,
                notes TEXT,
                validated BOOLEAN DEFAULT FALSE,
                updated_by TEXT DEFAULT 'system',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Add new columns if table already exists (migration)
        # Note: DDL statements auto-commit in SQLAlchemy, but we execute them anyway
        try:
            conn.execute(text("""
                ALTER TABLE public.user_categories 
                ADD COLUMN IF NOT EXISTS notes TEXT
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        try:
            conn.execute(text("""
                ALTER TABLE public.user_categories 
                ADD COLUMN IF NOT EXISTS validated BOOLEAN DEFAULT FALSE
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        # Create index on master_category for faster queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_user_categories_master_category 
                ON public.user_categories(master_category)
            """))
            conn.commit()
        except Exception:
            conn.rollback()
        
        conn.commit()
        print("✓ user_categories table initialized successfully")


def init_all_tables():
    """Initialize all required database tables and schemas."""
    init_analytics_schema()
    init_predicted_transactions_table()
    init_simplefin_table()
    init_user_categories_table()
    print("✓ All database tables initialized successfully")

if __name__ == "__main__":
    init_all_tables()
