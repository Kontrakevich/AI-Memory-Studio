# AI Memory Studio — UI/UX Master Specification

Status: source of truth for product UI/UX
Version: 1.0

## 1. Project

**Project:** AI Memory Studio

**Target action:** a user uploads 1–2 childhood photos and 1–2 present-day photos, the system reconstructs two consistent versions of the same identity and generates an emotional short film in which the present-day person meets their childhood self.

The product must feel like an emotional digital experience, not like a technical AI dashboard.

## 2. Design DNA

The visual and interaction system combines three proven references from the MARINS ecosystem:

1. **marins-arch.ru / MarinsFasad** — visual language.
2. **MARINS Reminder Bot / Greetings page** — operational UX and inline editing/state handling.
3. **MARINS AI Visual Studio** — progress visibility, long-running AI task UX and mobile-first behavior.

Formula:

```text
MARINS-ARCH DNA
+
ARCHITECTURAL EDITORIAL GRID
+
GREETINGS OPERATIONAL UX
+
AI VISUAL STUDIO PROGRESS UX
+
EMOTIONAL MEMORY EXPERIENCE
+
MINIMAL AI UI
=
AI MEMORY STUDIO
```

## 3. Core design principles

### 3.1 Emotion before technology

The user should feel that they are creating a memory, not configuring a model.

Do not expose model names, prompts, provider internals, seeds, JSON, logs or technical pipeline details in the default user flow.

Technical information belongs in an optional diagnostics/admin layer.

### 3.2 One clear action per screen

Each screen must answer one question and offer one dominant next action.

Avoid dense SaaS dashboards, nested settings, competing CTAs and unnecessary modal windows.

### 3.3 Architectural clarity

Use strict grid, generous whitespace, strong hierarchy, thin rules and large photographic areas.

The interface should visually resemble a premium architecture/editorial website rather than a generic AI app.

### 3.4 Photos are the main material

Uploaded and generated images are the primary visual content.

UI chrome must remain subordinate to photography and video.

### 3.5 The system explains progress, not infrastructure

Long-running AI operations must always show a clear current stage and understandable user-facing status.

Never display raw provider errors unless the user opens diagnostics.

### 3.6 Mobile-first

The complete primary flow must work comfortably on iPhone without requiring desktop mode.

Desktop adds space and comparison layouts but does not change the logical flow.

## 4. Visual system

### 4.1 Color palette

Primary:

```text
MARINS NAVY        #003050
```

Supporting surfaces:

```text
WARM PAPER         #F4F2ED
COOL LIGHT         #EEF3F6
WHITE              #FFFFFF
LINE               #D6E0E5
MUTED TEXT         #6F808B
```

Optional functional accent:

```text
TEAL               #008A90
SUCCESS            #1E8A65
WARNING            #A76B00
ERROR              #BD354B
```

The interface must not use neon gradients, purple AI aesthetics, glassmorphism or decorative glowing effects.

### 4.2 Typography

Preferred brand typography when licensed assets are available in the runtime:

- Garant PRO for major headings / brand emphasis.
- Mont or a neutral modern sans-serif for UI text.

Fallback:

```text
-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif
```

Hierarchy:

- Hero heading: large, editorial, restrained.
- Section number / eyebrow: 10–12 px, uppercase, increased tracking.
- Body: 15–18 px.
- Metadata/status: 11–13 px.

### 4.3 Shape language

Default:

- zero or minimal border radius;
- thin 1 px borders;
- no decorative shadows unless needed for layered media;
- flat white/light surfaces;
- rectangular controls;
- status pills may be rounded because they encode state.

### 4.4 Grid

Desktop:

- max content width approximately 1440–1600 px;
- 12-column editorial grid;
- wide media areas;
- generous outer margins;
- clear vertical rhythm.

Mobile:

- single-column flow;
- 12–16 px side padding;
- full-width primary actions;
- image/video content may extend wider when useful.

## 5. Motion language

Use restrained motion only:

- fade;
- masked reveal;
- slow image scale;
- short slide transitions;
- progress movement;
- subtle button/state feedback.

Avoid:

- bouncing elements;
- exaggerated spring animations;
- AI particles;
- neon glows;
- spinning 3D cards;
- decorative loading animations unrelated to progress.

Motion must support emotional pacing.

## 6. Information architecture

Primary user flow:

```text
01 / WELCOME
↓
02 / UPLOAD CHILDHOOD
↓
03 / UPLOAD NOW
↓
04 / SOURCE CHECK
↓
05 / IDENTITY CONFIRMATION
↓
06 / MEMORY SETUP
↓
07 / GENERATION PROGRESS
↓
08 / FINAL FILM
```

Secondary areas:

```text
PROJECTS
PRIVACY
HELP
DIAGNOSTICS / ADMIN
```

Do not expose the internal 18-step production state machine as 18 user-visible screens.

