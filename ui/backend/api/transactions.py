"""API routes for transaction management."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from db.connection import get_db
import httpx
import os
from services.transaction_service import (
    get_transactions,
    get_transaction_by_id,
    categorize_transaction,
    get_categories,
    get_transactions_filtered,
    update_validation,
    update_notes,
    bulk_validate_transactions
)
from schemas.transaction import (
    TransactionResponse, 
    CategorizeRequest, 
    CategorizeResponse,
    UpdateValidationRequest,
    UpdateNotesRequest
)


class BulkValidateRequest(BaseModel):
    """Request schema for bulk validation."""
    transaction_ids: List[str] = Field(..., description="List of transaction IDs to validate")

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("")
def list_transactions(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    view_mode: Optional[str] = Query(None, description="View mode: 'unvalidated_predicted', 'unvalidated_unpredicted', or 'validated'"),
    description_search: Optional[str] = Query(None, description="Search filter for description field"),
    db: Session = Depends(get_db)
):
    """Get list of transactions filtered by validation and prediction status."""
    result = get_transactions_filtered(
        db, 
        limit=limit, 
        offset=offset,
        view_mode=view_mode,
        description_search=description_search
    )
    return result


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: str, db: Session = Depends(get_db)):
    """Get a single transaction by ID."""
    transaction = get_transaction_by_id(db, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


@router.post("/{transaction_id}/categorize", response_model=CategorizeResponse)
def categorize_transaction_endpoint(
    transaction_id: str,
    request: CategorizeRequest,
    db: Session = Depends(get_db)
):
    """Categorize a transaction with a master category."""
    # Verify transaction exists
    transaction = get_transaction_by_id(db, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Create/update category
    user_category = categorize_transaction(db, transaction_id, request)
    
    return CategorizeResponse(
        transaction_id=user_category.transaction_id,
        master_category=user_category.master_category,
        source_category=user_category.source_category,
        updated_at=user_category.updated_at
    )


@router.get("/categories/list", response_model=List[str])
def list_categories(db: Session = Depends(get_db)):
    """Get list of available categories."""
    try:
        return get_categories(db)
    except Exception as e:
        # Log error and return fallback categories
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching categories: {str(e)}")
        # Return fallback categories so UI doesn't break
        return sorted([
            "Dining out", "Groceries", "Income", "Bars & Restaurants",
            "Auto & Transport", "Bills & Utilities", "Rent", "Entertainment",
            "Shopping", "Travel", "Gas & Fuel", "Coffee Shops", "Restaurants"
        ])


@router.put("/{transaction_id}/validate")
def update_transaction_validation(
    transaction_id: str,
    request: UpdateValidationRequest,
    db: Session = Depends(get_db)
):
    """Update validation status for a transaction."""
    try:
        user_category = update_validation(db, transaction_id, request.validated)
        return {"transaction_id": transaction_id, "validated": user_category.validated}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{transaction_id}/notes")
def update_transaction_notes(
    transaction_id: str,
    request: UpdateNotesRequest,
    db: Session = Depends(get_db)
):
    """Update notes for a transaction."""
    try:
        user_category = update_notes(db, transaction_id, request.notes)
        return {"transaction_id": transaction_id, "notes": user_category.notes}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/bulk-validate")
def bulk_validate_transactions_endpoint(
    request: BulkValidateRequest,
    db: Session = Depends(get_db)
):
    """Mark multiple transactions as validated."""
    updated_count = bulk_validate_transactions(db, request.transaction_ids)
    return {
        "message": f"Marked {updated_count} transactions as validated",
        "updated_count": updated_count
    }


@router.post("/trigger-refresh-validated")
def trigger_refresh_validated_trxns():
    """Trigger Dagster job to refresh fct_validated_trxns model."""
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    
    # Dagster GraphQL endpoint - use internal Docker network name
    dagster_url = os.getenv("DAGSTER_URL", "http://dagster:3000")
    graphql_url = f"{dagster_url}/graphql"
    
    logger.info(f"Attempting to trigger Dagster job at {graphql_url}")
    
    # GraphQL mutation to launch the job
    # Repository name is '__repository__' (Dagster's default when loading from python_file with attribute)
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
    
    # Known values from workspace.yaml and Dagster's default repository naming
    variables = {
        "jobName": "refresh_validated_trxns",
        "repositoryLocationName": "repo.py",
        "repositoryName": "__repository__"  # Dagster's default when loading from python_file
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
            
            # Don't raise on 400 - we want to see the error details
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
                    detail=f"Dagster GraphQL error: {error_msg}. Full response: {result}"
                )
            
            launch_result = result.get("data", {}).get("launchRun", {})
            
            if launch_result.get("__typename") == "LaunchRunSuccess":
                run_info = launch_result.get("run", {})
                run_id = run_info.get("runId") or run_info.get("id")  # Try both field names
                logger.info(f"Successfully launched run: {run_id}")
                return {
                    "success": True,
                    "message": "Dagster job triggered successfully",
                    "run_id": run_id,
                    "status": run_info.get("status")
                }
            elif launch_result.get("__typename") == "PythonError":
                error_msg = launch_result.get("message", "Unknown error")
                logger.error(f"Python error from Dagster: {error_msg}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Dagster error: {error_msg}"
                )
            elif launch_result.get("__typename") == "PipelineNotFoundError":
                error_msg = launch_result.get("message", "Job not found")
                logger.error(f"PipelineNotFoundError from Dagster: {error_msg}. Full result: {launch_result}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Job 'refresh_validated_trxns' not found in Dagster. Make sure the job is registered. Error: {error_msg}"
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
                logger.error(f"Unexpected response type: {launch_result.get('__typename')}, full result: {launch_result}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Unexpected response from Dagster. Type: {launch_result.get('__typename')}, Full response: {launch_result}"
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
        # Re-raise HTTPExceptions as-is (they already have proper error messages)
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_msg = str(e) if str(e) else f"Exception type: {type(e).__name__}"
        logger.error(f"Unexpected error: {error_msg}\n{error_trace}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error triggering Dagster job: {error_msg}. Trace: {error_trace[:500]}"
        )
