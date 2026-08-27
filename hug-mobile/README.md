# HUG Mobile

Mobile-first PWA for the **HUG / Meet Your Younger Self** workflow.

## Inputs
Exactly two user inputs:

1. `SCHOOL_IDENTITY` — school-age source photograph.
2. `ADULT_IDENTITY` — the same person today.

There is **no location upload** and **no MEETING_REFERENCE_FRAME upload**.

## Pipeline

```text
SCHOOL_IDENTITY + ADULT_IDENTITY
→ SCHOOL_ANALYSIS + ADULT_ANALYSIS
→ MEMORY_SPACE_PLAN
→ MASTER_FIRST_FRAME
→ MASTER_QC + FRAME_PASSPORT
→ MEETING_REFERENCE_FRAME (generated automatically)
→ MEETING_QC
→ 15s Seedance 2.0 video
→ VIDEO_QC
→ HUG_FINAL_FRAME
```

## Architecture

```text
HUG Orchestrator
  → OpenRouterTransport
    → AnalysisProvider
    → NanoBananaProvider
    → SeedanceProvider
  → Supabase persistence + storage
  → sanitized diagnostics
```

OpenRouter is the gateway only. Provider payloads remain separate.

## Security
Never put `OPENROUTER_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in browser code, Git, logs, diagnostics, or localStorage. Configure them only as server environment secrets.

## Local start

```bash
npm install
cp .env.example .env
npm run dev
```

Apply `supabase/migrations/20260827_hug_mobile.sql` to the selected Supabase project first.

## Current defaults
- Analysis/QC: `google/gemini-2.5-flash`
- Image/Nano Banana Pro: `google/gemini-3-pro-image`
- Video: `bytedance/seedance-2.0`
- Video: 15 seconds, 9:16, 720p

## Important implementation rules
- Source photos remain full-resolution. The mobile client does not resize identity sources.
- MASTER_FIRST_FRAME is the exact Seedance first-frame anchor.
- MEETING_REFERENCE_FRAME, SCHOOL_IDENTITY, ADULT_IDENTITY are video `input_references`.
- Poll an existing video job; transient polling errors must never submit a second paid video job.
- Retry only the failed pipeline layer.
