"""Tests for backend shared utilities."""
from datetime import timezone

from utils import utc_now


def test_utc_now_is_timezone_aware():
    now = utc_now()
    assert now.tzinfo is not None


def test_utc_now_is_utc():
    now = utc_now()
    assert now.utcoffset() == timezone.utc.utcoffset(None)
