from streamer.limits import Limiter, client_of


def test_a_client_gets_its_burst_then_waits_for_the_refill() -> None:
    limiter = Limiter(burst=3, per_s=1)
    assert [limiter.take("a", 1, now=0) for _ in range(3)] == [0, 0, 0]
    assert limiter.take("a", 1, now=0) == 1
    assert limiter.take("a", 1, now=1) == 0


def test_a_costly_request_takes_more_of_the_burst() -> None:
    limiter = Limiter(burst=4, per_s=2)
    assert limiter.take("a", 4, now=0) == 0
    assert limiter.take("a", 4, now=0) == 2


def test_one_client_running_out_leaves_the_others_alone() -> None:
    limiter = Limiter(burst=1, per_s=1)
    limiter.take("a", 1, now=0)
    assert limiter.take("a", 1, now=0) > 0
    assert limiter.take("b", 1, now=0) == 0


def test_idle_clients_are_forgotten_once_there_are_too_many() -> None:
    limiter = Limiter(burst=2, per_s=1, max_tracked=2)
    limiter.take("a", 1, now=0)
    limiter.take("b", 1, now=5)
    limiter.take("c", 1, now=5)
    assert set(limiter.buckets) == {"b", "c"}


def test_the_proxy_header_counts_only_when_the_proxy_is_trusted() -> None:
    assert client_of("172.18.0.3", "203.0.113.9", trust_proxy=True) == "203.0.113.9"
    assert client_of("172.18.0.3", "203.0.113.9", trust_proxy=False) == "172.18.0.3"
    assert client_of("172.18.0.3", None, trust_proxy=True) == "172.18.0.3"


def test_only_the_address_the_proxy_added_counts() -> None:
    # A client can send its own X-Forwarded-For; the proxy's entry is the last one.
    assert client_of("172.18.0.3", "1.2.3.4, 203.0.113.9", trust_proxy=True) == "203.0.113.9"
