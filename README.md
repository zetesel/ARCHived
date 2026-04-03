# ARCHived

A static site that lists archived and unmaintained GitHub repositories. Projects are filtered by archived status and inactivity (no commits for 12+ months).

## Overview

- Built with plain HTML, CSS, and JavaScript
- Data collected via GitHub Search API
- Deployed via GitHub Actions to GitHub Pages
- Updated weekly on Sunday at 00:00 UTC

## Prerequisites

- Python 3.11+
- Git
- GitHub repository (public for Pages)

## Local Development

1. Install dependencies:

```bash
pip install -r scraper/requirements.txt
```

2. Build the site:

```bash
python build.py
```

This runs the scraper and copies assets to `docs/`.

3. Preview locally:

```bash
python -m http.server 8000 --directory docs
```

Open http://localhost:8000 in your browser.

## Deployment

1. Create a public repository on GitHub and push this code.

2. Enable GitHub Pages:
   - Go to Settings → Pages
   - Set Source to "GitHub Actions" or "Deploy from a branch" → `main` → `/docs`

3. The workflow will deploy automatically on push to main and on the weekly schedule.

## Configuration

The scraper is configurable via CLI flags or environment variables in CI.

Locally you can run:

```bash
python scraper/collect.py --months 12 --min-stars 10 --output dead-projects.json
```

In CI the workflow sets `ARCHIVED_MONTHS` and `ARCHIVED_MIN_STARS` which are passed to the scraper. Set `GITHUB_TOKEN` in Actions secrets if you need higher rate limits. The default `GITHUB_TOKEN` works but has lower limits.

Note about GitHub Search API limits: the Search API only returns up to 1000 results for any query. If a query matches more than 1000 repositories the scraper will stop at that cap and the generated metadata will include "truncated": true. To cover more results you can run multiple, narrower queries (for example split by language or star ranges) and merge outputs.

Split collection helper
-----------------------

To automatically collect more than 1000 results, use the provided split collector which runs multiple searches split by star ranges and merges results:

```bash
python scraper/split_collect.py --months 12 --min-stars 10 --output dead-projects.json
```

This will run a set of pragmatic star-range buckets, deduplicate by repo full name, and write a merged JSON with bucket metadata.

## File Structure

```
.
├── index.html          # Main page
├── styles.css          # Styles
├── app.js              # Client-side filtering/sorting
├── build.py            # Build script
├── dead-projects.json  # Generated data (ignored by git, but copied to docs/)
├── docs/               # Built site (GitHub Pages source)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── dead-projects.json
├── scraper/
│   ├── collect.py
│   └── requirements.txt
└── .github/
    └── workflows/
        └── scan.yml   # Weekly build and deploy
```

## How It Works

The `build.py` script:
1. Runs `scraper/collect.py` to fetch archived repositories with no recent activity
2. Writes `dead-projects.json` with metadata and project list
3. Copies `index.html`, `styles.css`, `app.js`, and `dead-projects.json` to `docs/`

GitHub Actions runs `build.py` and deploys the `docs/` folder to Pages.

The site displays projects as cards with filtering by language, minimum stars, and sorting options (stars, date, name).

## Data Format

`dead-projects.json` structure:

```json
{
  "metadata": {
    "generated_at": "ISO 8601 timestamp",
    "total_projects": 1000,
    "source": "GitHub API",
    "query": "search query used"
  },
  "projects": [
    {
      "name": "owner/repo",
      "description": "...",
      "url": "https://github.com/...",
      "stars": 1234,
      "language": "Python",
      "last_commit": "2024-01-01T00:00:00Z",
      "archived": true,
      "topics": [],
      "license": "mit"
    }
  ]
}
```

## License

MIT
 
