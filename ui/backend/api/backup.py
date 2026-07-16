"""API routes for database backup functionality."""
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.backup_service import (
    BackupError,
    apply_retention,
    ensure_backup_dir,
    load_schedule,
    run_pg_dump_stream,
    run_pg_dump_to_file,
    run_pg_restore,
    save_schedule,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backup", tags=["backup"])


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


class RestoreRequest(BaseModel):
    """Request schema for restore from backup."""
    filename: str
    confirm: Optional[str] = None


class RestoreResponse(BaseModel):
    """Response schema for restore."""
    success: bool
    message: str


@router.post("/restore", response_model=RestoreResponse)
def restore_from_backup(req: RestoreRequest):
    """
    Restore database from a backup file stored on the server.
    Requires confirm='RESTORE' to prevent accidental overwrites.
    """
    if req.confirm != "RESTORE":
        raise HTTPException(
            status_code=400,
            detail="Restore requires confirm='RESTORE' in the request body.",
        )
    filename = req.filename.strip()
    if not filename.endswith(".dump"):
        raise HTTPException(status_code=400, detail="Only .dump files can be restored.")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    backup_dir = ensure_backup_dir()
    restore_path = (backup_dir / filename).resolve()
    if not restore_path.is_relative_to(backup_dir.resolve()) or not restore_path.exists():
        raise HTTPException(status_code=404, detail=f"Backup not found: {filename}")

    try:
        run_pg_restore(restore_path)
        logger.info(f"Restore completed: {filename}")
        return RestoreResponse(
            success=True,
            message=f"Database restored from {filename}",
        )
    except BackupError as e:
        logger.error(f"Restore failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download")
def download_backup():
    """
    Create a manual backup and stream it to the browser for download.
    Uses pg_dump custom format (-Fc) for compression.
    """
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"dagster_backup_{ts}.dump"
    return StreamingResponse(
        run_pg_dump_stream(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/run", response_model=RunBackupResponse)
def run_server_backup():
    """
    Create a backup and save it to local server storage.
    Used for both manual trigger and scheduled backups.
    """
    backup_dir = ensure_backup_dir()
    schedule = load_schedule()
    retention_days = schedule.get("retention_days", 7)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"dagster_backup_{ts}.dump"
    output_path = backup_dir / filename

    try:
        run_pg_dump_to_file(output_path)
        apply_retention(retention_days)
        size = output_path.stat().st_size
        logger.info(f"Backup completed: {filename} ({size} bytes)")
        return RunBackupResponse(
            success=True,
            filename=filename,
            message=f"Backup saved: {filename} ({size:,} bytes)",
        )
    except BackupError as e:
        logger.error(f"Backup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schedule", response_model=ScheduleResponse)
def get_schedule():
    """Get current backup schedule."""
    schedule = load_schedule()
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
    save_schedule(data)

    # Import here to avoid circular dependency; scheduler updates next_run
    from api.backup_scheduler import update_schedule
    update_schedule()

    schedule = load_schedule()
    return ScheduleResponse(
        enabled=schedule.get("enabled", False),
        cron=schedule.get("cron", "0 2 * * *"),
        retention_days=schedule.get("retention_days", 7),
        next_run=schedule.get("next_run"),
    )


@router.get("/list", response_model=BackupListResponse)
def list_backups():
    """List backups saved on the server."""
    backup_dir = ensure_backup_dir()
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
