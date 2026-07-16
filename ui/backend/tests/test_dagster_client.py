"""Tests for the shared Dagster GraphQL client response handling."""
import httpx
import pytest

from services import dagster_client
from services.dagster_client import (
    DagsterClientError,
    DagsterConfigInvalidError,
    DagsterConnectionError,
    DagsterJobNotFoundError,
    launch_job,
)


class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = str(self._payload)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)


class _FakeClient:
    def __init__(self, response=None, raise_exc=None):
        self._response = response
        self._raise_exc = raise_exc

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, *args, **kwargs):
        if self._raise_exc is not None:
            raise self._raise_exc
        return self._response


def _patch_client(monkeypatch, response=None, raise_exc=None):
    monkeypatch.setattr(
        dagster_client.httpx,
        "Client",
        lambda *a, **k: _FakeClient(response=response, raise_exc=raise_exc),
    )


def test_launch_success_returns_run_id(monkeypatch):
    payload = {"data": {"launchRun": {"__typename": "LaunchRunSuccess", "run": {"runId": "abc123"}}}}
    _patch_client(monkeypatch, _FakeResponse(payload=payload))
    assert launch_job("2_ingest_and_predict") == "abc123"


def test_job_not_found_raises_404(monkeypatch):
    payload = {"data": {"launchRun": {"__typename": "PipelineNotFoundError", "message": "nope"}}}
    _patch_client(monkeypatch, _FakeResponse(payload=payload))
    with pytest.raises(DagsterJobNotFoundError) as exc:
        launch_job("missing_job")
    assert exc.value.status_code == 404


def test_config_invalid_raises_400(monkeypatch):
    payload = {
        "data": {"launchRun": {"__typename": "RunConfigValidationInvalid", "errors": [{"message": "bad"}]}}
    }
    _patch_client(monkeypatch, _FakeResponse(payload=payload))
    with pytest.raises(DagsterConfigInvalidError) as exc:
        launch_job("job")
    assert exc.value.status_code == 400


def test_python_error_raises_500(monkeypatch):
    payload = {"data": {"launchRun": {"__typename": "PythonError", "message": "boom"}}}
    _patch_client(monkeypatch, _FakeResponse(payload=payload))
    with pytest.raises(DagsterClientError) as exc:
        launch_job("job")
    assert exc.value.status_code == 500


def test_top_level_graphql_errors_raise(monkeypatch):
    payload = {"errors": [{"message": "schema error"}]}
    _patch_client(monkeypatch, _FakeResponse(payload=payload))
    with pytest.raises(DagsterClientError):
        launch_job("job")


def test_connection_error_raises_503(monkeypatch):
    _patch_client(monkeypatch, raise_exc=httpx.RequestError("cannot connect"))
    with pytest.raises(DagsterConnectionError) as exc:
        launch_job("job")
    assert exc.value.status_code == 503
