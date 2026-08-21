@echo off
cd /d %~dp0\..
if not exist .env copy .env.example .env
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8011
