"""Shared client for launching Dagster jobs via the GraphQL API.

Previously the launch-run GraphQL mutation and its response handling were
copy-pasted three times (twice in control_center.py, once in dagster_trigger.py).
This module is the single implementation; callers map DagsterClientError
subclasses to HTTP responses via their ``status_code`` attribute.
"""
import logging
from typing import Optional

import httpx

from constants import (
    DAGSTER_REPOSITORY_LOCATION_NAME,
    DAGSTER_REPOSITORY_NAME,
    DAGSTER_URL,
)

logger = logging.getLogger(__name__)

_LAUNCH_RUN_MUTATION = """
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
    ... on PythonError { message stack }
    ... on PipelineNotFoundError { message }
    ... on RunConfigValidationInvalid { errors { message reason } }
  }
}
"""


class DagsterClientError(Exception):
    """Base error for Dagster job launches. ``status_code`` maps to an HTTP code."""

    status_code = 500

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class DagsterConnectionError(DagsterClientError):
    """Could not reach the Dagster GraphQL endpoint."""

    status_code = 503


class DagsterJobNotFoundError(DagsterClientError):
    """The requested job is not registered in Dagster."""

    status_code = 404


class DagsterConfigInvalidError(DagsterClientError):
    """The run config failed Dagster validation."""

    status_code = 400


def launch_job(job_name: str, timeout: float = 30.0) -> Optional[str]:
    """Launch a Dagster job by name and return its run_id.

    Raises a :class:`DagsterClientError` subclass on any failure.
    """
    graphql_url = f"{DAGSTER_URL}/graphql"
    variables = {
        "jobName": job_name,
        "repositoryLocationName": DAGSTER_REPOSITORY_LOCATION_NAME,
        "repositoryName": DAGSTER_REPOSITORY_NAME,
    }

    logger.info("Launching Dagster job '%s' at %s", job_name, graphql_url)

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(
                graphql_url,
                json={"query": _LAUNCH_RUN_MUTATION, "variables": variables},
                headers={"Content-Type": "application/json"},
            )

            if response.status_code >= 400:
                result = response.json()
                if "errors" in result:
                    msg = result["errors"][0].get("message", "Unknown error")
                    raise DagsterClientError(f"Dagster GraphQL error: {msg}")
                response.raise_for_status()

            result = response.json()
    except httpx.HTTPStatusError as e:
        error_text = getattr(e.response, "text", str(e))
        logger.error("HTTP error from Dagster: %s - %s", e.response.status_code, error_text)
        raise DagsterConnectionError(
            f"Dagster returned HTTP {e.response.status_code}: {error_text}"
        )
    except httpx.RequestError as e:
        logger.error("Request error connecting to Dagster: %s", e)
        raise DagsterConnectionError(f"Failed to connect to Dagster at {graphql_url}: {e}")

    if "errors" in result:
        errors = result["errors"]
        msg = errors[0].get("message", "Unknown error") if errors else "Unknown GraphQL error"
        logger.error("GraphQL errors: %s", errors)
        raise DagsterClientError(f"Dagster GraphQL error: {msg}")

    launch_result = result.get("data", {}).get("launchRun", {})
    typename = launch_result.get("__typename")

    if typename == "LaunchRunSuccess":
        run_info = launch_result.get("run", {})
        run_id = run_info.get("runId") or run_info.get("id")
        logger.info("Successfully launched run: %s", run_id)
        return run_id
    if typename == "PythonError":
        raise DagsterClientError(f"Dagster error: {launch_result.get('message', 'Unknown error')}")
    if typename == "PipelineNotFoundError":
        raise DagsterJobNotFoundError(
            f"Job '{job_name}' not found in Dagster. Make sure the job is registered."
        )
    if typename == "RunConfigValidationInvalid":
        errors = launch_result.get("errors", [])
        msg = errors[0].get("message", "Invalid run config") if errors else "Invalid run config"
        raise DagsterConfigInvalidError(f"Dagster run config validation failed: {msg}")

    raise DagsterClientError(f"Unexpected response from Dagster: {typename}")
