#!/usr/bin/env python3
"""
GitHub scraper to find archived and unmaintained open source projects.

Queries GitHub's search API for repositories that:
1. Are marked as archived
2. Have not had commits in the last 12 months

Outputs a JSON file with project data for the static site.
"""

import os
import sys
import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import argparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging


# Configuration
GITHUB_API = "https://api.github.com"
SEARCH_QUERY = "archived:true pushed:<={date}"
PER_PAGE = 100  # Max allowed by GitHub
MIN_STARS = 10  # Minimum stars threshold (adjust as needed)
OUTPUT_FILE = "dead-projects.json"

# Logger
logger = logging.getLogger(__name__)

# Configurable knobs (can be overridden in tests via environment variables)
# Maximum seconds we will sleep when hitting a rate limit reset. Prevents
# CI/workflows from sleeping for hours if the GitHub reset header is far
# in the future.
MAX_RATE_LIMIT_SLEEP = int(os.environ.get("MAX_RATE_LIMIT_SLEEP", "60"))
# Pause between pages (with/without token). Defaults match previous behavior
# but can be shortened during tests by setting PAGE_SLEEP_WITH_TOKEN / PAGE_SLEEP_NO_TOKEN.
PAGE_SLEEP_WITH_TOKEN = float(os.environ.get("PAGE_SLEEP_WITH_TOKEN", "2"))
PAGE_SLEEP_NO_TOKEN = float(os.environ.get("PAGE_SLEEP_NO_TOKEN", "10"))

# Avoid calling basicConfig eagerly when imported by tests/runners; callers
# should configure logging as needed. If nothing configured, provide a sane
# default to avoid 'No handlers could be found' messages.
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def make_session(total_retries: int = 5, backoff_factor: float = 1.0) -> requests.Session:
    """Create a requests Session with a retry strategy mounted.

    Support both older and newer urllib3 Retry constructor parameter names
    (method_whitelist vs allowed_methods) for compatibility.
    """
    session = requests.Session()
    retry_kwargs = dict(
        total=total_retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 502, 503, 504],
    )
    try:
        retries = Retry(**retry_kwargs, allowed_methods=["GET"])
    except TypeError:
        # Older urllib3 uses method_whitelist
        retries = Retry(**retry_kwargs, method_whitelist=["GET"])  # type: ignore[arg-type]

    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def get_auth_headers() -> Dict[str, str]:
    """Build headers with GitHub token if available."""
    # Prefer an explicit PAT for split collection if provided via secret
    token = os.environ.get("SPLIT_COLLECT_PAT") or os.environ.get("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"
    return headers


def calculate_date_threshold(months: int = 12) -> str:
    """Calculate the date X months ago in YYYY-MM-DD format.

    Uses a simple approximation of 30 days per month to avoid an external dependency.
    """
    threshold = datetime.now() - timedelta(days=30 * months)
    return threshold.strftime("%Y-%m-%d")


def search_repositories(query: str, page: int = 1, max_retries: int = 3, session: Optional[requests.Session] = None) -> Optional[Dict[str, Any]]:
    """Search GitHub repositories with pagination and retries.

    Returns JSON on success or None on failure.
    """
    url = f"{GITHUB_API}/search/repositories"
    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": PER_PAGE,
        "page": page
    }
    headers = get_auth_headers()

    sess = session or make_session()

    for attempt in range(1, max_retries + 1):
        try:
            response = sess.get(url, params=params, headers=headers, timeout=30)

            # Rate-limit headers (for debugging)
            remaining = response.headers.get('X-RateLimit-Remaining')
            reset = response.headers.get('X-RateLimit-Reset')
            if remaining is not None:
                logger.debug('Rate limit remaining: %s', remaining)
            if reset is not None:
                try:
                    reset_ts = int(reset)
                    reset_time = datetime.fromtimestamp(reset_ts)
                    logger.debug('Rate limit resets at: %s', reset_time.isoformat())
                except Exception:
                    pass

            # If rate limited and reset header present, sleep until reset — but
            # cap the sleep to avoid very long sleeps in CI/workflows.
            if response.status_code == 403 and remaining == '0' and reset is not None:
                try:
                    reset_ts = int(reset)
                    sleep_s = max(0, reset_ts - int(time.time())) + 5
                    # Read cap at runtime so tests can override via environment
                    cap = int(os.environ.get("MAX_RATE_LIMIT_SLEEP", str(MAX_RATE_LIMIT_SLEEP)))
                    if sleep_s > cap:
                        logger.warning('Rate limited — computed sleep %ss exceeds cap %ss; capping', sleep_s, cap)
                        sleep_s = cap
                    else:
                        logger.warning('Rate limited — sleeping %s seconds until reset', sleep_s)
                    time.sleep(sleep_s)
                    continue
                except Exception:
                    logger.error('Rate limited but could not parse reset header')

            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            status = getattr(e.response, 'status_code', None)
            # Retry on transient server errors
            if status in (429, 502, 503, 504) and attempt < max_retries:
                wait = 2 ** attempt
                logger.warning('Transient HTTP %s — retrying in %s s (attempt %s/%s)', status, wait, attempt, max_retries)
                time.sleep(wait)
                continue

            if status == 403:
                logger.error('Access forbidden or rate limited. Set GITHUB_TOKEN environment variable for higher limits.')
            elif status == 401:
                logger.error('Invalid GITHUB_TOKEN. Check your token permissions.')
            else:
                text = (e.response.text[:200] if getattr(e, 'response', None) is not None else str(e))
                logger.error('HTTP %s: %s', status, text)
            return None
        except requests.exceptions.RequestException as e:
            # Network or other errors — retry a few times
            if attempt < max_retries:
                wait = 2 ** attempt
                logger.warning('Request failed: %s. Retrying in %s s (attempt %s/%s)', e, wait, attempt, max_retries)
                time.sleep(wait)
                continue
            logger.error('Request failed after %s attempts: %s', max_retries, e)
            return None


