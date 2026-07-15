"""Connection health checks inferred from latest SimpleFIN poll data."""
from datetime import date, datetime, timedelta
from typing import Optional, Tuple

# Days until oldest stored history hits the rolling window edge
LOSS_WARNING_DAYS = 30
LOSS_UNHEALTHY_DAYS = 14


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw[:19], fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def compute_connection_health(
    last_successful_load: Optional[str],
    poll_earliest_transaction_date: Optional[str],
    poll_latest_transaction_date: Optional[str],
    oldest_stored_transaction_date: Optional[str],
    today: Optional[date] = None,
) -> dict:
    """
    Infer institution lookback from the latest ingest poll only.

    lookback_days: span of transaction dates returned on the latest poll
    (poll_latest - poll_earliest). This reflects what the institution exposed
    on the most recent load — not all-time stored history.
    """
    today = today or date.today()
    poll_date = _parse_date(last_successful_load)
    poll_earliest = _parse_date(poll_earliest_transaction_date)
    poll_latest = _parse_date(poll_latest_transaction_date)
    oldest_stored = _parse_date(oldest_stored_transaction_date)

    days_since_load = (today - poll_date).days if poll_date else None
    days_since_latest_txn = (today - poll_latest).days if poll_latest else None

    lookback_days = None
    if poll_earliest and poll_latest:
        lookback_days = max((poll_latest - poll_earliest).days, 0)
    elif poll_date and poll_earliest:
        lookback_days = max((poll_date - poll_earliest).days, 0)

    days_until_loss = None
    if lookback_days is not None and oldest_stored is not None:
        window_edge = today - timedelta(days=lookback_days)
        days_until_loss = (oldest_stored - window_edge).days

    status, message = _health_status(
        lookback_days=lookback_days,
        days_until_loss=days_until_loss,
        days_since_load=days_since_load,
        days_since_latest_txn=days_since_latest_txn,
    )

    return {
        "lookback_days": lookback_days,
        "buffer_days": days_until_loss,
        "days_since_last_load": days_since_load,
        "days_since_latest_transaction": days_since_latest_txn,
        "health_status": status,
        "health_message": message,
    }


def _health_status(
    lookback_days: Optional[int],
    days_until_loss: Optional[int],
    days_since_load: Optional[int],
    days_since_latest_txn: Optional[int],
) -> Tuple[str, str]:
    if days_until_loss is not None and days_until_loss > 0:
        if days_until_loss <= LOSS_UNHEALTHY_DAYS:
            return (
                "unhealthy",
                f"Only {days_until_loss} day{'s' if days_until_loss != 1 else ''} before stored "
                f"transactions start falling off the ~{lookback_days}-day window.",
            )
        if days_until_loss <= LOSS_WARNING_DAYS:
            return (
                "warning",
                f"{days_until_loss} day{'s' if days_until_loss != 1 else ''} before stored "
                f"transactions approach the ~{lookback_days}-day window edge.",
            )

    if lookback_days is None:
        return (
            "warning",
            "Could not infer lookback from the latest poll. Run ingest to refresh.",
        )

    if days_since_latest_txn is not None and days_since_latest_txn > 30:
        return (
            "warning",
            f"Latest transaction is {days_since_latest_txn} days old. Account may be inactive.",
        )

    if days_until_loss is not None and days_until_loss > LOSS_WARNING_DAYS:
        return (
            "healthy",
            f"{days_until_loss} days until history loss (~{lookback_days}-day inferred window).",
        )

    if days_until_loss is not None and days_until_loss <= 0:
        return (
            "healthy",
            f"History already stored locally ({abs(days_until_loss)} days past window edge, "
            f"~{lookback_days}-day inferred window).",
        )

    return ("healthy", f"~{lookback_days}-day window inferred from latest poll.")
