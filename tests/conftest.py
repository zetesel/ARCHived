import warnings

try:
    # urllib3 emits NotOpenSSLWarning when the ssl module isn't OpenSSL >=1.1.1
    # which happens on some macOS/toolchain combinations (LibreSSL). It's a
    # harmless compatibility warning for our test environment; silence it so
    # tests are noise-free.
    from urllib3.exceptions import NotOpenSSLWarning

    warnings.filterwarnings("ignore", category=NotOpenSSLWarning)
except Exception:
    # If urllib3 isn't installed or the warning class isn't available, nothing to do.
    pass
