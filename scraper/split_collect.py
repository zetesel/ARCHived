#!/usr/bin/env python3
"""
split_collect.py

Driver to collect archived repositories while working around GitHub Search API's
1000-result cap by splitting the query into star-range buckets and merging results.

This is a pragmatic approach: it issues multiple narrower searches (by stars)
and deduplicates results by full_name.
"""

import argparse
import json
import os
import time
from datetime import datetime
from typing import List, Dict, Any, Tuple

from scraper.collect import (
    GITHUB_API,
    PER_PAGE,
    get_auth_headers,
    calculate_date_threshold,
    parse_repository,
    search_repositories,
)


def make_star_buckets(min_stars: int) -> List[Tuple[int, int]]:
    """Return a list of (low, high) star buckets. high == -1 means open-ended."""
    # Defined buckets (pragmatic). Ensure min_stars is honored as lower bound.
    buckets = [
        (min_stars, 9),
        (10, 99),
        (100, 499),
        (500, 999),
        (1000, 4999),
        (5000, -1),
    ]

    # Trim buckets where high < min_stars
    filtered = []
    for low, high in buckets:
        if high != -1 and high < min_stars:
            continue
        if low < min_stars:
            low = min_stars
        filtered.append((low, high))
    return filtered


def run_bucket(low: int, high: int, months: int, min_stars: int) -> Tuple[List[Dict[str, Any]], bool, int]:
    """Run a search for a star bucket and return (projects, truncated_flag, total_count).

    truncated_flag is True when GitHub reports total_count > 1000 for that bucket.
    """
    date_threshold = calculate_date_threshold(months)
    if high == -1:
        stars_q = f"stars:>={low}"
        bucket_label = f">={low}"
    else:
        stars_q = f"stars:{low}..{high}"
        bucket_label = f"{low}..{high}"

    query = f"archived:true pushed:<={date_threshold} {stars_q}"
    print(f"Collecting bucket: {bucket_label} -> query: {query}")

    page = 1
    collected = []
    truncated = False
    total_count = 0

    while True:
        data = search_repositories(query, page)
        if not data or 'items' not in data:
            break

        if page == 1:
            total_count = int(data.get('total_count', 0))
            if total_count > PER_PAGE * 10:
                truncated = True
                print(f"  WARNING: bucket {bucket_label} total_count={total_count} (truncated by API)")

        items = data['items']
        if not items:
            break

        for item in items:
            repo = parse_repository(item)
            # Respect min_stars filter as additional safety
            if repo.get('stars', 0) >= min_stars:
                collected.append(repo)

        if len(items) < PER_PAGE:
            break

        page += 1
        # be polite
        time.sleep(2 if os.environ.get('GITHUB_TOKEN') else 10)

    return collected, truncated, total_count


def merge_results(list_of_lists: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    seen = {}
    for sub in list_of_lists:
        for repo in sub:
            seen[repo['name']] = repo
    # Return list sorted by stars desc
    merged = sorted(seen.values(), key=lambda x: x.get('stars', 0), reverse=True)
    return merged


def main():
    parser = argparse.ArgumentParser(description='Collect archived projects using split queries to avoid 1000-result cap')
    parser.add_argument('--months', type=int, default=12)
    parser.add_argument('--min-stars', type=int, default=10)
    parser.add_argument('--output', type=str, default='dead-projects.json')
    args = parser.parse_args()

    buckets = make_star_buckets(args.min_stars)
    all_lists = []
    bucket_meta = []

    for low, high in buckets:
        projects, truncated, total_count = run_bucket(low, high, args.months, args.min_stars)
        all_lists.append(projects)
        bucket_meta.append({
            'low': low,
            'high': high,
            'collected': len(projects),
            'total_count': total_count,
            'truncated': bool(truncated),
        })

    merged = merge_results(all_lists)

    output = {
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'total_projects': len(merged),
            'source': 'GitHub Search API (split by stars)',
            'criteria': {
                'min_stars': args.min_stars,
                'max_months_inactive': args.months,
            },
            'buckets': bucket_meta,
        },
        'projects': merged,
    }

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Saved merged results to {args.output} ({len(merged)} projects)")


if __name__ == '__main__':
    main()
