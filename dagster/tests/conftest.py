"""Make the dagster app modules importable (they use top-level imports)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
