CI: Avoid urllib3 NotOpenSSLWarning by using OpenSSL-backed Python

Background
- urllib3 v2 emits NotOpenSSLWarning when the Python ssl module is built against
  LibreSSL (common on some macOS toolchains). The warning is informational but
  appears during test runs and CI, which can be noisy.

Recommended approaches

1) Prefer an OpenSSL-backed Python in CI (recommended)

- Use Ubuntu runners in CI (ubuntu-latest) or official Python binaries via
  actions/setup-python. These providers typically ship CPython built against
  OpenSSL >= 1.1.1.

Example GitHub Actions snippet (recommended):

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v4
        with:
          python-version: '3.9'
      - name: Install deps
        run: |
          python -m pip install --upgrade pip
          pip install -r scraper/requirements.txt
      - name: Run tests
        run: |
          pytest -q
```

2) If you must run on macOS runners, install an OpenSSL and use a CPython
   binary that links against it

- Install Homebrew's OpenSSL and then install CPython using pyenv configured
  to use that OpenSSL. Example steps for a macOS runner:

```bash
# Install OpenSSL
brew install openssl@1.1

# Install pyenv if not present and then install Python with OpenSSL paths
export LDFLAGS="-L$(brew --prefix openssl@1.1)/lib"
export CPPFLAGS="-I$(brew --prefix openssl@1.1)/include"
export PKG_CONFIG_PATH="$(brew --prefix openssl@1.1)/lib/pkgconfig"

# Example pyenv install
pyenv install 3.9.18
pyenv global 3.9.18

python -m pip install --upgrade pip
pip install -r scraper/requirements.txt
pytest -q
```

Notes
- Suppressing the warning in tests (via filterwarnings) is possible, but it's
  preferable to ensure the runtime environment uses a CPython build linked
  against OpenSSL when feasible, so tooling and cryptography behaviour match
  production environments.

If you want, I can:
1. Add a CI workflow file using the ubuntu-latest example above and enable it
   on this repository; or
2. Keep CI configuration out of the repo and just provide this guidance.
