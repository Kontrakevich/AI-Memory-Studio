# AI 1 September Memory Studio V1

MVP-модуль для пакетной подготовки школьных фото по десятилетиям и генерации анимационных видео.

## Что делает V1
- принимает 2 фото на человека: `child` и `adult`
- хранит `meta.json` / проектные данные
- генерирует очередь задач по эпохам `1970s–2020s`
- собирает промпты для image/video providers
- накладывает стандартизированную верхнюю подпись на готовые изображения
- хранит статусы задач и диагностические логи
- готов к интеграции с OpenRouter / Seedance / Kling / Nano Banana через API adapters

## Быстрый старт
```bash
cd AI_MEMORY_STUDIO_V1
cp .env.example .env
docker compose up --build
```

Открой:
- UI: http://127.0.0.1:8011
- API docs: http://127.0.0.1:8011/docs

## Основные API ключи
- `OPENROUTER_API_KEY`
- `SEEDANCE_API_KEY`
- `KLING_API_KEY`
- `NANO_BANANA_API_KEY`

## Структура проекта
- `backend/app/main.py` — FastAPI приложение
- `backend/app/services/` — бизнес-логика
- `backend/app/templates/` — UI
- `backend/app/static/` — JS/CSS
- `presets/` — стили эпох и layout preset
- `prompts/` — master prompt templates
- `n8n/` — пример workflow
- `scripts/` — сервисные утилиты

## Важный принцип
Текстовая подпись не генерируется AI. Она накладывается post-render, чтобы держать типографику и стандартизацию.
