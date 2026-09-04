# AI Memory Studio V3

Пользовательское веб-приложение для создания короткого эмоционального фильма о встрече человека с собой из детства.

Пользователь загружает **1–2 фотографии из детства** и **1–2 фотографии из настоящего**. Система автоматически анализирует качество исходников, реконструирует две независимые версии одной личности, фиксирует геометрию лица и подтверждённые индивидуальные отметки, восстанавливает волосы и гардероб, создаёт character sheets, ключевые кадры сцены, генерирует видео и пропускает результат через автоматический QA.

## Главный принцип

```text
SOURCE EVIDENCE
      ↓
PERIOD-SPECIFIC IDENTITY GEOMETRY
      ↓
CANONICAL IDENTITY LOCKS
      ↓
CHARACTER CARDS + QA
      ↓
START / MEETING / END ANCHORS + QA
      ↓
OPENROUTER VIDEO
      ↓
VIDEO QA
      ↓
FINAL FILM
```

Система не усредняет детское и современное лицо. Каждая временная версия строится по собственным исходникам. Между периодами допускается только подтверждение устойчивых уникальных признаков личности, если они действительно поддержаны исходными фотографиями.

## Что автоматизировано

1. **Source QA** — пригодность фото: лицо, фокус, окклюзия, перспектива, освещение, волосы, тело, гардероб.
2. **Identity analysis** — геометрия головы/лица, landmarks, глаза, брови, нос, профиль, рот, jaw/chin, уши, асимметрия.
3. **Source-only facial marks** — родинки, веснушки, шрамы, пигментация и другие индивидуальные отметки фиксируются только при прямом визуальном подтверждении. Шумы, тени, JPEG-артефакты и повреждения старой фотографии не становятся признаками личности.
4. **Hair lock** — hairline, parting, texture, length, volume, density, growth direction, color.
5. **Wardrobe lock** — только source-supported одежда, посадка, материал, цвет, pattern, collar/lapel/buttons/pockets/seams, обувь и аксессуары.
6. **Cross-age lock** — запрещает смешивание геометрии разных периодов и разрешает только доказанные persistent identity signatures.
7. **Character cards** — два отдельных технических identity sheet, каждый на одном листе: front / 3⁄4 / true profile / large front / large profile / headless body front / headless body rear.
8. **Character-card QA + repair loop** — автоматическая проверка и до двух локальных повторов с инструкциями исправления.
9. **AI Director** — базовый сценарий встречи в школьном классе.
10. **Anchor system** — start / meeting / end frames.
11. **Anchor QA + repair loop** — identity, wardrobe, body scale, camera, scene, anatomy.
12. **Dynamic OpenRouter router** — синхронизация vision/image/video/video-understanding model catalogs и выбор совместимой модели под задачу.
13. **Video generation** — first-frame guided, last-frame guided когда модель это поддерживает, optional reference images когда capability доступна.
14. **Video QA** — video-understanding модель проверяет identity drift, morph/teleport, duplicates, face reset, camera jump, scene drift и порядок действия.
15. **Diagnostics** — stage, model, retry, QA и redacted error state сохраняются без API secrets.

## UX

Пользователь видит простой сценарий:

```text
Я в детстве: 1–2 фото
+
Я сейчас: 1–2 фото
↓
Создать проект
↓
Создать фильм
↓
автоматический progress pipeline
↓
готовое видео
```

Возраст, гендер, этничность и другие не необходимые для задачи характеристики в identity analyzer не определяются.

## OpenRouter-first architecture

V3 использует один `OPENROUTER_API_KEY` для:

- vision / identity analysis через Chat Completions;
- image generation/editing через Unified Image API;
- video generation через Unified Video API;
- final video understanding QA через video-capable language model.

Приложение не жёстко привязано к одному video model. Оно обновляет OpenRouter catalogs и выбирает модель, которая соответствует требуемым capabilities: duration, resolution, aspect ratio и обязательный `first_frame`. `last_frame` и дополнительные reference images используются только когда выбранная модель явно их поддерживает.

## Важное требование для видео

Для reference-guided video приложение должно раздавать generated anchors по **публичному HTTPS URL**. Укажите:

```env
PUBLIC_BASE_URL=https://memory.example.com
```

После этого endpoint вида:

```text
https://memory.example.com/media/<project_id>/anchors/start_attempt_1.png
```

должен быть доступен OpenRouter/provider workers без авторизации.

Без `PUBLIC_BASE_URL` приложение может выполнить source analysis, identity reconstruction, character cards и anchors, но намеренно остановится перед video generation вместо запуска неконтролируемой text-only генерации.

## Первый запуск — Windows / Docker

```powershell
git clone https://github.com/Kontrakevich/AI-Memory-Studio.git
Set-Location .\AI-Memory-Studio
Copy-Item .env.example .env
notepad .env
```

Минимум:

```env
OPENROUTER_API_KEY=...
PUBLIC_BASE_URL=https://ваш-публичный-https-домен
```

Запуск:

```powershell
.\START.bat
```

Локальный интерфейс:

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

## Pipeline states

```text
source_qa
identity_analysis
identity_lock
character_cards
character_cards_qa
scene_plan
anchor_frames
anchor_frames_qa
video_generation
video_qa
finalize
```

Каждый дорогой этап имеет QA gate. При ошибке система регенерирует минимальный повреждённый слой, а не начинает весь проект заново.

## API V3

- `GET /api/health` — конфигурация системы без секретов
- `GET /api/models` — summary текущего OpenRouter registry
- `POST /api/models/refresh` — принудительная синхронизация каталогов моделей
- `GET /api/projects` — проекты V3
- `POST /api/projects` — создать проект; multipart, `meta_json`, 1–2 `child_files`, 1–2 `adult_files`
- `GET /api/projects/{project_id}` — полный JSON state
- `POST /api/projects/{project_id}/run` — запустить полный pipeline
- `GET /api/projects/{project_id}/status` — UI-safe progress/state/assets
- `GET /api/projects/{project_id}/diagnostics` — diagnostic timeline
- `GET /media/{project_id}/{path}` — безопасная раздача project media

## Данные проекта

```text
backend/app/data/projects/<project_id>/
├── input/
│   ├── child/
│   └── adult/
├── analysis/
├── identity/
├── cards/
├── scene/
├── anchors/
├── video/
├── qa/
├── logs/
└── project.json
```

Диагностический пакет содержит `pipeline_state.json` и `last_run.json`. Секретные поля редактируются перед записью.

## Safety / privacy

Не коммитить и не публиковать:

- `.env`;
- API keys;
- исходные фотографии;
- generated personal media;
- project diagnostics, если они содержат персональные данные пользователя.

В Git они исключены через `.gitignore`.

## Legacy

Провайдеры Ark / Seedream / Seedance и старые prompt/preset файлы пока оставлены в репозитории для обратной совместимости существующих экспериментов, но **V3 web workflow работает OpenRouter-first**.
