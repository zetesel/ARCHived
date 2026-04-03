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
from typing import List, Dict, Any, Optional
import argparse

import requests


# Configuration
GITHUB_API = "https://api.github.com"
SEARCH_QUERY = "archived:true pushed:<={date}"
PER_PAGE = 100  # Max allowed by GitHub
MIN_STARS = 10  # Minimum stars threshold (adjust as needed)
OUTPUT_FILE = "dead-projects.json"


def get_auth_headers() -> Dict[str, str]:
    """Build headers with GitHub token if available."""
    token = os.environ.get("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"
    return headers


def calculate_date_threshold(months: int = 12) -> str:
    """Calculate the date X months ago in YYYY-MM-DD format."""
    threshold = datetime.now() - timedelta(days=30 * months)
    return threshold.strftime("%Y-%m-%d")


def search_repositories(query: str, page: int = 1, max_retries: int = 3) -> Optional[Dict[str, Any]]:
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

    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(url, params=params, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            resp = getattr(e, 'response', None)
            status = resp.status_code if resp is not None else None

            # Surface rate limit information when available
            if resp is not None and resp.headers:
                remaining = resp.headers.get('X-RateLimit-Remaining')
                reset = resp.headers.get('X-RateLimit-Reset')
                if remaining is not None:
                    print(f"Rate limit remaining: {remaining}")
                if reset is not None:
                    try:
                        reset_ts = int(reset)
                        reset_time = datetime.fromtimestamp(reset_ts)
                        print(f"Rate limit resets at: {reset_time.isoformat()}")
                    except Exception:
                        pass

            # Retry on transient server errors
            if status in (429, 502, 503, 504) and attempt < max_retries:
                wait = 2 ** attempt
                print(f"Transient HTTP {status} — retrying in {wait}s (attempt {attempt}/{max_retries})...")
                time.sleep(wait)
                continue

            if status == 403:
                print("ERROR: Access forbidden or rate limited. Set GITHUB_TOKEN environment variable for higher limits.")
            elif status == 401:
                print("ERROR: Invalid GITHUB_TOKEN. Check your token permissions.")
            else:
                text = resp.text[:200] if resp is not None else str(e)
                print(f"ERROR: HTTP {status}: {text}")
            return None
        except requests.exceptions.RequestException as e:
            # Network or other errors — retry a few times
            if attempt < max_retries:
                wait = 2 ** attempt
                print(f"Request failed: {e}. Retrying in {wait}s (attempt {attempt}/{max_retries})...")
                time.sleep(wait)
                continue
            print(f"ERROR: Request failed after {max_retries} attempts: {e}")
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
        "license": item["license"]["key"] if item["license"] else None,
        "forks": item["forks_count"],
        "open_issues": item["open_issues_count"]
    }


def should_include_repo(repo: Dict[str, Any], min_stars: int) -> bool:
    """Check if repository meets criteria."""
    if repo["stars"] < min_stars:
        return False
    # Additional filters can be added here
    return True


def collect_projects(months: int = 12, min_stars: int = MIN_STARS) -> List[Dict[str, Any]]:
    """Main collection logic.

    Returns a tuple: (list_of_repos, truncated_flag)
    """
    date_threshold = calculate_date_threshold(months)
    query = SEARCH_QUERY.format(date=date_threshold)

    print(f"Searching GitHub for archived projects with no commits since {date_threshold}...")
    print(f"Query: {query}")

    all_repos = []
    page = 1
    total_collected = 0
    truncated = False
    max_pages = None

    while True:
        print(f"  Fetching page {page}...")
        data = search_repositories(query, page)

        if not data or "items" not in data:
            break

        # Detect GitHub Search API 1000-result cap on the first page
        if page == 1:
            total_count = data.get('total_count', 0)
            if total_count > PER_PAGE * 10:
                truncated = True
                max_pages = 10
                print(f"WARNING: GitHub Search API limits results to 1000. total_count={total_count}. Results will be truncated.")
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

        # Rate limiting: be nice to GitHub's API
        time.sleep(2 if os.environ.get("GITHUB_TOKEN") else 10)

    print(f"\nCollected {len(all_repos)} projects from {total_collected} total results")
    if truncated:
        print("NOTE: Results were truncated due to API limits.")
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

    print(f"Saved to {path} ({len(data)} projects)")


def main():
    """Main entry point."""
    print("=" * 60)
    print("ARCHived - GitHub Dead Projects Scraper")
    print("=" * 60)

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
        print("\n\nInterrupted by user")
        return 130
    except Exception as e:
        print(f"\nFatal error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
