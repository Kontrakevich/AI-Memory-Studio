import json
from pathlib import Path
from typing import Dict, Any, List
from .settings import settings


def ensure_roots() -> None:
    Path(settings.projects_root).mkdir(parents=True, exist_ok=True)


def project_dir(project_id: str) -> Path:
    root = Path(settings.projects_root)
    root.mkdir(parents=True, exist_ok=True)
    p = root / project_id
    p.mkdir(parents=True, exist_ok=True)
    for sub in ["input", "identity", "epochs", "cards", "video", "preview", "logs"]:
        (p / sub).mkdir(parents=True, exist_ok=True)
    return p


def save_json(path: Path, data: Dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def list_projects() -> List[Dict[str, Any]]:
    ensure_roots()
    items = []
    for p in Path(settings.projects_root).iterdir():
        if p.is_dir() and (p / "project.json").exists():
            items.append(load_json(p / "project.json"))
    return sorted(items, key=lambda x: x.get("id", ""), reverse=True)
