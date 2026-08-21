@echo off
setlocal
cd /d "%~dp0"
if not exist .env copy /Y .env.example .env >nul
where docker >nul 2>nul || (echo [ERROR] Docker not found.& pause & exit /b 1)
docker compose up --build -d
if errorlevel 1 (echo [ERROR] Docker compose failed.& pause & exit /b 1)
start "" http://127.0.0.1:8011
endlocal
