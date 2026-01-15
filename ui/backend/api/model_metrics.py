"""API routes for Model Metrics functionality."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json
import os
import glob
from datetime import datetime
import logging
from sqlalchemy import text
from db.connection import engine

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/api/model", tags=["model"])


class MetricDataPoint(BaseModel):
    """Single metric data point."""
    training_date: str
    model_version: str
    accuracy: float
    macro_f1: float
    weighted_f1: float
    macro_precision: Optional[float] = None
    macro_recall: Optional[float] = None
    weighted_precision: Optional[float] = None
    weighted_recall: Optional[float] = None
    n_train_samples: int
    n_test_samples: int
    n_features: int
    n_classes: int


class MetricsHistoryResponse(BaseModel):
    """Response schema for metrics history."""
    metrics: List[MetricDataPoint]
    total_count: int


class TrainingStatusResponse(BaseModel):
    """Response schema for latest training status."""
    status: str  # 'trained', 'skipped', 'not_found'
    reason: Optional[str] = None  # 'no_training_data', 'insufficient_data', etc.
    message: Optional[str] = None
    training_date: Optional[str] = None
    n_available: Optional[int] = None
    n_required: Optional[int] = None
    model_version: Optional[str] = None


def parse_timestamp_from_filename(filename: str) -> Optional[datetime]:
    """Extract timestamp from metrics filename like metrics_20251230_055027.json."""
    try:
        # Extract the timestamp part (YYYYMMDD_HHMMSS)
        basename = os.path.basename(filename)
        if not basename.startswith("metrics_") or not basename.endswith(".json"):
            return None
        
        # Remove "metrics_" prefix and ".json" suffix
        timestamp_str = basename[8:-5]  # "metrics_".length = 8, ".json".length = 5
        
        # Parse YYYYMMDD_HHMMSS format
        return datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
    except (ValueError, IndexError) as e:
        logger.warning(f"Failed to parse timestamp from filename {filename}: {e}")
        return None


def get_metrics_directory() -> str:
    """Get the path to the metrics directory."""
    # Try multiple possible paths
    # In Docker, the dagster models directory is mounted at /opt/dagster/models
    # In local development, try relative paths
    possible_paths = [
        "/opt/dagster/models",  # Docker mounted path (from docker-compose volume)
        "/opt/dagster/app/models",  # Alternative Docker path (if dagster container path is accessible)
        "../../dagster/models",  # Relative path from backend (local dev)
        "../dagster/models",  # Alternative relative path
    ]
    
    # Calculate absolute path from backend directory
    current_dir = os.path.dirname(__file__)
    backend_dir = os.path.dirname(current_dir)
    project_root = os.path.dirname(os.path.dirname(backend_dir))
    absolute_path = os.path.join(project_root, "dagster", "models")
    possible_paths.append(absolute_path)
    
    for path in possible_paths:
        if os.path.exists(path):
            logger.info(f"Found metrics directory at: {path}")
            return path
    
    logger.warning(f"Could not find metrics directory. Tried: {possible_paths}")
    # Return the most likely path anyway (let the caller handle the error gracefully)
    return absolute_path


@router.get("/metrics/history", response_model=MetricsHistoryResponse)
def get_metrics_history():
    """Fetch all model metrics from model_registry table and return as time series data."""
    try:
        with engine.connect() as conn:
            # Query all trained models from registry (exclude skipped ones)
            result = conn.execute(text("""
                SELECT 
                    model_version,
                    training_timestamp,
                    metrics,
                    accuracy,
                    macro_f1,
                    weighted_f1,
                    macro_precision,
                    macro_recall,
                    weighted_precision,
                    weighted_recall,
                    n_train_samples,
                    n_test_samples,
                    n_features,
                    n_classes
                FROM analytics.model_registry
                WHERE status = 'trained'
                ORDER BY training_timestamp DESC
            """))
            
            rows = result.fetchall()
            
            if not rows:
                logger.info("No trained models found in model_registry")
                return MetricsHistoryResponse(metrics=[], total_count=0)
            
            metrics_data = []
            
            for row in rows:
                try:
                    # Extract metrics from JSONB or use denormalized columns
                    metrics_json = row.metrics if hasattr(row, 'metrics') else {}
                    if isinstance(metrics_json, str):
                        metrics_json = json.loads(metrics_json)
                    elif not isinstance(metrics_json, dict):
                        metrics_json = {}
                    
                    # Use training_date from metrics JSON or format timestamp
                    training_date_str = metrics_json.get("training_date", "")
                    if not training_date_str:
                        training_date_str = row.training_timestamp.strftime("%Y-%m-%d %H:%M:%S")
                    
                    # Use denormalized columns if available, otherwise fall back to JSON
                    accuracy = float(row.accuracy) if row.accuracy is not None else float(metrics_json.get("accuracy", 0))
                    macro_f1 = float(row.macro_f1) if row.macro_f1 is not None else float(metrics_json.get("macro_f1", 0))
                    weighted_f1 = float(row.weighted_f1) if row.weighted_f1 is not None else float(metrics_json.get("weighted_f1", 0))
                    
                    # Validate required fields
                    if accuracy is None or macro_f1 is None or weighted_f1 is None:
                        logger.warning(f"Skipping model {row.model_version}: missing required metrics")
                        continue
                    
                    metric_point = MetricDataPoint(
                        training_date=training_date_str,
                        model_version=row.model_version,
                        accuracy=accuracy,
                        macro_f1=macro_f1,
                        weighted_f1=weighted_f1,
                        macro_precision=float(row.macro_precision) if row.macro_precision is not None else metrics_json.get("macro_precision"),
                        macro_recall=float(row.macro_recall) if row.macro_recall is not None else metrics_json.get("macro_recall"),
                        weighted_precision=float(row.weighted_precision) if row.weighted_precision is not None else metrics_json.get("weighted_precision"),
                        weighted_recall=float(row.weighted_recall) if row.weighted_recall is not None else metrics_json.get("weighted_recall"),
                        n_train_samples=int(row.n_train_samples) if row.n_train_samples is not None else int(metrics_json.get("n_train_samples", 0)),
                        n_test_samples=int(row.n_test_samples) if row.n_test_samples is not None else int(metrics_json.get("n_test_samples", 0)),
                        n_features=int(row.n_features) if row.n_features is not None else int(metrics_json.get("n_features", 0)),
                        n_classes=int(row.n_classes) if row.n_classes is not None else int(metrics_json.get("n_classes", 0))
                    )
                    
                    metrics_data.append(metric_point)
                    
                except (ValueError, KeyError, TypeError) as e:
                    logger.warning(f"Error processing metrics for model {row.model_version}: {e}")
                    continue
            
            # Sort by training_date (chronologically) - already sorted by timestamp DESC, but reverse for chronological
            metrics_data.reverse()
            
            logger.info(f"Successfully loaded {len(metrics_data)} metrics data points from model_registry")
            return MetricsHistoryResponse(metrics=metrics_data, total_count=len(metrics_data))
            
    except Exception as e:
        logger.error(f"Error querying model_registry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch metrics history: {str(e)}")


@router.get("/training-status", response_model=TrainingStatusResponse)
def get_training_status():
    """Get the latest training status, including if training was skipped."""
    try:
        with engine.connect() as conn:
            # Get the latest model entry (by timestamp)
            result = conn.execute(text("""
                SELECT 
                    model_version,
                    training_timestamp,
                    status,
                    metrics,
                    reason,
                    message,
                    n_train_samples
                FROM analytics.model_registry
                WHERE is_latest = TRUE
                ORDER BY training_timestamp DESC
                LIMIT 1
            """))
            
            row = result.fetchone()
            
            if row is None:
                return TrainingStatusResponse(
                    status='not_found',
                    message='No training has been performed yet'
                )
            
            # Parse metrics JSON
            metrics_json = row.metrics if hasattr(row, 'metrics') else {}
            if isinstance(metrics_json, str):
                metrics_json = json.loads(metrics_json)
            elif not isinstance(metrics_json, dict):
                metrics_json = {}
            
            # Check if training was skipped
            if row.status == 'skipped':
                return TrainingStatusResponse(
                    status='skipped',
                    reason=row.reason or 'unknown',
                    message=row.message or 'Training was skipped',
                    training_date=row.training_timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                    n_available=metrics_json.get('n_available'),
                    n_required=metrics_json.get('n_required', 50)
                )
            
            # Training was successful
            training_date_str = metrics_json.get('training_date', '')
            if not training_date_str:
                training_date_str = row.training_timestamp.strftime('%Y-%m-%d %H:%M:%S')
            
            return TrainingStatusResponse(
                status='trained',
                training_date=training_date_str,
                model_version=row.model_version,
                n_available=int(row.n_train_samples) if row.n_train_samples is not None else metrics_json.get('n_train_samples'),
                n_required=50
            )
            
    except Exception as e:
        logger.error(f"Error querying training status: {e}", exc_info=True)
        return TrainingStatusResponse(
            status='not_found',
            message=f'Error reading training status: {str(e)}'
        )

