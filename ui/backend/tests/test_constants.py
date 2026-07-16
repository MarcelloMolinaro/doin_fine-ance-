"""Sanity checks for shared backend constants."""
import constants


def test_default_categories_are_unique():
    assert len(constants.DEFAULT_CATEGORIES) == len(set(constants.DEFAULT_CATEGORIES))


def test_default_categories_non_empty():
    assert constants.DEFAULT_CATEGORIES
    assert all(isinstance(c, str) and c.strip() for c in constants.DEFAULT_CATEGORIES)


def test_job_names_are_distinct():
    jobs = {
        constants.JOB_INITIALIZATION,
        constants.JOB_INGEST_AND_PREDICT,
        constants.JOB_REFRESH_VALIDATED_RETRAIN_REPREDICT,
        constants.JOB_FULL_REFRESH_VALIDATED_RETRAIN_REPREDICT,
    }
    assert len(jobs) == 4


def test_low_confidence_threshold_in_range():
    assert 0.0 <= constants.LOW_CONFIDENCE_THRESHOLD <= 1.0
