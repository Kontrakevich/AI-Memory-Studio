import json
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .services.generation_service import refresh_video_status, run_project_pipeline
from .services.models import PersonMeta, ProjectCreate, TaskRequest
from .services.project_service import create_project, get_project, list_projects
from .services.settings import settings
from .services.storage import ensure_roots


app = FastAPI(title=settings.app_title)
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
        "app": settings.app_title,
        "providers": {
            "openrouter": bool(settings.openrouter_api_key),
            "ark": bool(settings.ark_key),
            "seedream_model": settings.seedream_model,
            "seedance_model": settings.seedance_model,
        },
        "video_presets": ["WALK_TO_YOUNGER_SELF", "CHILDHOOD_CONVERSATION", "MEET_YOUNGER_SELF"],
    }


@app.get("/api/projects")
async def api_list_projects():
    return {"items": list_projects()}


@app.get("/api/projects/{project_id}")
async def api_get_project(project_id: str):
    try:
        return get_project(project_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/projects")
async def api_create_project(
    project_name: str = Form(...),
    person_json: str = Form(...),
    child_file: UploadFile = File(...),
    adult_file: UploadFile = File(...),
):
    person = PersonMeta(**json.loads(person_json))
    payload = ProjectCreate(project_name=project_name, person=person)
    state = create_project(payload, child_file, adult_file)
    return JSONResponse(state)


@app.post("/api/generate")
async def api_generate(req: TaskRequest, background_tasks: BackgroundTasks):
    try:
        state = get_project(req.project_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    provider = req.image_provider or settings.default_image_provider
    state["status"] = "queued"
    state["requested_pipeline"] = {
        "decades": req.decades,
        "image_provider": provider,
        "video_provider": req.video_provider or settings.default_video_provider,
        "video_preset": req.video_preset,
        "render_cards": req.render_cards,
        "create_video": req.create_video,
    }
    background_tasks.add_task(
        run_project_pipeline,
        req.project_id,
        req.decades,
        provider,
        req.create_video,
        req.render_cards,
        req.video_preset,
    )
    return {
        "ok": True,
        "project_id": req.project_id,
        "status": "queued",
        "video_preset": req.video_preset,
        "message": "Production pipeline queued in the local server process",
    }


@app.get("/api/video/{project_id}/status")
async def api_video_status(project_id: str):
    try:
        return await refresh_video_status(project_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/diagnostics/{project_id}")
async def api_diagnostics(project_id: str):
    state = get_project(project_id)
    return {"project_id": project_id, "diagnostics": state.get("diagnostics", [])}
