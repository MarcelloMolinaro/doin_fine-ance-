"""API routes for Model Metrics functionality."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json
import os
import glob
from datetime import datetime
import logging

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
    """Fetch all model metrics files and return as time series data."""
    metrics_dir = get_metrics_directory()
    
    if not os.path.exists(metrics_dir):
        logger.warning(f"Metrics directory does not exist: {metrics_dir}")
        return MetricsHistoryResponse(metrics=[], total_count=0)
    
    # Find all metrics JSON files (excluding metrics_latest.json)
    pattern = os.path.join(metrics_dir, "metrics_*.json")
    metrics_files = [f for f in glob.glob(pattern) if not f.endswith("metrics_latest.json")]
    
    if not metrics_files:
        logger.info(f"No metrics files found in {metrics_dir}")
        return MetricsHistoryResponse(metrics=[], total_count=0)
    
    metrics_data = []
    
    for file_path in metrics_files:
        try:
            # Parse timestamp from filename as primary source
            file_timestamp = parse_timestamp_from_filename(file_path)
            
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            # Use training_date from file if available, otherwise use filename timestamp
            training_date_str = data.get("training_date", "")
            if not training_date_str and file_timestamp:
                training_date_str = file_timestamp.strftime("%Y-%m-%d %H:%M:%S")
            
            # Validate required fields
            if not all(key in data for key in ["accuracy", "macro_f1", "weighted_f1", "n_train_samples", "n_test_samples"]):
                logger.warning(f"Skipping {file_path}: missing required fields")
                continue
            
            metric_point = MetricDataPoint(
                training_date=training_date_str,
                model_version=data.get("model_version", ""),
                accuracy=float(data["accuracy"]),
                macro_f1=float(data["macro_f1"]),
                weighted_f1=float(data["weighted_f1"]),
                macro_precision=float(data["macro_precision"]) if "macro_precision" in data else None,
                macro_recall=float(data["macro_recall"]) if "macro_recall" in data else None,
                weighted_precision=float(data["weighted_precision"]) if "weighted_precision" in data else None,
                weighted_recall=float(data["weighted_recall"]) if "weighted_recall" in data else None,
                n_train_samples=int(data["n_train_samples"]),
                n_test_samples=int(data["n_test_samples"]),
                n_features=int(data.get("n_features", 0)),
                n_classes=int(data.get("n_classes", 0))
            )
            
            metrics_data.append(metric_point)
            
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"Error parsing metrics file {file_path}: {e}")
            continue
    
    # Sort by training_date (chronologically)
    try:
        metrics_data.sort(key=lambda x: datetime.strptime(x.training_date, "%Y-%m-%d %H:%M:%S"))
    except ValueError as e:
        logger.warning(f"Error sorting metrics by date: {e}")
        # If sorting fails, keep original order
    
    logger.info(f"Successfully loaded {len(metrics_data)} metrics data points")
    return MetricsHistoryResponse(metrics=metrics_data, total_count=len(metrics_data))


@router.get("/training-status", response_model=TrainingStatusResponse)
def get_training_status():
    """Get the latest training status, including if training was skipped."""
    metrics_dir = get_metrics_directory()
    
    if not os.path.exists(metrics_dir):
        return TrainingStatusResponse(
            status='not_found',
            message='Metrics directory not found'
        )
    
    # Check for latest metrics file
    latest_metrics_path = os.path.join(metrics_dir, "metrics_latest.json")
    
    if not os.path.exists(latest_metrics_path):
        return TrainingStatusResponse(
            status='not_found',
            message='No training has been performed yet'
        )
    
    try:
        with open(latest_metrics_path, 'r') as f:
            data = json.load(f)
        
        # Check if training was skipped
        if data.get('status') == 'skipped':
            return TrainingStatusResponse(
                status='skipped',
                reason=data.get('reason', 'unknown'),
                message=data.get('message', 'Training was skipped'),
                training_date=data.get('training_date'),
                n_available=data.get('n_available'),
                n_required=data.get('n_required', 50)
            )
        
        # Training was successful
        return TrainingStatusResponse(
            status='trained',
            training_date=data.get('training_date'),
            model_version=data.get('model_version'),
            n_available=data.get('n_train_samples'),
            n_required=50
        )
        
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Error reading latest metrics file: {e}")
        return TrainingStatusResponse(
            status='not_found',
            message=f'Error reading training status: {str(e)}'
        )

