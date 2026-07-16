// Central frontend configuration.
// Single source of truth for the API base URL and the confidence thresholds
// used to tag/gate predictions in the UI.

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Predictions below this confidence are treated as "no usable prediction".
export const PREDICTION_CONFIDENCE_THRESHOLD = 0.10

// Predictions at/above PREDICTION_CONFIDENCE_THRESHOLD but below this value are
// shown with a "Low" confidence tag.
export const LOW_CONFIDENCE_THRESHOLD = 0.35
