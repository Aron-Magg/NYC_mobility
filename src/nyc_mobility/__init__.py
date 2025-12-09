"""
NYC Mobility project package.

This package contains:
- pipeline: data ingestion and processing pipelines
- preprocessing: data cleaning and feature engineering
- visualizations: data visualization utilities
- server: local web server for the front-end.
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("nyc-mobility")
except PackageNotFoundError:  # pragma: no cover - package not installed
    __version__ = "0.0.0"
