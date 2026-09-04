from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from .providers import openrouter_v3
from .settings import settings
from .storage import load_json, save_json

REGISTRY_PATH = Path(settings.data_root) / "openrouter_model_registry.json"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        data = payload.get("data", payload.get("models", []))
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    return []


def _safe_load() -> dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {}
    try:
        return load_json(REGISTRY_PATH)
    except Exception:
        return {}


def _fresh(registry: dict[str, Any]) -> bool:
    raw = registry.get("refreshed_at")
    if not raw:
        return False
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return False
    return _now() - dt < timedelta(minutes=settings.model_registry_ttl_minutes)


async def refresh_registry(force: bool = False) -> dict[str, Any]:
    cached = _safe_load()
    if cached and _fresh(cached) and not force:
        return cached

    general_result, video_understanding_result, image_result, video_result = await _gather_catalogs()
    registry = {
        "refreshed_at": _now().isoformat(),
        "general": _items(general_result.get("data")) if general_result.get("ok") else [],
        "video_understanding": _items(video_understanding_result.get("data")) if video_understanding_result.get("ok") else [],
        "images": _items(image_result.get("data")) if image_result.get("ok") else [],
        "videos": _items(video_result.get("data")) if video_result.get("ok") else [],
        "errors": {
            "general": None if general_result.get("ok") else general_result.get("error") or general_result.get("data"),
            "video_understanding": None if video_understanding_result.get("ok") else video_understanding_result.get("error") or video_understanding_result.get("data"),
            "images": None if image_result.get("ok") else image_result.get("error") or image_result.get("data"),
            "videos": None if video_result.get("ok") else video_result.get("error") or video_result.get("data"),
        },
    }
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    save_json(REGISTRY_PATH, registry)
    return registry


async def _gather_catalogs() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    import asyncio

    return await asyncio.gather(
        openrouter_v3.list_general_models(),
        openrouter_v3.list_video_understanding_models(),
        openrouter_v3.list_image_models(),
        openrouter_v3.list_video_models(),
    )


def _id(model: dict[str, Any]) -> str:
    return str(model.get("id") or model.get("model") or "")


def _supported_parameters(model: dict[str, Any]) -> set[str]:
    raw = model.get("supported_parameters") or model.get("supportedParameters") or []
    if isinstance(raw, dict):
        return set(raw.keys())
    if isinstance(raw, list):
        return {str(x) for x in raw}
    return set()


def _first_matching(models: Iterable[dict[str, Any]], model_id: str) -> Optional[dict[str, Any]]:
    for model in models:
        if _id(model) == model_id:
            return model
    return None


