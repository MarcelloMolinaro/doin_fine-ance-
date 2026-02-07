"""API routes for database backup functionality."""
import os
import subprocess
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Generator, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db.connection import (
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_DB,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = os.getenv("BACKUP_DIR", "/app/backups")
SCHEDULE_FILE = Path(BACKUP_DIR) / "schedule.json"


def _ensure_backup_dir() -> Path:
    """Ensure backup directory exists and return Path."""
    path = Path(BACKUP_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _run_pg_dump_stream() -> Generator[bytes, None, None]:
    """Run pg_dump and yield bytes. Uses custom format (-Fc) for compression."""
    env = os.environ.copy()
    env["PGPASSWORD"] = POSTGRES_PASSWORD
    cmd = [
        "pg_dump",
        "-h", POSTGRES_HOST,
        "-p", str(POSTGRES_PORT),
        "-U", POSTGRES_USER,
        "-d", POSTGRES_DB,
        "-Fc",  # Custom format (compressed)
        "-f", "-",  # stdout
    ]
    try:
        proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        for chunk in iter(lambda: proc.stdout.read(65536), b""):
            yield chunk
        proc.wait()
        if proc.returncode != 0:
            err = proc.stderr.read().decode("utf-8", errors="replace")
            logger.error(f"pg_dump failed: {err}")
            raise HTTPException(status_code=500, detail=f"pg_dump failed: {err}")
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="pg_dump not found. Ensure postgresql-client is installed.",
        )
    except Exception as e:
        logger.exception("Error running pg_dump")
        raise HTTPException(status_code=500, detail=str(e))


def _run_pg_dump_to_file(output_path: Path) -> None:
    """Run pg_dump and write to file."""
    env = os.environ.copy()
    env["PGPASSWORD"] = POSTGRES_PASSWORD
    cmd = [
        "pg_dump",
        "-h", POSTGRES_HOST,
        "-p", str(POSTGRES_PORT),
        "-U", POSTGRES_USER,
        "-d", POSTGRES_DB,
        "-Fc",
        "-f", str(output_path),
    ]
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(result.stderr or "pg_dump failed")
    except subprocess.TimeoutExpired:
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="pg_dump timed out after 5 minutes")
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="pg_dump not found. Ensure postgresql-client is installed.",
        )


def _load_schedule() -> dict:
    """Load schedule from JSON file."""
    if not SCHEDULE_FILE.exists():
        return {"enabled": False, "cron": "0 2 * * *", "retention_days": 7}
    try:
        with open(SCHEDULE_FILE) as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load schedule: {e}")
        return {"enabled": False, "cron": "0 2 * * *", "retention_days": 7}


def _save_schedule(data: dict) -> None:
    """Save schedule to JSON file."""
    _ensure_backup_dir()
    with open(SCHEDULE_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _apply_retention(retention_days: int) -> None:
    """Delete backups older than retention_days."""
    backup_path = _ensure_backup_dir()
    cutoff = datetime.now().timestamp() - (retention_days * 86400)
    for f in backup_path.glob("*.dump"):
        if f.stat().st_mtime < cutoff:
            try:
                f.unlink()
                logger.info(f"Deleted old backup: {f.name}")
            except Exception as e:
                logger.warning(f"Failed to delete {f.name}: {e}")


class ScheduleRequest(BaseModel):
    """Request schema for setting backup schedule."""
    enabled: bool
    cron: Optional[str] = "0 2 * * *"
    retention_days: Optional[int] = 7


class ScheduleResponse(BaseModel):
    """Response schema for backup schedule."""
    enabled: bool
    cron: str
    retention_days: int
    next_run: Optional[str] = None


class BackupInfo(BaseModel):
    """Schema for backup file info."""
    filename: str
    size_bytes: int
    created: str


class BackupListResponse(BaseModel):
    """Response schema for backup list."""
    backups: List[BackupInfo]


class RunBackupResponse(BaseModel):
    """Response schema for manual server backup."""
    success: bool
    filename: str
    message: str


@router.get("/download")
def download_backup():
    """
    Create a manual backup and stream it to the browser for download.
    Uses pg_dump custom format (-Fc) for compression.
    """
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"dagster_backup_{ts}.dump"
    return StreamingResponse(
        _run_pg_dump_stream(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/run", response_model=RunBackupResponse)
def run_server_backup():
    """
    Create a backup and save it to local server storage.
    Used for both manual trigger and scheduled backups.
    """
    backup_dir = _ensure_backup_dir()
    schedule = _load_schedule()
    retention_days = schedule.get("retention_days", 7)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"dagster_backup_{ts}.dump"
    output_path = backup_dir / filename

    try:
        _run_pg_dump_to_file(output_path)
        _apply_retention(retention_days)
        size = output_path.stat().st_size
        logger.info(f"Backup completed: {filename} ({size} bytes)")
        return RunBackupResponse(
            success=True,
            filename=filename,
            message=f"Backup saved: {filename} ({size:,} bytes)",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Backup failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schedule", response_model=ScheduleResponse)
def get_schedule():
    """Get current backup schedule."""
    schedule = _load_schedule()
    return ScheduleResponse(
        enabled=schedule.get("enabled", False),
        cron=schedule.get("cron", "0 2 * * *"),
        retention_days=schedule.get("retention_days", 7),
        next_run=schedule.get("next_run"),
    )


@router.post("/schedule", response_model=ScheduleResponse)
def set_schedule(req: ScheduleRequest):
    """
    Set backup schedule. Cron format: minute hour day month weekday.
    Example: "0 2 * * *" = daily at 2:00 AM.
    """
    data = {
        "enabled": req.enabled,
        "cron": req.cron or "0 2 * * *",
        "retention_days": max(1, min(90, req.retention_days or 7)),
    }
    _save_schedule(data)

    # Import here to avoid circular dependency; scheduler updates next_run
    from api.backup_scheduler import update_schedule
    update_schedule()

    schedule = _load_schedule()
    return ScheduleResponse(
        enabled=schedule.get("enabled", False),
        cron=schedule.get("cron", "0 2 * * *"),
        retention_days=schedule.get("retention_days", 7),
        next_run=schedule.get("next_run"),
    )


@router.get("/list", response_model=BackupListResponse)
def list_backups():
    """List backups saved on the server."""
    backup_dir = _ensure_backup_dir()
    backups = []
    for f in sorted(backup_dir.glob("*.dump"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = f.stat()
        backups.append(
            BackupInfo(
                filename=f.name,
                size_bytes=stat.st_size,
                created=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            )
        )
    return BackupListResponse(backups=backups)
