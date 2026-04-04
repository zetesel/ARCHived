import os
import time
import responses
from scraper import collect


@responses.activate
def test_rate_limit_sleep_is_capped(monkeypatch):
    """When GitHub returns a rate-limited response with a far-future reset,
    the collector should cap the sleep to MAX_RATE_LIMIT_SLEEP (configurable).
    """
    base_url = collect.GITHUB_API + '/search/repositories'

    # Make a reset header far in the future (e.g., now + 10_000 seconds)
    future_reset = int(time.time()) + 10000

    # First response: 403 with rate-limit headers
    responses.add(
        responses.GET,
        base_url,
        json={"message": "rate limited"},
        status=403,
        headers={
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': str(future_reset),
        },
    )

    # Second response: a normal empty page so the collector can finish
    responses.add(
        responses.GET,
        base_url,
        json={"total_count": 0, "items": []},
        status=200,
    )

    # Cap the sleep to a small number for the test
    monkeypatch.setenv('MAX_RATE_LIMIT_SLEEP', '1')

    start = time.time()
    projects, truncated = collect.collect_projects(months=1, min_stars=0)
    elapsed = time.time() - start

    # Ensure the elapsed time is small (i.e., capped) and not the full future reset
    assert elapsed < 5
    assert isinstance(projects, list)
    assert truncated in (True, False)
