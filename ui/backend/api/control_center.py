"""API routes for Control Center functionality."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
import logging
from sqlalchemy import text
from db.connection import engine

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/api/control-center", tags=["control-center"])


class TriggerJobResponse(BaseModel):
    """Response schema for job trigger."""
    success: bool
    message: str
    run_id: Optional[str] = None
    status: Optional[str] = None


class WarningInfo(BaseModel):
    """Schema for warning information."""
    message: str
    timestamp: Optional[str] = None
    run_id: Optional[str] = None


class WarningsResponse(BaseModel):
    """Response schema for warnings."""
    warnings: List[WarningInfo]
    total_count: int


class InitializationStatusResponse(BaseModel):
    """Response schema for initialization status."""
    needs_initialization: bool
    message: Optional[str] = None


@router.post("/trigger-ingest-and-predict", response_model=TriggerJobResponse)
def trigger_ingest_and_predict_job():
    """Trigger Dagster job to ingest data and predict categories."""
    dagster_url = os.getenv("DAGSTER_URL", "http://dagster:3000")
    graphql_url = f"{dagster_url}/graphql"
    
    logger.info(f"Attempting to trigger 2_ingest_and_predict job at {graphql_url}")
    
    # GraphQL mutation to launch the job
    mutation_launch_run = """
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
          run {
            runId
            status
          }
        }
        ... on PythonError {
          message
          stack
        }
        ... on PipelineNotFoundError {
          message
        }
        ... on RunConfigValidationInvalid {
          errors {
            message
            reason
          }
        }
      }
    }
    """
    
    variables = {
        "jobName": "2_ingest_and_predict",
        "repositoryLocationName": "repo.py",
        "repositoryName": "__repository__"
    }
    
    try:
        with httpx.Client(timeout=30.0) as client:
            logger.info(f"Launching Dagster job with variables: {variables}")
            response = client.post(
                graphql_url,
                json={"query": mutation_launch_run, "variables": variables},
                headers={"Content-Type": "application/json"}
            )
            
            logger.info(f"Dagster response status: {response.status_code}")
            
            if response.status_code >= 400:
                result = response.json()
                logger.error(f"Dagster error response: {result}")
                if "errors" in result:
                    error_msg = result["errors"][0].get("message", "Unknown error")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Dagster GraphQL error: {error_msg}"
                    )
                response.raise_for_status()
            
            result = response.json()
            logger.info(f"Dagster response: {result}")
            
            if "errors" in result:
                error_details = result["errors"]
                error_msg = error_details[0].get("message", "Unknown error") if error_details else "Unknown GraphQL error"
                logger.error(f"GraphQL errors: {error_details}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Dagster GraphQL error: {error_msg}"
                )
            
            launch_result = result.get("data", {}).get("launchRun", {})
            
            if launch_result.get("__typename") == "LaunchRunSuccess":
                run_info = launch_result.get("run", {})
                run_id = run_info.get("runId") or run_info.get("id")
                logger.info(f"Successfully launched run: {run_id}")
                return TriggerJobResponse(
                    success=True,
                    message="Dagster job triggered successfully",
                    run_id=run_id,
                    status=run_info.get("status")
                )
            elif launch_result.get("__typename") == "PythonError":
                error_msg = launch_result.get("message", "Unknown error")
                logger.error(f"Python error from Dagster: {error_msg}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Dagster error: {error_msg}"
                )
            elif launch_result.get("__typename") == "PipelineNotFoundError":
                error_msg = launch_result.get("message", "Job not found")
                logger.error(f"PipelineNotFoundError from Dagster: {error_msg}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Job '2_ingest_and_predict' not found in Dagster. Make sure the job is registered."
                )
            elif launch_result.get("__typename") == "RunConfigValidationInvalid":
                errors = launch_result.get("errors", [])
                error_msg = errors[0].get("message", "Invalid run config") if errors else "Invalid run config"
                logger.error(f"Run config validation error: {error_msg}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Dagster run config validation failed: {error_msg}"
                )
            else:
                logger.error(f"Unexpected response type: {launch_result.get('__typename')}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Unexpected response from Dagster: {launch_result.get('__typename')}"
                )
                
    except httpx.RequestError as e:
        logger.error(f"Request error connecting to Dagster: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Dagster at {graphql_url}: {str(e)}"
        )
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e.response, 'text') else str(e)
        logger.error(f"HTTP error from Dagster: {e.response.status_code} - {error_text}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail=f"Dagster returned HTTP {e.response.status_code}: {error_text}"
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_msg = str(e) if str(e) else f"Exception type: {type(e).__name__}"
        logger.error(f"Unexpected error: {error_msg}\n{error_trace}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error triggering Dagster job: {error_msg}"
        )


@router.get("/simplefin-warnings", response_model=WarningsResponse)
def get_simplefin_warnings(limit: int = 50):
    """Fetch all WARNING level logs from recent simplefin_financial_data asset runs."""
    dagster_url = os.getenv("DAGSTER_URL", "http://dagster:3000")
    graphql_url = f"{dagster_url}/graphql"
    
    try:
        with httpx.Client(timeout=30.0) as client:
            result = _get_warnings_from_asset_runs(client, graphql_url, limit)
            return result
            
    except Exception as e:
        logger.error(f"Exception in get_simplefin_warnings: {str(e)}", exc_info=True)
        return WarningsResponse(warnings=[], total_count=0)


def _get_warnings_from_asset_runs(client, graphql_url, limit):
    """Get all WARNING level logs from the most recent 2_ingest_and_predict job run."""
    warnings = []
    step_key = "simplefin_financial_data"
    
    try:
        # Query to get the most recent run that materialized the simplefin_financial_data asset
        # This is more reliable than querying by job name
        query_asset_runs = """
        query GetAssetRuns($assetKey: AssetKeyInput!, $limit: Int!) {
          assetOrError(assetKey: $assetKey) {
            ... on Asset {
              assetMaterializations(limit: $limit) {
                runId
                timestamp
              }
            }
            ... on AssetNotFoundError {
              message
            }
          }
        }
        """
        
        query_run_logs = """
        query GetRunLogs($runId: ID!) {
          runOrError(runId: $runId) {
            ... on Run {
              runId
              eventConnection {
                events {
                  ... on LogMessageEvent {
                    message
                    level
                    timestamp
                    stepKey
                  }
                }
              }
            }
            ... on RunNotFoundError {
              message
            }
          }
        }
        """
        
        variables_asset = {
            "assetKey": {"path": [step_key]},
            "limit": 1  # Only get the most recent materialization
        }
        
        response = client.post(
            graphql_url,
            json={"query": query_asset_runs, "variables": variables_asset},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code >= 400:
            logger.error(f"Failed to fetch asset runs: {response.status_code}")
            return WarningsResponse(warnings=[], total_count=0)
        
        result = response.json()
        
        if "errors" in result:
            logger.error(f"GraphQL errors: {result['errors']}")
            return WarningsResponse(warnings=[], total_count=0)
        
        asset_data = result.get("data", {}).get("assetOrError", {})
        
        if asset_data.get("__typename") == "AssetNotFoundError":
            logger.error(f"Asset not found: {asset_data.get('message')}")
            return WarningsResponse(warnings=[], total_count=0)
        
        materializations = asset_data.get("assetMaterializations", [])
        if not materializations:
            return WarningsResponse(warnings=[], total_count=0)
        
        # Get the most recent materialization (first one is most recent)
        most_recent_materialization = materializations[0]
        run_id = most_recent_materialization.get("runId")
        
        if not run_id:
            logger.error("No run ID found in most recent run")
            return WarningsResponse(warnings=[], total_count=0)
        
        # Get logs for the most recent run
        try:
            variables_logs = {"runId": run_id}
            log_response = client.post(
                graphql_url,
                json={"query": query_run_logs, "variables": variables_logs},
                headers={"Content-Type": "application/json"}
            )
            
            if log_response.status_code == 200:
                log_result = log_response.json()
                
                if "errors" in log_result:
                    logger.error(f"Run {run_id}: GraphQL errors: {log_result['errors']}")
                
                run_data = log_result.get("data", {}).get("runOrError", {})
                
                # Check if this is a Run (has runId or eventConnection) or an error
                if run_data.get("__typename") == "RunNotFoundError":
                    logger.error(f"Run {run_id} not found: {run_data.get('message')}")
                    return WarningsResponse(warnings=[], total_count=0)
                
                # If run_data has runId or eventConnection, it's a Run object
                if run_data and (run_data.get("runId") or run_data.get("eventConnection")):
                    # Extract logs from eventConnection structure
                    event_connection = run_data.get("eventConnection", {})
                    events = event_connection.get("events", [])
                    
                    for event in events:
                        # Events can be empty dicts or LogMessageEvent objects
                        if not event or not isinstance(event, dict):
                            continue
                        
                        # Check if this is a log message event (has message field)
                        if "message" in event:
                            level = event.get("level", "").upper()
                            message = event.get("message", "")
                            step_key_in_log = event.get("stepKey", "")
                            
                            # Collect WARNING and ERROR level logs from simplefin_financial_data step
                            if level in ["WARN", "WARNING", "ERROR"]:
                                # Only include logs from the simplefin_financial_data step
                                if step_key_in_log == "simplefin_financial_data" or not step_key_in_log:
                                    # Filter for SimpleFIN-related content
                                    if message and (
                                        "SimpleFIN" in message or 
                                        "may need attention" in message or
                                        "not provided in time" in message or
                                        "Connection to" in message
                                    ):
                                        warnings.append(WarningInfo(
                                            message=message,
                                            timestamp=event.get("timestamp"),
                                            run_id=run_id
                                        ))
            else:
                logger.error(f"Run {run_id}: Failed to fetch logs, status {log_response.status_code}")
        except Exception as e:
            logger.error(f"Error fetching logs for run {run_id}: {str(e)}", exc_info=True)
        warnings.sort(key=lambda x: x.timestamp or "", reverse=True)
        return WarningsResponse(warnings=warnings[:limit], total_count=len(warnings))
        
    except Exception as e:
        logger.error(f"Exception in _get_warnings_from_asset_runs: {str(e)}", exc_info=True)
        return WarningsResponse(warnings=[], total_count=0)


@router.get("/initialization-status", response_model=InitializationStatusResponse)
def get_initialization_status():
    """Check if the system needs initialization (no data in key tables)."""
    try:
        with engine.connect() as conn:
            # Check if key tables have any data
            # Check simplefin table (source data)
            try:
                simplefin_count = conn.execute(text("""
                    SELECT COUNT(*) FROM public.simplefin
                """)).scalar()
            except Exception:
                # Table doesn't exist or schema doesn't exist
                logger.info("simplefin table not found")
                simplefin_count = 0
            
            # Check if any dbt models have been run (check for validated transactions)
            try:
                validated_count = conn.execute(text("""
                    SELECT COUNT(*) FROM analytics.fct_validated_trxns
                """)).scalar()
            except Exception:
                # Table doesn't exist or schema doesn't exist
                logger.info("fct_validated_trxns table not found")
                validated_count = 0
            
            # If no source data and no validated transactions, needs initialization
            needs_init = (simplefin_count == 0) and (validated_count == 0)
            
            if needs_init:
                return InitializationStatusResponse(
                    needs_initialization=True,
                    message="No data found. Please run initialization to set up the pipeline."
                )
            else:
                return InitializationStatusResponse(
                    needs_initialization=False,
                    message="System is initialized."
                )
                
    except Exception as e:
        # If we can't check, assume we need initialization
        logger.info(f"Error checking initialization status: {str(e)}")
        return InitializationStatusResponse(
            needs_initialization=True,
            message="Unable to check initialization status. Please run initialization."
        )


@router.post("/trigger-initialization", response_model=TriggerJobResponse)
def trigger_initialization():
    """Trigger Dagster initialization job (1_dagster_init)."""
    dagster_url = os.getenv("DAGSTER_URL", "http://dagster:3000")
    graphql_url = f"{dagster_url}/graphql"
    
    logger.info(f"Attempting to trigger 1_dagster_init job at {graphql_url}")
    
    # GraphQL mutation to launch the job
    mutation_launch_run = """
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
          run {
            runId
            status
          }
        }
        ... on PythonError {
          message
          stack
        }
        ... on PipelineNotFoundError {
          message
        }
        ... on RunConfigValidationInvalid {
          errors {
            message
            reason
          }
        }
      }
    }
    """
    
    variables = {
        "jobName": "1_dagster_init",
        "repositoryLocationName": "repo.py",
        "repositoryName": "__repository__"
    }
    
    try:
        with httpx.Client(timeout=300.0) as client:  # Longer timeout for initialization
            logger.info(f"Launching Dagster initialization job with variables: {variables}")
            response = client.post(
                graphql_url,
                json={"query": mutation_launch_run, "variables": variables},
                headers={"Content-Type": "application/json"}
            )
            
            logger.info(f"Dagster response status: {response.status_code}")
            
            if response.status_code >= 400:
                result = response.json()
                logger.error(f"Dagster error response: {result}")
                if "errors" in result:
                    error_msg = result["errors"][0].get("message", "Unknown error")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Dagster GraphQL error: {error_msg}"
                    )
                response.raise_for_status()
            
            result = response.json()
            logger.info(f"Dagster response: {result}")
            
            if "errors" in result:
                error_details = result["errors"]
                error_msg = error_details[0].get("message", "Unknown error") if error_details else "Unknown GraphQL error"
                logger.error(f"GraphQL errors: {error_details}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Dagster GraphQL error: {error_msg}"
                )
            
            launch_result = result.get("data", {}).get("launchRun", {})
            
            if launch_result.get("__typename") == "LaunchRunSuccess":
                run_info = launch_result.get("run", {})
                run_id = run_info.get("runId") or run_info.get("id")
                logger.info(f"Successfully launched initialization run: {run_id}")
                return TriggerJobResponse(
                    success=True,
                    message="Initialization job triggered successfully. This may take several minutes.",
                    run_id=run_id,
                    status=run_info.get("status")
                )
            elif launch_result.get("__typename") == "PythonError":
                error_msg = launch_result.get("message", "Unknown error")
                logger.error(f"Python error from Dagster: {error_msg}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Dagster error: {error_msg}"
                )
            elif launch_result.get("__typename") == "PipelineNotFoundError":
                error_msg = launch_result.get("message", "Job not found")
                logger.error(f"PipelineNotFoundError from Dagster: {error_msg}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Initialization job '1_dagster_init' not found in Dagster. Make sure the job is registered."
                )
            elif launch_result.get("__typename") == "RunConfigValidationInvalid":
                errors = launch_result.get("errors", [])
                error_msg = errors[0].get("message", "Invalid run config") if errors else "Invalid run config"
                logger.error(f"Run config validation error: {error_msg}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Dagster run config validation failed: {error_msg}"
                )
            else:
                logger.error(f"Unexpected response type: {launch_result.get('__typename')}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Unexpected response from Dagster: {launch_result.get('__typename')}"
                )
                
    except httpx.RequestError as e:
        logger.error(f"Request error connecting to Dagster: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Dagster at {graphql_url}: {str(e)}"
        )
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e.response, 'text') else str(e)
        logger.error(f"HTTP error from Dagster: {e.response.status_code} - {error_text}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail=f"Dagster returned HTTP {e.response.status_code}: {error_text}"
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_msg = str(e) if str(e) else f"Exception type: {type(e).__name__}"
        logger.error(f"Unexpected error: {error_msg}\n{error_trace}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error triggering initialization job: {error_msg}"
        )

