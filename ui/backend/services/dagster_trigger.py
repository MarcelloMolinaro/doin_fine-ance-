"""Trigger Dagster jobs from the UI backend."""
import logging
import os
import threading
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_editor_fix_timer: Optional[threading.Timer] = None
_editor_fix_lock = threading.Lock()
EDITOR_FIX_DEBOUNCE_SECONDS = 45


def _launch_dagster_job(job_name: str) -> Optional[str]:
    dagster_url = os.getenv("DAGSTER_URL", "http://dagster:3000")
    graphql_url = f"{dagster_url}/graphql"

    mutation = """
    mutation LaunchRun(
      $repositoryLocationName: String!
      $repositoryName: String!
      $jobName: String!
    ) {
      launchRun(
        executionParams: {
          selector: {
            repositoryLocationName: $repositoryLocationName
            repositoryName: $repositoryName
            jobName: $jobName
          }
        }
      ) {
        __typename
        ... on LaunchRunSuccess {
          run { runId status }
        }
        ... on PythonError { message }
        ... on PipelineNotFoundError { message }
      }
    }
    """

    variables = {
        "jobName": job_name,
        "repositoryLocationName": "repo.py",
        "repositoryName": "__repository__",
    }

    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            graphql_url,
            json={"query": mutation, "variables": variables},
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        result = response.json()

        if "errors" in result:
            raise RuntimeError(result["errors"][0].get("message", "Unknown GraphQL error"))

        launch_result = result.get("data", {}).get("launchRun", {})
        if launch_result.get("__typename") == "LaunchRunSuccess":
            run_info = launch_result.get("run", {})
            return run_info.get("runId") or run_info.get("id")

        error_msg = launch_result.get("message", launch_result.get("__typename", "Unknown error"))
        raise RuntimeError(str(error_msg))


def trigger_refresh_validated_retrain_repredict() -> Optional[str]:
    """Incremental validated refresh + retrain + repredict."""
    return _launch_dagster_job("4_refresh_validated_retrain_repredict")


def trigger_full_refresh_validated_retrain_repredict() -> Optional[str]:
    """Full refresh validated training table + retrain + repredict."""
    return _launch_dagster_job("5_full_refresh_validated_retrain_repredict")


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
