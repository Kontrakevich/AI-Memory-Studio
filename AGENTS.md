# AGENTS.md — AI Memory Studio

## Project purpose
Production system for creating consistent decade-styled school portraits and animated videos from two identity references: childhood and present-day adult photos.

## Non-negotiable rules
1. Preserve identity consistency across all generated decades.
2. Never render captions or logos inside AI-generated images; typography is post-render only.
3. Keep the upper safe-zone clean for standardized overlays.
4. Never commit API keys, `.env`, source portraits, generated personal imagery, or diagnostic payloads containing secrets.
5. Any provider failure must be captured in project diagnostics without secrets.
6. Use provider adapters; do not hard-code provider-specific logic into the UI or project service.
7. Maintain deterministic file naming and project isolation.
8. Prefer full build updates over manual patch instructions.

## Default production stack
- FastAPI / Python 3.11
- Provider adapters: OpenRouter, Nano Banana, Seedance, Kling
- n8n integration via webhook/HTTP
- Docker Compose

## Output standard
- Master stills: 16:9, target 3840×2160
- Decades: 1970s, 1980s, 1990s, 2000s, 2010s, 2020s
- Caption layer: standardized post-render overlay
