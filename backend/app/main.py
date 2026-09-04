import json
from pathlib import Path
from typing import List

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .services.memory_models import MemoryProjectMeta, PipelineStartRequest
from .services.memory_pipeline import run_memory_pipeline
from .services.memory_project import (
    create_memory_project,
    list_memory_projects,
    load_state,
    resolve_media,
)
from .services.model_registry import refresh_registry, registry_summary
from .services.settings import settings
from .services.storage import ensure_roots


app = FastAPI(title=settings.app_title, version="3.0")
BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
ensure_roots()


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "title": settings.app_title})


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "version": "3.0",
        "app": settings.app_title,
        "openrouter_configured": bool(settings.openrouter_api_key),
        "public_base_url": settings.public_base_url or None,
        "public_https_ready": bool(settings.public_base_url and settings.public_base_url.lower().startswith("https://")),
        "defaults": {
            "vision_model": settings.openrouter_vision_model,
            "image_model": settings.openrouter_image_model,
            "video_model": settings.openrouter_video_model or "auto-select",
            "video_qa_model": settings.openrouter_video_qa_model,
            "aspect_ratio": settings.memory_aspect_ratio,
            "duration": settings.memory_video_duration,
            "resolution": settings.memory_video_resolution,
        },
    }


@app.get("/api/models")
async def api_models():
    try:
        registry = await refresh_registry(force=False)
        return {"ok": True, "summary": registry_summary(registry)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter model registry error: {exc}") from exc


@app.post("/api/models/refresh")
async def api_models_refresh():
    try:
        registry = await refresh_registry(force=True)
        return {"ok": True, "summary": registry_summary(registry)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter model registry error: {exc}") from exc


@app.get("/api/projects")
async def api_list_projects():
    return {"items": list_memory_projects()}


@app.post("/api/projects")
async def api_create_project(
    meta_json: str = Form(...),
    child_files: List[UploadFile] = File(...),
    adult_files: List[UploadFile] = File(...),
):
    try:
        meta = MemoryProjectMeta(**json.loads(meta_json))
        state = create_memory_project(meta, child_files, adult_files)
        return JSONResponse(state)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/projects/{project_id}")
async def api_get_project(project_id: str):
    try:
        return load_state(project_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/run")
async def api_run_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    request: PipelineStartRequest | None = None,
):
    try:
        state = load_state(project_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    req = request or PipelineStartRequest(project_id=project_id)
    req.project_id = project_id
    if state.get("status") == "processing" and not req.force_restart:
        return {"ok": True, "project_id": project_id, "status": "processing", "message": "Pipeline is already running"}

    background_tasks.add_task(run_memory_pipeline, req)
    return {
        "ok": True,
        "project_id": project_id,
        "status": "queued",
        "message": "Full identity-to-video pipeline queued",
    }


@app.get("/api/projects/{project_id}/status")
async def api_project_status(project_id: str):
    try:
        state = load_state(project_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "id": state.get("id"),
        "status": state.get("status"),
        "current_stage": state.get("current_stage"),
        "stages": state.get("stages", {}),
        "model_selection": state.get("model_selection", {}),
        "blocking_reason": state.get("blocking_reason"),
        "assets": _public_asset_view(project_id, state.get("assets", {})),
        "final": _public_asset_view(project_id, state.get("final", {})),
        "recent_diagnostics": (state.get("diagnostics") or [])[-12:],
    }


@app.get("/api/projects/{project_id}/diagnostics")
async def api_project_diagnostics(project_id: str):
    try:
        state = load_state(project_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"project_id": project_id, "diagnostics": state.get("diagnostics", [])}


@app.get("/media/{project_id}/{relative_path:path}")
async def media(project_id: str, relative_path: str):
    try:
        path = resolve_media(project_id, relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path)


def _public_asset_view(project_id: str, value):
    """Convert project-local output paths into browser-safe media URLs without exposing server paths."""
    if isinstance(value, dict):
        return {k: _public_asset_view(project_id, v) for k, v in value.items()}
    if isinstance(value, list):
        return [_public_asset_view(project_id, v) for v in value]
    if not isinstance(value, str):
        return value

    normalized = value.replace("\\", "/")
    marker = f"/{project_id}/"
    pos = normalized.rfind(marker)
    if pos >= 0:
        relative = normalized[pos + len(marker):]
        return f"/media/{project_id}/{relative}"
    return value