def _rank_understanding(models: list[dict[str, Any]], preferred: str) -> dict[str, Any]:
    exact = _first_matching(models, preferred)
    if exact:
        return {"id": preferred, "reason": "preferred_available", "metadata": exact}

    scored: list[tuple[int, dict[str, Any]]] = []
    for model in models:
        mid = _id(model)
        if not mid:
            continue
        score = 0
        ctx = model.get("context_length") or model.get("contextLength") or 0
        try:
            score += min(int(ctx) // 100_000, 10)
        except Exception:
            pass
        if any(token in mid.lower() for token in ("gemini", "gpt", "claude", "qwen", "minimax", "reka")):
            score += 2
        scored.append((score, model))
    if not scored:
        return {"id": preferred, "reason": "catalog_empty_use_config", "metadata": {}}
    scored.sort(key=lambda item: item[0], reverse=True)
    best = scored[0][1]
    return {"id": _id(best), "reason": "capability_rank", "metadata": best}


def choose_vision_model(registry: dict[str, Any], requested: str | None = None) -> dict[str, Any]:
    preferred = requested or settings.openrouter_vision_model
    return _rank_understanding(registry.get("general") or [], preferred)


def choose_video_qa_model(registry: dict[str, Any], requested: str | None = None) -> dict[str, Any]:
    preferred = requested or settings.openrouter_video_qa_model
    return _rank_understanding(registry.get("video_understanding") or [], preferred)


def choose_image_model(registry: dict[str, Any], requested: str | None = None) -> dict[str, Any]:
    models = registry.get("images") or []
    preferred = requested or settings.openrouter_image_model

    def compatible(model: dict[str, Any]) -> bool:
        return "input_references" in _supported_parameters(model)

    exact = _first_matching(models, preferred)
    if exact and compatible(exact):
        return {"id": preferred, "reason": "preferred_reference_capable", "metadata": exact}

    scored: list[tuple[int, dict[str, Any]]] = []
    for model in models:
        mid = _id(model)
        if not mid or not compatible(model):
            continue
        params = _supported_parameters(model)
        score = 10
        if "resolution" in params:
            score += 2
        if "aspect_ratio" in params:
            score += 2
        if "n" in params:
            score += 1
        if any(token in mid.lower() for token in ("gemini", "gpt-image", "seedream", "flux", "grok", "recraft")):
            score += 1
        scored.append((score, model))
    if not scored:
        return {
            "id": "",
            "reason": "no_reference_capable_image_model",
            "metadata": {},
            "error": "No OpenRouter image model currently advertises input_references support",
        }
    scored.sort(key=lambda item: item[0], reverse=True)
    best = scored[0][1]
    return {"id": _id(best), "reason": "reference_capability_rank", "metadata": best}


def _supports_value(model: dict[str, Any], key: str, value: Any) -> bool:
    raw = model.get(key)
    if raw is None:
        return True
    if isinstance(raw, list):
        return value in raw
    return True


def choose_video_model(
    registry: dict[str, Any],
    *,
    requested: str | None,
    duration: int,
    resolution: str,
    aspect_ratio: str,
    require_first_frame: bool = True,
    prefer_last_frame: bool = True,
) -> dict[str, Any]:
    models = registry.get("videos") or []
    preferred = requested or settings.openrouter_video_model

    def compatible(model: dict[str, Any]) -> bool:
        if not _supports_value(model, "supported_durations", duration):
            return False
        if not _supports_value(model, "supported_resolutions", resolution):
            return False
        if not _supports_value(model, "supported_aspect_ratios", aspect_ratio):
            return False
        frames = model.get("supported_frame_images") or []
        if require_first_frame and "first_frame" not in frames:
            return False
        return True

    if preferred:
        exact = _first_matching(models, preferred)
        if exact and compatible(exact):
            return {"id": preferred, "reason": "preferred_compatible", "metadata": exact}

    scored: list[tuple[int, dict[str, Any]]] = []
    for model in models:
        mid = _id(model)
        if not mid or not compatible(model):
            continue
        frames = model.get("supported_frame_images") or []
        score = 10 if "first_frame" in frames else 0
        if prefer_last_frame and "last_frame" in frames:
            score += 8
        if model.get("supports_audio") or model.get("supported_audio"):
            score += 1
        description = str(model.get("description") or "").lower()
        if "reference" in description or model.get("supported_input_references") or model.get("input_references"):
            score += 3
        scored.append((score, model))
    if not scored:
        return {
            "id": "",
            "reason": "no_compatible_video_model",
            "metadata": {},
            "error": "No OpenRouter video model in the current catalog matches duration/resolution/aspect ratio/first-frame constraints",
        }
    scored.sort(key=lambda item: item[0], reverse=True)
    best = scored[0][1]
    return {"id": _id(best), "reason": "frame_capability_rank", "metadata": best}


def registry_summary(registry: dict[str, Any]) -> dict[str, Any]:
    return {
        "refreshed_at": registry.get("refreshed_at"),
        "vision_count": len(registry.get("general") or []),
        "video_understanding_count": len(registry.get("video_understanding") or []),
        "image_count": len(registry.get("images") or []),
        "video_count": len(registry.get("videos") or []),
        "errors": registry.get("errors") or {},
    }