## 7. Screen specification

### 7.1 Welcome

Purpose: immediately explain the emotional promise.

Suggested structure:

```text
01 / AI MEMORY STUDIO

Встретьтесь
с собой из детства.

Загрузите несколько фотографий.
Мы создадим короткий фильм о встрече
вас сегодняшнего с вами из прошлого.

[ СОЗДАТЬ ВОСПОМИНАНИЕ ]
```

Visual direction:

- large editorial heading;
- one strong emotional image/video loop if available;
- significant whitespace;
- minimal navigation;
- no technical explanation above the fold.

### 7.2 Upload — Childhood

Label:

```text
02 / ДЕТСТВО
```

Requirement:

- 1 required image;
- second image optional;
- drag/drop and native mobile photo picker;
- large previews immediately after selection;
- clear replace/remove actions;
- brief guidance shown only when needed.

Primary CTA:

```text
ПРОДОЛЖИТЬ
```

### 7.3 Upload — Present day

Same interaction model as Childhood.

Label:

```text
03 / СЕЙЧАС
```

Consistency between these two screens is mandatory.

### 7.4 Source Check

The system validates images automatically.

Good state example:

```text
Фотографии подходят

Лицо хорошо различимо
Ракурс пригоден
Детали достаточно читаемы
```

Problem state example:

```text
Нужна ещё одна фотография

Лучше выбрать снимок,
где лицо видно ближе и резче.
```

UX rule:

Do not expose confidence matrices or CV terminology.

Offer direct correction action:

```text
[ ДОБАВИТЬ ФОТО ]
```

### 7.5 Identity Confirmation

Purpose: create trust before expensive video generation.

Show two large generated identity previews:

```text
ВЫ В ДЕТСТВЕ

[preview]

ВЫ СЕЙЧАС

[preview]
```

Primary actions:

```text
[ ДА, ЭТО ПОХОЖЕ НА МЕНЯ ]
[ ПОПРОБОВАТЬ ЕЩЁ ]
```

Avoid showing the full technical 7-view character card by default.

Technical character sheets may be available via an expandable "Подробнее" / diagnostics view.

### 7.6 Memory Setup

For MVP keep options minimal.

Preferred default:

```text
05 / ВСТРЕЧА

Тёплая встреча
```

Optional future presets:

- Тёплая;
- Сдержанная;
- Радостная;
- Ностальгическая.

Do not ask users for prompts.

Optional memory fields may include:

- place;
- short memory;
- school/city;
- preferred atmosphere.

All are optional.

### 7.7 Generation Progress

This screen adopts the best long-running-task behavior from MARINS AI Visual Studio.

Always show:

- current stage;
- overall progress percentage;
- visual progress track;
- short human-readable explanation;
- estimated/elapsed time only when meaningful;
- safe background/resume behavior.

User-facing stages should be compressed into approximately 5–7 emotional/product stages:

```text
Восстанавливаем фотографии
Воссоздаём вас в детстве
Воссоздаём вас сегодня
Готовим место встречи
Создаём встречу
Проверяем результат
Собираем фильм
```

Completed stages use a restrained success state.

Current stage is visually dominant.

Technical retries remain hidden unless they require user action.

### 7.8 Final Film

This is the emotional climax.

UI must become visually quiet.

Preferred sequence:

- dark or neutral transition;
- film displayed prominently;
- minimal chrome while playing;
- controls appear after playback or on interaction.

Actions after viewing:

```text
[ СОХРАНИТЬ ФИЛЬМ ]
[ СОЗДАТЬ ЕЩЁ ОДИН ]
```

Secondary:

```text
Не похоже на меня
```

Do not place technical QA information next to the film.

## 8. Greetings-page UX patterns to reuse

The Greetings implementation established useful operational patterns that must be retained conceptually.

### 8.1 Current object is always obvious

At every stage the user must understand which project / memory is active.

### 8.2 Inline actions

When an item can be fixed directly, fix it in place.

Examples:

- replace a photo;
- approve identity;
- retry one identity;
- choose a scene preset.

Avoid forcing the user through unnecessary edit pages.

### 8.3 Status pills

Use compact status indicators for meaningful states only:

```text
ГОТОВО
ОБРАБОТКА
НУЖНО ФОТО
ТРЕБУЕТ ПРОВЕРКИ
```

Do not overload the interface with badges.

### 8.4 Context-sensitive controls

Only show actions that make sense for the current state.

Do not display disabled future-stage controls across the whole page.

### 8.5 Progressive disclosure

Advanced information remains collapsed until requested.

This applies to:

- source diagnostics;
- character cards;
- model information;
- pipeline stages;
- error reports.

## 9. Progress and project status

Every project object should expose:

```text
project_name
target_action
current_stage
progress_percent
status
```

Recommended progress display:

