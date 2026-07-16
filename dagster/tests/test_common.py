"""Tests for the shared Dagster helpers in common.py."""
import common


def test_feature_names_derived_from_numerical_features():
    """FEATURE_NAMES must be exactly text_tfidf + the numerical feature list.

    This guards against the historical drift where the saved model metadata
    advertised features (month, amount_abs) that were not actually trained on.
    """
    assert common.FEATURE_NAMES == ["text_tfidf"] + common.NUMERICAL_FEATURES


def test_numerical_features_are_unique():
    assert len(common.NUMERICAL_FEATURES) == len(set(common.NUMERICAL_FEATURES))


def test_text_feature_not_in_numerical_features():
    assert common.TEXT_FEATURE not in common.NUMERICAL_FEATURES


def test_get_database_url_uses_env(monkeypatch):
    monkeypatch.setenv("POSTGRES_USER", "u")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p")
    monkeypatch.setenv("POSTGRES_HOST", "h")
    monkeypatch.setenv("POSTGRES_PORT", "1234")
    monkeypatch.setenv("POSTGRES_DB", "d")
    assert common.get_database_url() == "postgresql+psycopg2://u:p@h:1234/d"


def test_get_database_url_defaults(monkeypatch):
    for var in ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB"):
        monkeypatch.delenv(var, raising=False)
    assert common.get_database_url() == "postgresql+psycopg2://dagster:dagster@postgres:5432/dagster"


def test_load_config_defaults_when_missing(tmp_path):
    missing = tmp_path / "does_not_exist.yaml"
    cfg = common.load_config(config_paths=[missing])
    assert cfg["model"]["confidence_threshold"] == common.DEFAULT_CONFIDENCE_THRESHOLD


def test_load_config_reads_file(tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("model:\n  confidence_threshold: 0.25\n")
    cfg = common.load_config(config_paths=[config_file])
    assert cfg["model"]["confidence_threshold"] == 0.25


def test_load_config_fills_missing_model_section(tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("other: 1\n")
    cfg = common.load_config(config_paths=[config_file])
    assert cfg["model"]["confidence_threshold"] == common.DEFAULT_CONFIDENCE_THRESHOLD
