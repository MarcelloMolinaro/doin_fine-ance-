"""Scheduler for automatic database backups."""
import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from services.backup_service import (
    apply_retention,
    ensure_backup_dir,
    load_schedule,
    run_pg_dump_to_file,
    save_next_run,
)

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_scheduled_backup() -> None:
    """Execute a scheduled backup. Called by APScheduler."""
    try:
        schedule = load_schedule()
        retention_days = schedule.get("retention_days", 7)
        backup_dir = ensure_backup_dir()
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"dagster_backup_{ts}.dump"
        output_path = backup_dir / filename

        run_pg_dump_to_file(output_path)
        apply_retention(retention_days)
        logger.info(f"Scheduled backup completed: {filename}")
    except Exception as e:
        logger.exception(f"Scheduled backup failed: {e}")


def _get_next_run_iso() -> str | None:
    """Get next scheduled run as ISO string."""
    if _scheduler is None:
        return None
    jobs = _scheduler.get_jobs()
    if not jobs:
        return None
    next_run = jobs[0].next_run_time
    return next_run.isoformat() if next_run else None


def update_schedule() -> None:
    """Load schedule and update the scheduler job."""
    global _scheduler
    if _scheduler is None:
        return
    schedule = load_schedule()
    _scheduler.remove_all_jobs()
    if schedule.get("enabled"):
        cron = schedule.get("cron", "0 2 * * *")
        parts = cron.split()
        if len(parts) >= 5:
            try:
                trigger = CronTrigger(
                    minute=parts[0],
                    hour=parts[1],
                    day=parts[2],
                    month=parts[3],
                    day_of_week=parts[4],
                )
                _scheduler.add_job(_run_scheduled_backup, trigger)
                next_iso = _get_next_run_iso()
                save_next_run(next_iso)
                logger.info(f"Backup schedule updated: cron={cron}, next={next_iso}")
            except Exception as e:
                logger.error(f"Invalid cron expression '{cron}': {e}")
        else:
            logger.warning("Cron expression must have 5 fields (minute hour day month weekday)")
    else:
        save_next_run(None)
        logger.info("Backup schedule disabled")


def start_scheduler() -> None:
    """Start the backup scheduler."""
    global _scheduler
    _scheduler = BackgroundScheduler()
    _scheduler.start()
    update_schedule()
    logger.info("Backup scheduler started")


def shutdown_scheduler() -> None:
    """Shutdown the backup scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Backup scheduler stopped")