```text
AI MEMORY STUDIO
Создаём встречу
72%
██████████████░░░░░░
```

Progress percentage must reflect real completed pipeline gates, not an arbitrary timer.

## 10. Upload UX

### 10.1 Supported behavior

- native iOS photo picker;
- drag-and-drop desktop;
- camera roll access;
- upload progress;
- image preview;
- replace;
- remove;
- retry failed upload.

### 10.2 Privacy communication

Near upload, use concise reassurance:

```text
Ваши фотографии используются только
для создания этого проекта.
```

Full privacy details belong behind a link.

### 10.3 No surprise generation

Do not begin expensive video generation before identity confirmation in the standard flow.

## 11. Error UX

Errors are classified into three levels.

### Recoverable automatically

Example:

```text
Проверяем результат ещё раз…
```

No user interruption.

### Requires user input

Example:

```text
На фотографии недостаточно видно лицо.
Добавьте ещё один снимок.
```

Give one direct corrective CTA.

### System failure

Example:

```text
Не удалось продолжить создание фильма.
Мы сохранили весь прогресс.

[ ПОВТОРИТЬ ]
```

Diagnostics are available separately.

Never show raw stack traces, provider payloads or HTTP errors in normal UI.

## 12. Admin / diagnostics UX

Technical mode may expose:

- internal stage machine;
- model routing;
- QA scores;
- retries;
- cost;
- prompts;
- asset lineage;
- diagnostic package;
- provider failures.

This mode must be visually separated from the consumer experience.

## 13. Responsive behavior

### Mobile

Primary target.

- one-column flow;
- bottom safe area respected;
- 44 px minimum tap target;
- sticky primary CTA where appropriate;
- video optimized for 9:16;
- no horizontal scrolling.

### Tablet

- one or two columns depending on task;
- identity comparison may become two-column.

### Desktop

- wide editorial composition;
- dual-column source comparison;
- large media previews;
- progress rail may sit to the side.

## 14. Accessibility

Minimum requirements:

- semantic headings;
- visible keyboard focus;
- sufficient contrast;
- form labels;
- alt text for non-decorative imagery;
- captions/subtitles when final film contains speech;
- progress information not conveyed by color alone;
- reduced-motion support.

## 15. Component inventory

Core components:

```text
AppHeader
ProjectIdentity
SectionEyebrow
EditorialHeading
PhotoUploader
PhotoPreview
SourceQualityNotice
IdentityPreview
IdentityApprovalActions
ScenePresetSelector
ProgressRail
ProgressStage
ProgressBar
StatusPill
InlineAction
VideoHero
FinalActions
DiagnosticsDrawer
PrivacyNotice
```

All components must use shared design tokens.

## 16. Design tokens

Suggested initial tokens:

```css
:root {
  --ams-navy: #003050;
  --ams-teal: #008a90;
  --ams-paper: #f4f2ed;
  --ams-cool-bg: #eef3f6;
  --ams-white: #ffffff;
  --ams-line: #d6e0e5;
  --ams-muted: #6f808b;
  --ams-success: #1e8a65;
  --ams-warning: #a76b00;
  --ams-error: #bd354b;

  --ams-radius: 0px;
  --ams-border: 1px;

  --ams-space-1: 4px;
  --ams-space-2: 8px;
  --ams-space-3: 12px;
  --ams-space-4: 16px;
  --ams-space-5: 24px;
  --ams-space-6: 32px;
  --ams-space-7: 48px;
  --ams-space-8: 72px;
}
```

## 17. Anti-patterns — forbidden by default

Do not introduce without explicit design decision:

- dark gradient SaaS dashboard as primary product UI;
- neon AI aesthetic;
- purple/blue glowing cards;
- excessive rounded cards;
- glassmorphism;
- decorative 3D blobs;
- hidden progress;
- raw model selectors in consumer flow;
- prompt textareas in consumer flow;
- multiple competing CTAs;
- modal-heavy navigation;
- generic stock imagery;
- fake progress timers;
- automatic beautification of identity previews.

## 18. Acceptance criteria

UI/UX implementation is accepted only when:

- a first-time user understands the product promise within several seconds;
- the upload flow requires no technical knowledge;
- the user can complete the full flow on iPhone;
- the current project stage is always understandable;
- long-running generation never looks frozen;
- the consumer UI does not expose model/provider complexity;
- identity confirmation happens before final video generation;
- errors explain the required action in plain language;
- the final film receives visual priority over controls;
- the design clearly inherits the architectural MARINS visual language;
- the interface does not look like a generic AI/SaaS template.

## 19. Implementation rule

This file is the UI/UX source of truth for AI Memory Studio.

Any future UI implementation, redesign, component generation or AI coding task must consult this specification first.

If implementation conflicts with this document, update the implementation to match the specification unless a newer approved UI/UX decision explicitly supersedes it.
