from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

from fastapi import UploadFile

from .memory_models import MemoryProjectMeta, PIPELINE_STAGES, ProjectStateV3, StageRecord
from .settings import settings
from .storage import load_json, save_json

PUBLIC_MEDIA_ROOTS = {"cards", "anchors", "video", "preview"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def memory_project_dir(project_id: str) -> Path:
    root = Path(settings.projects_root)
    root.mkdir(parents=True, exist_ok=True)
    p = root / project_id
    for sub in [
        "input/child",
        "input/adult",
        "analysis",
        "identity",
        "cards",
        "scene",
        "anchors",
        "video",
        "preview",
        "qa",
        "logs",
    ]:
        (p / sub).mkdir(parents=True, exist_ok=True)
    return p


def state_path(project_id: str) -> Path:
    return memory_project_dir(project_id) / "project.json"


def load_state(project_id: str) -> dict[str, Any]:
    path = state_path(project_id)
    if not path.exists():
        raise FileNotFoundError(f"Project not found: {project_id}")
    return load_json(path)


def save_state(project_id: str, state: dict[str, Any]) -> None:
    save_json(state_path(project_id), state)


def add_diag(state: dict[str, Any], level: str, message: str, payload: dict[str, Any] | None = None) -> None:
    clean_payload = _redact(payload or {})
    state.setdefault("diagnostics", []).append({
        "ts": now_iso(),
        "level": level,
        "message": message,
        "payload": clean_payload,
    })
    state["diagnostics"] = state["diagnostics"][-500:]


def _redact(value: Any) -> Any:
    secret_tokens = ("key", "token", "authorization", "secret", "password")
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if any(token in k.lower() for token in secret_tokens):
                out[k] = "***REDACTED***"
            else:
                out[k] = _redact(v)
        return out
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def _save_upload(upload: UploadFile, target: Path) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)
    return str(target)


def _extension(upload: UploadFile, fallback: str = ".jpg") -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}:
        return suffix
    return fallback


def create_memory_project(
    meta: MemoryProjectMeta,
    child_files: Iterable[UploadFile],
    adult_files: Iterable[UploadFile],
) -> dict[str, Any]:
    children = list(child_files)
    adults = list(adult_files)
    if not 1 <= len(children) <= settings.source_max_photos_per_period:
        raise ValueError(f"Upload 1-{settings.source_max_photos_per_period} childhood photos")
    if not 1 <= len(adults) <= settings.source_max_photos_per_period:
        raise ValueError(f"Upload 1-{settings.source_max_photos_per_period} current photos")

    project_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_") + uuid4().hex[:7]
    pdir = memory_project_dir(project_id)

    child_paths = []
    for index, upload in enumerate(children, 1):
        child_paths.append(_save_upload(upload, pdir / "input" / "child" / f"child_{index:02d}{_extension(upload)}"))

    adult_paths = []
    for index, upload in enumerate(adults, 1):
        adult_paths.append(_save_upload(upload, pdir / "input" / "adult" / f"adult_{index:02d}{_extension(upload)}"))

    stages = {name: StageRecord(name=name).model_dump() for name in PIPELINE_STAGES}
    state = ProjectStateV3(
        id=project_id,
        meta=meta,
        status="created",
        current_stage="created",
        assets={
            "child_sources": child_paths,
            "adult_sources": adult_paths,
        },
        stages=stages,
    ).model_dump()
    add_diag(state, "info", "Project created", {"child_count": len(child_paths), "adult_count": len(adult_paths)})
    save_state(project_id, state)
    return state


def list_memory_projects() -> list[dict[str, Any]]:
    root = Path(settings.projects_root)
    root.mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    for directory in root.iterdir():
        path = directory / "project.json"
        if not directory.is_dir() or not path.exists():
            continue
        try:
            state = load_json(path)
        except Exception:
            continue
        if str(state.get("version", "")).startswith("3"):
            items.append(state)
    return sorted(items, key=lambda item: item.get("id", ""), reverse=True)


def set_stage(
    state: dict[str, Any],
    stage_name: str,
    status: str,
    *,
    model: str | None = None,
    message: str | None = None,
    qa: dict[str, Any] | None = None,
    output: dict[str, Any] | None = None,
) -> None:
    stage = state.setdefault("stages", {}).setdefault(stage_name, {"name": stage_name, "status": "pending", "attempt": 0})
    if status == "running":
        stage["attempt"] = int(stage.get("attempt") or 0) + 1
        stage["started_at"] = now_iso()
        stage["finished_at"] = None
    if status in {"passed", "failed", "blocked", "skipped"}:
        stage["finished_at"] = now_iso()
    stage["status"] = status
    if model is not None:
        stage["model"] = model
    if message is not None:
        stage["message"] = message
    if qa is not None:
        stage["qa"] = qa
    if output is not None:
        stage["output"] = output
    state["current_stage"] = stage_name


def public_asset_url(project_id: str, relative_path: str) -> str | None:
    if not settings.public_base_url:
        return None
    clean = relative_path.replace("\\", "/").lstrip("/")
    first = clean.split("/", 1)[0]
    if first not in PUBLIC_MEDIA_ROOTS:
        return None
    return f"{settings.public_base_url.rstrip('/')}/media/{project_id}/{clean}"


def resolve_media(project_id: str, relative_path: str) -> Path:
    clean = relative_path.replace("\\", "/").lstrip("/")
    first = clean.split("/", 1)[0]
    if first not in PUBLIC_MEDIA_ROOTS:
        raise ValueError("This project asset is private and cannot be served by the public media endpoint")

    root = memory_project_dir(project_id).resolve()
    target = (root / clean).resolve()
    if root != target and root not in target.parents:
        raise ValueError("Invalid media path")
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(relative_path)
    return target


def relative_to_project(project_id: str, path: str | Path) -> str:
    return str(Path(path).resolve().relative_to(memory_project_dir(project_id).resolve())).replace("\\", "/")
