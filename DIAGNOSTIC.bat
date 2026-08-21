@echo off
setlocal
cd /d "%~dp0"
if not exist logs mkdir logs
set OUT=logs\diagnostic_latest.txt
(
  echo AI Memory Studio Diagnostic
  echo ==========================
  echo DATE: %DATE% %TIME%
  echo.
  echo [Docker]
  docker --version 2^>^&1
  echo.
  echo [Compose]
  docker compose version 2^>^&1
  echo.
  echo [Containers]
  docker compose ps 2^>^&1
  echo.
  echo [Recent logs]
  docker compose logs --tail=200 2^>^&1
) > "%OUT%"
echo Diagnostic saved to %OUT%
pause
endlocal
