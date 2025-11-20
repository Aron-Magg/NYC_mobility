#!/bin/bash
# ============================================
# Author: Aron Maggisano
# Date: 2025-11-18 (ISO 8601)
# Description:
#   Recursively clean the project folder by removing:
#   - Python virtual environments named ".venv"
#   - All "__pycache__" directories
#   - All ".ipynb_checkpoints" directories
#   - All "*.pyc" files
#   Use before committing/pushing to GitHub.
# ============================================

set -euo pipefail

# Colors
RED='\033[1;31m'
BLUE='\033[1;34m'
NC='\033[0m'

say()  { printf "%b%s%b\n" "$BLUE" "$1" "$NC"; }
warn() { printf "%b%s%b\n" "$RED" "$1" "$NC"; }

# Ensure we run from the project root (script is in ./Utilities/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT_DIR"

say "Cleaning project folder recursively from: $ROOT_DIR"

########################################
# 1. Remove root-level .venv (if any)
########################################
if [ -d ".venv" ]; then
  warn "Removing root .venv ..."
  rm -rf .venv
else
  say "No root .venv directory found, skipping."
fi

########################################
# 2. Remove all __pycache__ directories
########################################
say "Removing all '__pycache__' directories..."
find . -type d -name "__pycache__" -prune -print -exec rm -rf {} +

########################################
# 3. Remove all .ipynb_checkpoints directories
########################################
say "Removing all '.ipynb_checkpoints' directories..."
find . -type d -name ".ipynb_checkpoints" -prune -print -exec rm -rf {} +

########################################
# 4. Remove all .pyc files
########################################
say "Removing all '*.pyc' files..."
find . -type file -name "*.pyc" -print -delete

say "Cleanup completed!"
