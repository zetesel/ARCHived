#!/usr/bin/env python3
"""
Build script for ARCHived static site.

1. Runs the scraper to collect fresh data
2. Copies static assets to docs/ folder (for GitHub Pages)
3. Verifies all files are in place
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path


# Configuration
DOCS_DIR = Path("docs")
STATIC_FILES = ["index.html", "styles.css", "app.js", "dead-projects.json"]


def run_scraper():
    """Execute the scraper script to generate fresh data."""
    print("Running scraper...")
    result = subprocess.run(
        [sys.executable, "scraper/collect.py"],
        capture_output=True,
        text=True
    )

    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

    if result.returncode != 0:
        print("ERROR: Scraper failed!")
        return False

    return True


def ensure_docs_dir():
    """Create docs directory if it doesn't exist."""
    DOCS_DIR.mkdir(exist_ok=True)
    print(f"Ensured {DOCS_DIR}/ directory exists")


def copy_static_files():
    """Copy all static files to docs directory."""
    print("Copying static files to docs/...")
    for file in STATIC_FILES:
        src = Path(file)
        dst = DOCS_DIR / file
        if src.exists():
            shutil.copy2(src, dst)
            print(f"  ✓ {file}")
        else:
            print(f"  ✗ {file} not found!")
            return False
    return True


def main():
    """Main build pipeline."""
    print("=" * 60)
    print("ARCHived - Site Builder")
    print("=" * 60)

    # Step 1: Run scraper
    if not run_scraper():
        return 1

    # Check that dead-projects.json was created
    if not Path("dead-projects.json").exists():
        print("ERROR: dead-projects.json not generated!")
        return 1

    # Step 2: Prepare docs directory
    ensure_docs_dir()

    # Step 3: Copy static files
    if not copy_static_files():
        return 1

    print("\n" + "=" * 60)
    print("✓ Build complete!")
    print("=" * 60)
    print(f"\nThe site is ready in the '{DOCS_DIR}/' folder.")
    print("To preview locally:")
    print("  python -m http.server 8000 --directory docs")
    print("\nPush to GitHub to deploy:")
    print("  git add docs/")
    print("  git commit -m 'Update dead projects'")
    print("  git push")

    return 0


if __name__ == "__main__":
    sys.exit(main())
