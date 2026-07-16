"""Initialize database tables and schemas."""
from sqlalchemy import text
from db.connection import engine
from constants import DEFAULT_CATEGORIES


def _run_ddl(conn, sql, params=None):
    """Execute an idempotent DDL/migration statement, isolating failures.

    Index creation and ALTER ... IF NOT EXISTS migrations are best-effort: they
    may already be applied or race with another process. Each runs in its own
    commit so one failure can't roll back the others; on error we roll back and
    move on (the same behavior the hand-rolled try/except blocks had).
    """
    try:
        conn.execute(text(sql), params or {})
        conn.commit()
    except Exception:
        conn.rollback()


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
        conn.commit()

        # Index on transaction_id for faster lookups
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_predicted_transactions_transaction_id
            ON analytics.predicted_transactions(transaction_id)
        """)
        # Index on prediction_timestamp for time-based queries
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_predicted_transactions_timestamp
            ON analytics.predicted_transactions(prediction_timestamp DESC)
        """)
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
        conn.commit()

        # Index on transaction_id for faster lookups and deduplication
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_simplefin_transaction_id
            ON public.simplefin(transaction_id)
        """)
        # Index on transacted_date for time-based queries
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_simplefin_transacted_date
            ON public.simplefin(transacted_date)
        """)
        # Index on account_id for account-based queries
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_simplefin_account_id
            ON public.simplefin(account_id)
        """)
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
                exclude_from_forecast BOOLEAN DEFAULT FALSE,
                updated_by TEXT DEFAULT 'system',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()

        # Add new columns if table already exists (migration)
        _run_ddl(conn, "ALTER TABLE public.user_categories ADD COLUMN IF NOT EXISTS notes TEXT")
        _run_ddl(conn, "ALTER TABLE public.user_categories ADD COLUMN IF NOT EXISTS validated BOOLEAN DEFAULT FALSE")
        _run_ddl(conn, "ALTER TABLE public.user_categories ADD COLUMN IF NOT EXISTS exclude_from_forecast BOOLEAN DEFAULT FALSE")
        # Index on master_category for faster queries
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_user_categories_master_category
            ON public.user_categories(master_category)
        """)
        print("✓ user_categories table initialized successfully")


def init_categories_table():
    """Create categories catalog and seed default categories."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.categories (
                name TEXT PRIMARY KEY,
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()

        for name in DEFAULT_CATEGORIES:
            _run_ddl(
                conn,
                """
                INSERT INTO public.categories (name, is_default, is_active)
                VALUES (:name, TRUE, TRUE)
                ON CONFLICT (name) DO NOTHING
                """,
                {"name": name},
            )

        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_categories_is_active
            ON public.categories(is_active)
        """)
        print("✓ categories table initialized successfully")


def init_model_registry_table():
    """Create model_registry table if it doesn't exist."""
    with engine.connect() as conn:
        # Create table with model metadata and full metrics JSONB
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS analytics.model_registry (
                model_version TEXT PRIMARY KEY,
                training_timestamp TIMESTAMP NOT NULL,
                file_path TEXT,  -- NULL for skipped training attempts
                metrics JSONB NOT NULL,
                status TEXT NOT NULL DEFAULT 'trained',
                is_active BOOLEAN DEFAULT FALSE,
                is_latest BOOLEAN DEFAULT FALSE,
                -- Denormalized fields for easy querying (also in metrics JSONB)
                n_train_samples INTEGER,
                n_test_samples INTEGER,
                n_features INTEGER,
                n_classes INTEGER,
                accuracy NUMERIC,
                macro_f1 NUMERIC,
                weighted_f1 NUMERIC,
                macro_precision NUMERIC,
                macro_recall NUMERIC,
                weighted_precision NUMERIC,
                weighted_recall NUMERIC,
                -- Additional metadata
                reason TEXT,
                message TEXT
            )
        """))
        conn.commit()

        # Index on training_timestamp for time-based queries
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_model_registry_training_timestamp
            ON analytics.model_registry(training_timestamp DESC)
        """)
        # Index on is_active for finding active model
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_model_registry_is_active
            ON analytics.model_registry(is_active)
            WHERE is_active = TRUE
        """)
        # Index on is_latest for finding latest model
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_model_registry_is_latest
            ON analytics.model_registry(is_latest)
            WHERE is_latest = TRUE
        """)
        # GIN index on metrics JSONB for efficient JSON queries
        _run_ddl(conn, """
            CREATE INDEX IF NOT EXISTS idx_model_registry_metrics_gin
            ON analytics.model_registry USING GIN (metrics)
        """)
        # Migration: if table pre-existed with NOT NULL file_path, relax it
        _run_ddl(conn, "ALTER TABLE analytics.model_registry ALTER COLUMN file_path DROP NOT NULL")
        print("✓ model_registry table initialized successfully")


def init_all_tables():
    """Initialize all required database tables and schemas."""
    init_analytics_schema()
    init_predicted_transactions_table()
    init_simplefin_table()
    init_user_categories_table()
    init_categories_table()
    init_model_registry_table()
    print("✓ All database tables initialized successfully")


if __name__ == "__main__":
    init_all_tables()