def parse_repository(item: Dict[str, Any]) -> Dict[str, Any]:
    """Extract relevant data from a repository object."""
    return {
        "name": item["full_name"],
        "description": item["description"],
        "url": item["html_url"],
        "stars": item["stargazers_count"],
        "language": item["language"],
        "last_commit": item["pushed_at"],
        "archived": item["archived"],
        "archived_at": item.get("updated_at"),  # GitHub doesn't provide exact archive date
        "topics": item.get("topics", []),
        # License can be None or a dict without 'key'; guard against KeyError
        "license": (item.get("license") or {}).get("key") if item.get("license") else None,
        "forks": item["forks_count"],
        "open_issues": item["open_issues_count"]
    }


def should_include_repo(repo: Dict[str, Any], min_stars: int) -> bool:
    """Check if repository meets criteria."""
    if repo["stars"] < min_stars:
        return False
    # Additional filters can be added here
    return True


def collect_projects(months: int = 12, min_stars: int = MIN_STARS) -> Tuple[List[Dict[str, Any]], bool]:
    """Main collection logic.

    Returns a tuple: (list_of_repos, truncated_flag)
    """
    date_threshold = calculate_date_threshold(months)
    query = SEARCH_QUERY.format(date=date_threshold)

    logger.info("Searching GitHub for archived projects with no commits since %s...", date_threshold)
    logger.info("Query: %s", query)

    all_repos = []
    page = 1
    total_collected = 0
    truncated = False
    max_pages = None

    while True:
        logger.info("Fetching page %s", page)
        data = search_repositories(query, page)

        if not data or "items" not in data:
            break

        # Detect GitHub Search API 1000-result cap on the first page
        if page == 1:
            total_count = data.get('total_count', 0)
            if total_count > PER_PAGE * 10:
                truncated = True
                max_pages = 10
                logger.warning("GitHub Search API limits results to 1000. total_count=%s. Results will be truncated.", total_count)
            else:
                max_pages = (total_count + PER_PAGE - 1) // PER_PAGE if total_count > 0 else None

        items = data["items"]
        if not items:
            break

        # Filter and parse repositories
        for item in items:
            repo = parse_repository(item)
            if should_include_repo(repo, min_stars):
                all_repos.append(repo)

        total_collected += len(items)

        # Check if we got fewer than PER_PAGE - we're at the end
        if len(items) < PER_PAGE:
            break

        page += 1

        # If we have a hard cap on pages (1000 results), stop when reached
        if max_pages is not None and page > max_pages:
            break

        # Rate limiting: be nice to GitHub's API. Use configured per-page sleeps
        time.sleep(PAGE_SLEEP_WITH_TOKEN if os.environ.get("GITHUB_TOKEN") else PAGE_SLEEP_NO_TOKEN)

    logger.info("Collected %s projects from %s total results", len(all_repos), total_collected)
    if truncated:
        logger.warning("Results were truncated due to API limits.")
    return all_repos, truncated


def save_json(data: List[Dict[str, Any]], path: str, months: int, min_stars: int, truncated: bool = False):
    """Save data to JSON file with metadata."""
    output = {
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "total_projects": len(data),
            "source": "GitHub API",
            "query": SEARCH_QUERY.format(date=calculate_date_threshold(months)),
            "criteria": {
                "min_stars": min_stars,
                "max_months_inactive": months,
            },
            "truncated": bool(truncated)
        },
        "projects": sorted(data, key=lambda x: x["stars"], reverse=True)
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    logger.info("Saved to %s (%s projects)", path, len(data))


def main():
    """Main entry point."""
    logger.info("%s", "=" * 60)
    logger.info("ARCHived - GitHub Dead Projects Scraper")
    logger.info("%s", "=" * 60)

    parser = argparse.ArgumentParser(description='Collect archived/unmaintained GitHub projects')
    parser.add_argument('--months', type=int, default=12, help='Months of inactivity to consider (default: 12)')
    parser.add_argument('--min-stars', type=int, default=MIN_STARS, help=f'Minimum stars (default: {MIN_STARS})')
    parser.add_argument('--output', type=str, default=OUTPUT_FILE, help=f'Output JSON file (default: {OUTPUT_FILE})')

    args = parser.parse_args()

    try:
        projects, truncated = collect_projects(months=args.months, min_stars=args.min_stars)
        save_json(projects, args.output, months=args.months, min_stars=args.min_stars, truncated=truncated)
        print("\n✓ Complete!")
        return 0
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        return 130
    except Exception as e:
        logger.exception("Fatal error: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
