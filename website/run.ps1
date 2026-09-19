# SAGE-FJD Evidence Terminal - launcher
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Starting SAGE-FJD Evidence Terminal on http://127.0.0.1:8000" -ForegroundColor Yellow
Set-Location backend
python -m uvicorn app:app --host 127.0.0.1 --port 8000
