"""Tests for the SimpleFIN extractor's retrying HTTP session."""
from extractors.simplefin_api import _build_retrying_session


def test_session_mounts_https_adapter_with_retries():
    session = _build_retrying_session()
    adapter = session.get_adapter("https://bridge.simplefin.org/")
    retry = adapter.max_retries
    assert retry.total == 5
    # Backoff must be enabled so retries don't hammer the API.
    assert retry.backoff_factor and retry.backoff_factor > 0
    session.close()


def test_session_retries_rate_limit_and_server_errors():
    session = _build_retrying_session()
    retry = session.get_adapter("https://bridge.simplefin.org/").max_retries
    forcelist = set(retry.status_forcelist)
    for code in (429, 500, 502, 503, 504):
        assert code in forcelist
    session.close()


def test_session_does_not_retry_auth_or_payment_errors():
    """402/403 must surface immediately rather than being retried."""
    session = _build_retrying_session()
    retry = session.get_adapter("https://bridge.simplefin.org/").max_retries
    forcelist = set(retry.status_forcelist)
    assert 402 not in forcelist
    assert 403 not in forcelist
    session.close()
