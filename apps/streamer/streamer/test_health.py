from collections import Counter

from streamer.health import Health


def test_down_until_connected_then_live_then_stale_as_messages_stop() -> None:
    h = Health(counts=Counter(), stale_after=60)
    assert h.status(now=100) == "down"
    h.connected = True
    assert h.status(now=100) == "stale"
    h.heard(now=100)
    assert h.status(now=159) == "live"
    assert h.status(now=161) == "stale"
    h.connected = False
    assert h.status(now=161) == "down"


def test_summary_reports_latency_counts_and_message_age() -> None:
    h = Health(counts=Counter(), stale_after=60)
    h.connected = True
    h.heard(now=100)
    h.latencies.extend([1.0, 2.0, 9.0])
    h.counts["duplicate"] += 2
    summary = h.summary(now=110)
    assert summary["status"] == "live"
    assert summary["last_message_age_s"] == 10
    assert summary["latency_median_s"] == 2.0
    assert summary["counts"]["duplicate"] == 2


def test_summary_with_nothing_heard_yet() -> None:
    summary = Health(counts=Counter()).summary(now=100)
    assert summary["last_message_age_s"] is None
    assert summary["latency_median_s"] is None
