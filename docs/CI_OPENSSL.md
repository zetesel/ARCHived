# CI: Avoid urllib3 NotOpenSSLWarning by using OpenSSL-backed Python

## Background

urllib3 v2 emits `NotOpenSSLWarning` when the Python `ssl` module is built against
LibreSSL (common on some macOS toolchains). The warning is informational but
appears during test runs and CI, which can be noisy.

## Recommended approaches

### 1) Prefer an OpenSSL-backed Python in CI (recommended)

Use Ubuntu runners in CI (`ubuntu-latest`) or official Python binaries via
`actions/setup-python`. These providers typically ship CPython built against
OpenSSL >= 1.1.1.

Example GitHub Actions snippet (matches this repo's CI setup):

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install deps
        run: |
          python -m pip install --upgrade pip
          pip install -r scraper/requirements.txt
      - name: Run tests
        run: |
          python -m pytest -q
```

### 2) If you must run on macOS runners

Install Homebrew's OpenSSL and then install CPython using pyenv configured
to use that OpenSSL. Example steps for a macOS runner:

```bash
# Install OpenSSL
brew install openssl@3

# Install pyenv if not present and then install Python with OpenSSL paths
export LDFLAGS="-L$(brew --prefix openssl@3)/lib"
export CPPFLAGS="-I$(brew --prefix openssl@3)/include"
export PKG_CONFIG_PATH="$(brew --prefix openssl@3)/lib/pkgconfig"

# Example pyenv install (match the version used in CI)
pyenv install 3.12
pyenv global 3.12

python -m pip install --upgrade pip
pip install -r scraper/requirements.txt
python -m pytest -q
```

## Notes

Suppressing the warning in tests (via `filterwarnings`) is possible, but it is
preferable to ensure the runtime environment uses a CPython build linked
against OpenSSL when feasible, so tooling and cryptography behaviour match
production environments.

## Next steps

This repository's CI (`.github/workflows/test.yml`) already uses `ubuntu-latest`
and `actions/setup-python@v5` with Python 3.12, which provides an OpenSSL-backed
Python by default.
