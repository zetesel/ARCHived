# ARCHived

Discover open source projects that are **archived** and **unmaintained** — and give them a second life!

[![Deploy to GitHub Pages](https://github.com/${{ github.repository }}/actions/workflows/scan.yml/badge.svg)](https://github.com/${{ github.repository }}/actions/workflows/scan.yml)

## What is this?

A "killedbygoogle" style site that showcases dead/archived GitHub OSS projects. The goal is to help developers find projects they can fork, revive, and continue maintaining.

## How it works

1. **GitHub scraper** (`scraper/collect.py`) queries GitHub's API for repositories that:
   - Are marked as `archived`
   - Have no commits in the last 12+ months
   - Have at least 10 stars (configurable)

2. **Static site** displays these projects in a searchable, filterable grid.

3. **GitHub Actions** (`scan.yml`) runs weekly to:
   - Collect fresh data
   - Generate the static site
   - Deploy to GitHub Pages

## Quick Start

### Local development

```bash
# Install dependencies
pip install -r scraper/requirements.txt

# Build the site (runs scraper + generates static files)
python build.py

# Preview locally
python -m http.server 8000 --directory docs
# Open http://localhost:8000
```

### Deployment

1. **Enable GitHub Pages** in your repo settings:
   - Source: GitHub Actions
   - Or manually: Set source to `docs/` folder on `main` branch

2. **Optional**: Add your own `GITHUB_TOKEN` as a secret for higher rate limits (GitHub Actions already has `GITHUB_TOKEN` built-in)

3. Push to main — the GitHub Actions workflow will auto-deploy.

## Project Structure

```
.
├── index.html         # Main page
├── styles.css         # Styling
├── app.js             # Filtering & sorting logic
├── dead-projects.json # Generated data file
├── build.py           # Build script
├── scraper/
│   ├── collect.py     # GitHub API scraper
│   └── requirements.txt
├── docs/              # Generated static site (GitHub Pages target)
└── .github/workflows/
    └── scan.yml       # Weekly automation workflow
```

## Configuration

Adjust these in `scraper/collect.py`:

- `MIN_STARS`: Minimum star threshold (default: 10)
- `months`: Inactivity period (default: 12 months)
- Rate limiting: Works automatically, but set `GITHUB_TOKEN` for higher limits

## Features

- Filter by programming language
- Filter by minimum stars
- Sort by: stars, date, name
- Responsive design (works on mobile)
- Shows: star count, last commit date, description

## Want to Contribute?

Found a dead project that should be listed? Open an issue or submit a PR to add it to `dead-projects.json` directly.

Alternatively, this site is generated automatically from GitHub's archived repositories, so it will naturally discover new dead projects over time.

## License

MIT
 
