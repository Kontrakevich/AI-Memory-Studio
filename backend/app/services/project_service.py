import shutil
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from typing import Dict, Any
from fastapi import UploadFile
from .models import ProjectCreate, ProjectState, TaskRequest
from .storage import project_dir, save_json, load_json, list_projects as storage_list_projects
from .prompt_service import build_image_prompt, build_video_prompt
from .overlay_service import render_card_mock
from .provider_router import queue_image_job, queue_video_job


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def create_project(payload: ProjectCreate, child_file: UploadFile, adult_file: UploadFile) -> Dict[str, Any]:
    project_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S_") + uuid4().hex[:6]
    pdir = project_dir(project_id)

    child_ext = Path(child_file.filename or "child.jpg").suffix or ".jpg"
    adult_ext = Path(adult_file.filename or "adult.jpg").suffix or ".jpg"

    child_path = pdir / "input" / f"child{child_ext}"
    adult_path = pdir / "input" / f"adult{adult_ext}"

    with child_path.open("wb") as f:
        shutil.copyfileobj(child_file.file, f)
    with adult_path.open("wb") as f:
        shutil.copyfileobj(adult_file.file, f)

    state = ProjectState(
        id=project_id,
        project_name=payload.project_name,
        person=payload.person,
        status="created",
        assets={
            "child_image": str(child_path),
            "adult_image": str(adult_path),
        },
        tasks=[],
        diagnostics=[{"ts": _now(), "level": "info", "message": "Project created"}],
    )
    save_json(pdir / "project.json", state.model_dump())
    return state.model_dump()


def get_project(project_id: str) -> Dict[str, Any]:
    pdir = project_dir(project_id)
    return load_json(pdir / "project.json")


def list_projects() -> list[Dict[str, Any]]:
    return storage_list_projects()


def append_diagnostic(project_id: str, level: str, message: str, payload: Dict[str, Any] | None = None) -> None:
    state = get_project(project_id)
    state.setdefault("diagnostics", []).append({
        "ts": _now(),
        "level": level,
        "message": message,
        "payload": payload or {},
    })
    save_json(project_dir(project_id) / "project.json", state)


def start_generation(req: TaskRequest) -> Dict[str, Any]:
    state = get_project(req.project_id)
    state["status"] = "queued"
    state.setdefault("tasks", [])
    state["tasks"] = []

    for decade in req.decades:
        image_prompt = build_image_prompt(state, decade)
        task = queue_image_job(req.project_id, decade, image_prompt, req.image_provider)
        state["tasks"].append(task)
        if req.render_cards:
            card_path = render_card_mock(req.project_id, decade, state)
            state.setdefault("assets", {}).setdefault("cards", {})[decade] = card_path

    if req.create_video:
        video_prompt = build_video_prompt(state)
        video_task = queue_video_job(req.project_id, video_prompt, req.video_provider)
        state["tasks"].append(video_task)

    state["status"] = "processing"
    state.setdefault("diagnostics", []).append({"ts": _now(), "level": "info", "message": "Generation started"})
    save_json(project_dir(req.project_id) / "project.json", state)
    return state
