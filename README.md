# AI Memory Studio V2

Production-модуль для проекта к 1 сентября: из двух фотографий одного человека (школьной и актуальной) система строит единый identity passport, генерирует серию эпох `1970s–2020s`, накладывает стандартизированную подпись и создаёт meeting-anchor для анимации в Seedance 2.0.

## Production flow

```text
2 reference photos
      ↓
Identity Passport / OpenRouter VLM
      ↓
Era Engine 1970s → 2020s
      ↓
Seedream / Ark   or   Nano Banana / OpenRouter
      ↓
clean master stills
      ↓
post-render MARINS overlay
      ↓
meeting_anchor / Seedream
      ↓
Seedance 2.0 / Ark
      ↓
MP4 + diagnostics
```

## Провайдеры

### Рекомендуемый end-to-end path
- **Seedream 4.0 / Volcengine Ark** — multi-reference still generation. Принимает локальные изображения как Base64 и возвращает временный публичный URL.
- **Seedance 2.0 / Volcengine Ark** — reference-image-to-video. Используется официальный endpoint `/api/v3/contents/generations/tasks`.
- Один `ARK_API_KEY` используется для обоих сервисов.

### Identity-first path
- **Nano Banana / Gemini 2.5 Flash Image через OpenRouter** — selectable image provider для случаев, где приоритетом является identity/editing.
- **Gemini 2.5 Flash через OpenRouter** — анализ двух исходных фото и создание identity passport.

OpenRouter image output хранится локально как PNG. Для гарантированной передачи в Seedance meeting-anchor всё равно создаётся через Seedream, потому что Seedance reference images принимает по URL.

## Windows — первый запуск

```powershell
git clone https://github.com/Kontrakevich/AI-Memory-Studio.git
Set-Location .\AI-Memory-Studio
Copy-Item .env.example .env
notepad .env
```

Заполни минимум:

```env
ARK_API_KEY=...
OPENROUTER_API_KEY=...
```

После сохранения `.env`:

```powershell
.\START.bat
```

Интерфейс откроется на:

- UI: `http://127.0.0.1:8011`
- API docs: `http://127.0.0.1:8011/docs`

Остановка:

```powershell
.\STOP.bat
```

Диагностика:

```powershell
.\DIAGNOSTIC.bat
```

Логи сохраняются локально и исключены из Git.

## Web workflow

1. Создай человека.
2. Загрузи школьное и актуальное фото.
3. Заполни фамилию, имя, должность и годы обучения.
4. Выбери image provider:
   - `Seedream / Ark` — production default;
   - `Nano Banana / OpenRouter` — identity-first alternative.
5. Нажми **«Запустить весь pipeline»**.
6. Система выполняет эпохи `1970s–2020s`, рендерит карточки и создаёт meeting anchor.
7. Seedance запускается автоматически, если `ARK_API_KEY` заполнен.
8. Нажми **«Проверить Seedance / MP4»**, чтобы обновить статус и скачать готовое видео в локальную папку проекта.

## Данные проекта

```text
backend/app/data/projects/<project_id>/
├── input/       # original photos
├── identity/    # identity passport
├── epochs/      # clean generated stills + meeting anchor
├── cards/       # deterministic final cards
├── video/       # downloaded Seedance MP4
├── preview/
└── logs/
```

Папка `backend/app/data/projects/*`, исходные фотографии, generated media, `.env` и ключи API исключены через `.gitignore`.

## Визуальный стандарт

- Master: `16:9`
- Target still quality: `2K` generation → final standardized card
- Top safe-zone: `12%`
- Overlay: `#003050`, белая типографика
- Подпись не генерируется нейросетью — только deterministic post-render
- Era presets находятся в `presets/eras/*.json`
- Все десятилетия должны оставаться частью одного архивно-кинематографического визуального мира

## API

- `GET /api/health` — статус ключей и моделей
- `POST /api/projects` — создать проект и загрузить 2 фото
- `POST /api/generate` — запустить production pipeline
- `GET /api/projects/{project_id}` — состояние проекта
- `GET /api/video/{project_id}/status` — polling Seedance и загрузка готового MP4
- `GET /api/diagnostics/{project_id}` — диагностический журнал

## Безопасность

Никогда не коммитить:
- `.env`
- API keys
- исходные фотографии людей
- сгенерированные персональные изображения и видео
- диагностические дампы с секретами

Provider requests фиксируются только в redacted/безопасной форме.
