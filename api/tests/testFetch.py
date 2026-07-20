import pytest

from app import fetchHistory


def test_missing_key_leaves_cache_untouched(tmp_path, monkeypatch):
    monkeypatch.delenv("DATAGOV_KEY", raising=False)
    monkeypatch.setattr(fetchHistory, "rawDir", tmp_path)
    cache = tmp_path / "history_maize.json"
    cache.write_text('[{"saved": true}]')
    with pytest.raises(RuntimeError, match="Set DATAGOV_KEY"):
        fetchHistory.fetchCommodity("Maize")
    assert cache.read_text() == '[{"saved": true}]'


def test_failed_download_does_not_report_success(monkeypatch):
    def fail(*args, **kwargs):
        raise OSError("offline")
    monkeypatch.setattr(fetchHistory.urllib.request, "urlopen", fail)
    monkeypatch.setattr(fetchHistory.time, "sleep", lambda delay: None)
    with pytest.raises(RuntimeError, match="request failed"):
        fetchHistory.getPage({})
