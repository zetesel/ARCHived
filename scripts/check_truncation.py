#!/usr/bin/env python3
"""Check dead-projects.json metadata and optionally fail on truncation.

This script is intentionally small and safe for CI use.
"""
import json
import os
import sys
import logging

logger = logging.getLogger(__name__)
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def main() -> int:
    f = "dead-projects.json"
    if not os.path.exists(f):
        logger.info("dead-projects.json not found, skipping truncation check")
        return 0

    with open(f, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    truncated = data.get("metadata", {}).get("truncated", False)
    logger.info("truncated=%s", truncated)

    if truncated:
        if os.environ.get("FAIL_ON_TRUNCATED", "false").lower() in ("1", "true", "yes"):
            logger.error("ERROR: Results truncated by GitHub Search API")
            return 1
        else:
            logger.warning("Results truncated by GitHub Search API — see dead-projects.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
