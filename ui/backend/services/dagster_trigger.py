"""Trigger Dagster jobs from the UI backend."""
import logging
import threading
from typing import Optional

from constants import (
    EDITOR_FIX_DEBOUNCE_SECONDS,
    JOB_FULL_REFRESH_VALIDATED_RETRAIN_REPREDICT,
    JOB_REFRESH_VALIDATED_RETRAIN_REPREDICT,
)
from services.dagster_client import launch_job

logger = logging.getLogger(__name__)

_editor_fix_timer: Optional[threading.Timer] = None
_editor_fix_lock = threading.Lock()


def trigger_refresh_validated_retrain_repredict() -> Optional[str]:
    """Incremental validated refresh + retrain + repredict."""
    return launch_job(JOB_REFRESH_VALIDATED_RETRAIN_REPREDICT)


def trigger_full_refresh_validated_retrain_repredict() -> Optional[str]:
    """Full refresh validated training table + retrain + repredict."""
    return launch_job(JOB_FULL_REFRESH_VALIDATED_RETRAIN_REPREDICT)


def _run_scheduled_editor_fix():
    try:
        run_id = trigger_full_refresh_validated_retrain_repredict()
        logger.info("Editor category-fix pipeline launched (run_id=%s)", run_id)
    except Exception as e:
        logger.error("Failed to launch editor category-fix pipeline: %s", e)


def schedule_editor_category_fix_pipeline():
    """
    Debounced full refresh + retrain after All Data editor category saves.
    Multiple quick edits launch one job.
    """
    global _editor_fix_timer

    with _editor_fix_lock:
        if _editor_fix_timer is not None:
            _editor_fix_timer.cancel()
        _editor_fix_timer = threading.Timer(EDITOR_FIX_DEBOUNCE_SECONDS, _run_scheduled_editor_fix)
        _editor_fix_timer.daemon = True
        _editor_fix_timer.start()
        logger.info(
            "Editor full-refresh pipeline scheduled in %ss (debounced)",
            EDITOR_FIX_DEBOUNCE_SECONDS,
        )
