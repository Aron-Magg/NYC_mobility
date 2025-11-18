#!/bin/bash
# ============================================
# Author: Aron Maggisano
# Date: 2025-11-18 (ISO 8601)
# Description:
#   Clean project folder by removing virtual environment,
#   Jupyter checkpoints, and other unnecessary files before pushing to GitHub.
# ============================================

# Colors
RED='\033[1;31m'
BLUE='\033[1;34m'
NC='\033[0m'

say() { printf "%b%s%b\n" "$BLUE" "$1" "$NC"; }
warn() { printf "%b%s%b\n" "$RED" "$1" "$NC"; }

# Directories/files to remove
TARGETS=(
    ".venv"
    ".ipynb_checkpoints"
    "__pycache__"
    "*.pyc"
)

say "Cleaning project folder..."

for t in "${TARGETS[@]}"; do
    if [ -e "$t" ] || [ -d "$t" ]; then
        warn "Removing $t ..."
        rm -rf $t
    else
        say "$t not found, skipping."
    fi
done

say "Cleanup completed!"

