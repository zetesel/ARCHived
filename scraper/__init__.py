"""scraper package init

Keep this file lightweight: avoid importing submodules at package import
time to prevent side effects and circular imports when importing
individual submodules (e.g. scraper.logging_config).
"""

__all__ = [
    # Explicit re-exports can be added here if needed, e.g.
    # 'collect', 'split_collect'
]
