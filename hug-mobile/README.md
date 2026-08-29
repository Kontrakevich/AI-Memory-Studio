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
GitHub
  → source of truth: code, prompts, config, versions

Vercel
  → TanStack Start UI + server runtime
  → Vercel Blob private storage
      → source photos
      → generated frames/video
      → job state JSON
      → diagnostics JSON

HUG Orchestrator
  → OpenRouterTransport
      → AnalysisProvider
      → NanoBananaProvider
      → SeedanceProvider
```

OpenRouter is the AI gateway only. Provider payloads remain separate.

## Security
- Never put `OPENROUTER_API_KEY` in Git, diagnostics, or localStorage.
- The optional per-browser OpenRouter key is stored only in an HttpOnly/Secure cookie for 12 hours.
- Vercel Blob uses a server-side `BLOB_READ_WRITE_TOKEN` injected by Vercel when a Blob Store is connected to the project.
- HUG assets are written with `access: private`.
- Browser previews use short-lived presigned Blob URLs.

## Vercel production setup
1. Connect the GitHub repository to the Vercel project.
2. Production branch: `hug-mobile`.
3. Root Directory: `hug-mobile`.
4. In **Vercel → hug-mobile → Storage**, create/connect one Blob Store.
5. Vercel injects `BLOB_READ_WRITE_TOKEN` automatically.
6. Deploy/redeploy the production branch.

## Local start

```bash
npm install
cp .env.example .env
npm run dev
```

Local persistence requires a Vercel Blob read/write token in `.env`.

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
- No Supabase dependency is required.
