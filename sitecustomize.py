"""Project-local sitecustomize to filter known harmless warnings.

This is imported very early by Python when the repository root is on PYTHONPATH
and prevents urllib3's NotOpenSSLWarning from being emitted during test runs
on toolchains where the system ssl is LibreSSL.
"""
import warnings

try:
    # urllib3 v2 emits NotOpenSSLWarning when the ssl module isn't OpenSSL >=1.1.1
    # (e.g. system LibreSSL builds). The warning is informational and doesn't
    # affect our tests; filter it here so test output remains clean.
    from urllib3.exceptions import NotOpenSSLWarning

    warnings.filterwarnings("ignore", category=NotOpenSSLWarning)
except Exception:
    # Nothing to do if urllib3 isn't present or the exception class isn't
    # available.
    pass
