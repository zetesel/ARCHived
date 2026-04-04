import logging


def configure_logging(level: int = logging.INFO, fmt: str = "%(asctime)s %(levelname)s %(message)s") -> None:
    """Configure root logging if not already configured.

    This avoids calling logging.basicConfig multiple times when modules are
    imported; only the first invocation will configure the root logger.
    """
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=level, format=fmt)
