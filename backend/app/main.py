import json
from pathlib import Path
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from .services.settings import settings
from .services.models import PersonMeta, ProjectCreate, TaskRequest
from .services.project_service import create_project, list_projects, get_project, start_generation
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
    return {"ok": True, "app": settings.app_title}


@app.get("/api/projects")
async def api_list_projects():
    return {"items": list_projects()}


@app.get("/api/projects/{project_id}")
async def api_get_project(project_id: str):
    try:
        return get_project(project_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


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
async def api_generate(req: TaskRequest):
    state = start_generation(req)
    return JSONResponse(state)


@app.get("/api/diagnostics/{project_id}")
async def api_diagnostics(project_id: str):
    state = get_project(project_id)
    return {"project_id": project_id, "diagnostics": state.get("diagnostics", [])}
