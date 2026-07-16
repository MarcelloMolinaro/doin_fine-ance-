"""Shared logic for database backups.

Owns the schedule-file state and the pg_dump/pg_restore subprocess helpers that
were previously duplicated between api/backup.py and api/backup_scheduler.py.
Operations raise :class:`BackupError` on failure; the API layer maps it to a 500.
"""
import json
import logging
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Generator, Optional

from db.connection import (
    POSTGRES_DB,
    POSTGRES_HOST,
    POSTGRES_PASSWORD,
    POSTGRES_PORT,
    POSTGRES_USER,
)

logger = logging.getLogger(__name__)

BACKUP_DIR = os.getenv("BACKUP_DIR", "/app/backups")
SCHEDULE_FILE = Path(BACKUP_DIR) / "schedule.json"
PG_TIMEOUT_SECONDS = int(os.getenv("BACKUP_TIMEOUT_SECONDS", "300"))
DEFAULT_SCHEDULE = {"enabled": False, "cron": "0 2 * * *", "retention_days": 7}


class BackupError(RuntimeError):
    """Raised when a pg_dump/pg_restore operation fails."""


# ---------------------------------------------------------------------------
# Schedule / filesystem state
# ---------------------------------------------------------------------------
def ensure_backup_dir() -> Path:
    """Ensure the backup directory exists and return its Path."""
    path = Path(BACKUP_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_schedule() -> dict:
    """Load the backup schedule from disk, falling back to defaults."""
    if not SCHEDULE_FILE.exists():
        return dict(DEFAULT_SCHEDULE)
    try:
        with open(SCHEDULE_FILE) as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load schedule: {e}")
        return dict(DEFAULT_SCHEDULE)


def save_schedule(data: dict) -> None:
    """Persist the backup schedule to disk."""
    ensure_backup_dir()
    with open(SCHEDULE_FILE, "w") as f:
        json.dump(data, f, indent=2)


def save_next_run(next_run_iso: Optional[str]) -> None:
    """Update only the next_run field of the persisted schedule."""
    try:
        data = load_schedule()
        data["next_run"] = next_run_iso
        save_schedule(data)
    except Exception as e:
        logger.warning(f"Failed to save next_run: {e}")


def apply_retention(retention_days: int) -> None:
    """Delete backups older than retention_days."""
    backup_path = ensure_backup_dir()
    cutoff = datetime.now().timestamp() - (retention_days * 86400)
    for f in backup_path.glob("*.dump"):
        if f.stat().st_mtime < cutoff:
            try:
                f.unlink()
                logger.info(f"Deleted old backup: {f.name}")
            except Exception as e:
                logger.warning(f"Failed to delete {f.name}: {e}")


# ---------------------------------------------------------------------------
# pg_dump / pg_restore
# ---------------------------------------------------------------------------
def _pg_env() -> dict:
    env = os.environ.copy()
    env["PGPASSWORD"] = POSTGRES_PASSWORD
    return env


def _pg_conn_args() -> list:
    return [
        "-h", POSTGRES_HOST,
        "-p", str(POSTGRES_PORT),
        "-U", POSTGRES_USER,
        "-d", POSTGRES_DB,
    ]


def run_pg_dump_stream() -> Generator[bytes, None, None]:
    """Run pg_dump (custom compressed format) and yield the dump as bytes."""
    cmd = ["pg_dump", *_pg_conn_args(), "-Fc", "-f", "-"]
    try:
        proc = subprocess.Popen(
            cmd, env=_pg_env(), stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        for chunk in iter(lambda: proc.stdout.read(65536), b""):
            yield chunk
        proc.wait()
        if proc.returncode != 0:
            err = proc.stderr.read().decode("utf-8", errors="replace")
            logger.error(f"pg_dump failed: {err}")
            raise BackupError(f"pg_dump failed: {err}")
    except FileNotFoundError:
        raise BackupError("pg_dump not found. Ensure postgresql-client is installed.")


def run_pg_dump_to_file(output_path: Path) -> None:
    """Run pg_dump (custom compressed format) writing to output_path."""
    cmd = ["pg_dump", *_pg_conn_args(), "-Fc", "-f", str(output_path)]
    try:
        result = subprocess.run(
            cmd, env=_pg_env(), capture_output=True, text=True, timeout=PG_TIMEOUT_SECONDS
        )
        if result.returncode != 0:
            raise BackupError(result.stderr or "pg_dump failed")
    except subprocess.TimeoutExpired:
        output_path.unlink(missing_ok=True)
        raise BackupError(f"pg_dump timed out after {PG_TIMEOUT_SECONDS} seconds")
    except FileNotFoundError:
        raise BackupError("pg_dump not found. Ensure postgresql-client is installed.")


def run_pg_restore(input_path: Path) -> None:
    """Run pg_restore, dropping existing objects first (-c --if-exists)."""
    cmd = ["pg_restore", *_pg_conn_args(), "-c", "--if-exists", str(input_path)]
    try:
        result = subprocess.run(
            cmd, env=_pg_env(), capture_output=True, text=True, timeout=PG_TIMEOUT_SECONDS
        )
        if result.returncode != 0:
            # pg_restore can return non-zero for warnings; surface stderr.
            raise BackupError(result.stderr.strip() or "pg_restore failed")
    except subprocess.TimeoutExpired:
        raise BackupError(f"Restore timed out after {PG_TIMEOUT_SECONDS} seconds")
    except FileNotFoundError:
        raise BackupError("pg_restore not found. Ensure postgresql-client is installed.")
