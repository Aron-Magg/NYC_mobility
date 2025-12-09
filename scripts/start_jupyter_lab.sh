#!/bin/bash

# ============================================
# Author: Aron Maggisano
# Date: 2025-11-18 (ISO 8601)
# Description:
#   Create (if needed) and use a Python virtual environment,
#   upgrade pip, install JupyterLab + ipykernel, install requirements.txt,
#   register the kernel, then launch JupyterLab — all without shell activation.
# ============================================

# Colors
BLUE='\033[1;34m'
NC='\033[0m'

say() { printf "%b%s%b\n" "$BLUE" "$1" "$NC"; }

VENV_DIR=".venv"
VENV_PY="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"
REQ_FILE="requirements.txt"

# Ensure python3 exists
if ! command -v python3 >/dev/null 2>&1; then
  printf "python3 not found on PATH. Please install it first.\n" >&2
  exit 1
fi

# Create venv if missing
if [ ! -d "$VENV_DIR" ]; then
  say "Creating virtual environment..."
  python3 -m venv "$VENV_DIR" || { echo "venv creation failed"; exit 1; }
fi

# Upgrade pip (inside venv)
say "Upgrading pip..."
"$VENV_PY" -m pip install --upgrade pip || exit 1

# Install JupyterLab and ipykernel
say "Installing JupyterLab and ipykernel..."
"$VENV_PY" -m pip install jupyterlab ipykernel || exit 1

# Install requirements.txt if it exists
if [ -f "$REQ_FILE" ]; then
  say "Installing packages from $REQ_FILE..."
  "$VENV_PY" -m pip install -r "$REQ_FILE" || { echo "Failed to install packages from $REQ_FILE"; exit 1; }
else
  say "$REQ_FILE not found, skipping..."
fi

# Register kernel
say "Registering Jupyter kernel..."
"$VENV_PY" -m ipykernel install --user --name="$(basename $VENV_DIR)" --display-name "Python ($VENV_DIR)" || exit 1

# Launch JupyterLab
say "Launching JupyterLab..."
exec "$VENV_PY" -m jupyterlab
