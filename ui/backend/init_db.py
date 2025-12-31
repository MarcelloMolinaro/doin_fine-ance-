"""Initialize the user_categories table."""
from sqlalchemy import text
from db.connection import engine

def init_user_categories_table():
    """Create user_categories table if it doesn't exist."""
    with engine.connect() as conn:
        # Create analytics schema first (required for dbt models)
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
        conn.commit()
        print("✓ analytics schema initialized successfully")

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

if __name__ == "__main__":
    init_user_categories_table()
