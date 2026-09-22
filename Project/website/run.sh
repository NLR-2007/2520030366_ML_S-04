#!/usr/bin/env bash
# SAGE-FJD Evidence Terminal - launcher
set -e
cd "$(dirname "$0")/backend"
echo "Starting SAGE-FJD Evidence Terminal on http://127.0.0.1:8000"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
