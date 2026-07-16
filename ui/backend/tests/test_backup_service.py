"""Tests for the shared backup service (schedule state + retention)."""
import json
import os
import time

from services import backup_service


def _use_tmp_backup_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(backup_service, "BACKUP_DIR", str(tmp_path))
    monkeypatch.setattr(backup_service, "SCHEDULE_FILE", tmp_path / "schedule.json")


def test_load_schedule_defaults_when_missing(monkeypatch, tmp_path):
    _use_tmp_backup_dir(monkeypatch, tmp_path)
    assert backup_service.load_schedule() == backup_service.DEFAULT_SCHEDULE


def test_save_and_load_schedule_round_trip(monkeypatch, tmp_path):
    _use_tmp_backup_dir(monkeypatch, tmp_path)
    data = {"enabled": True, "cron": "0 3 * * *", "retention_days": 14}
    backup_service.save_schedule(data)
    loaded = backup_service.load_schedule()
    assert loaded["enabled"] is True
    assert loaded["cron"] == "0 3 * * *"
    assert loaded["retention_days"] == 14


def test_save_next_run_preserves_other_fields(monkeypatch, tmp_path):
    _use_tmp_backup_dir(monkeypatch, tmp_path)
    backup_service.save_schedule({"enabled": True, "cron": "0 2 * * *", "retention_days": 7})
    backup_service.save_next_run("2026-01-01T02:00:00")
    loaded = backup_service.load_schedule()
    assert loaded["next_run"] == "2026-01-01T02:00:00"
    assert loaded["enabled"] is True


def test_apply_retention_deletes_old_dumps(monkeypatch, tmp_path):
    _use_tmp_backup_dir(monkeypatch, tmp_path)
    old = tmp_path / "dagster_backup_old.dump"
    new = tmp_path / "dagster_backup_new.dump"
    old.write_bytes(b"old")
    new.write_bytes(b"new")
    # Backdate the "old" file by 10 days.
    ten_days_ago = time.time() - (10 * 86400)
    os.utime(old, (ten_days_ago, ten_days_ago))

    backup_service.apply_retention(retention_days=7)

    assert not old.exists()
    assert new.exists()
