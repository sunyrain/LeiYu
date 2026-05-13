@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 20 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-one-click.ps1" -AdminPin "LeiYu2026Check"

echo.
echo The show service stopped or failed to start.
echo Check the messages above.
pause
