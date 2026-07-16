"""Small shared utilities for the backend."""
from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return the current time as a timezone-aware UTC datetime.

    Replaces the deprecated ``datetime.utcnow()`` (removed in future Python
    versions), which returned a *naive* datetime. The audit columns are
    ``timestamp without time zone`` and the DB session runs in UTC, so the
    stored wall-clock value is unchanged.
    """
    return datetime.now(timezone.utc)
