Title: Improve scraper reliability, logging and build testability

Summary:
- Run scraper in-process from build.py for better testability, with a
  subprocess fallback.
- Improve rate-limit handling (use Retry-After, cap sleeps, fail-fast in CI).
- Make logging consistent (replace prints with logger.info) and add a
  small pre-commit/pyproject setup for black/ruff.
- Add CONTRIBUTING.md and basic CI-friendly adjustments.

Why:
- Makes local development and CI runs faster and more robust. Avoids long
  sleeps in CI due to GitHub rate limits and reduces subprocess overhead.

Testing:
- Ran unit tests locally: `python -m pytest` — all tests passed (4 passed, 1 warning).
