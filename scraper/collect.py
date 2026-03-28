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

import requests


# Configuration
GITHUB_API = "https://api.github.com"
SEARCH_QUERY = "archived:true pushed:<=>{date}"
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


def search_repositories(query: str, page: int = 1) -> Optional[Dict[str, Any]]:
    """Search GitHub repositories with pagination."""
    url = f"{GITHUB_API}/search/repositories"
    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": PER_PAGE,
        "page": page
    }
    headers = get_auth_headers()

    try:
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if response.status_code == 403:
            print("ERROR: Rate limit exceeded. Set GITHUB_TOKEN environment variable.")
            print("       Without auth, only 10 requests/minute are allowed.")
        elif response.status_code == 401:
            print("ERROR: Invalid GITHUB_TOKEN. Check your token permissions.")
        else:
            print(f"ERROR: HTTP {response.status_code}: {response.text[:200]}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Request failed: {e}")
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
    """Main collection logic."""
    date_threshold = calculate_date_threshold(months)
    query = SEARCH_QUERY.format(date=date_threshold)

    print(f"Searching GitHub for archived projects with no commits since {date_threshold}...")
    print(f"Query: {query}")

    all_repos = []
    page = 1
    total_collected = 0

    while True:
        print(f"  Fetching page {page}...")
        data = search_repositories(query, page)

        if not data or "items" not in data:
            break

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

        # Rate limiting: be nice to GitHub's API
        time.sleep(2 if os.environ.get("GITHUB_TOKEN") else 10)

    print(f"\nCollected {len(all_repos)} projects from {total_collected} total results")
    return all_repos


def save_json(data: List[Dict[str, Any]], path: str):
    """Save data to JSON file with metadata."""
    output = {
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "total_projects": len(data),
            "source": "GitHub API",
            "query": SEARCH_QUERY.format(date=calculate_date_threshold()),
            "criteria": {
                "min_stars": MIN_STARS,
                "max_months_inactive": 12
            }
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

    try:
        projects = collect_projects()
        save_json(projects, OUTPUT_FILE)
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
