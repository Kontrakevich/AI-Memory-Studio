import base64
import mimetypes
from pathlib import Path
from typing import Iterable

import httpx

from ..settings import settings

BASE_URL = "https://openrouter.ai/api/v1"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://127.0.0.1:8011",
        "X-Title": "AI Memory Studio",
    }


def file_to_data_url(path: str | Path) -> str:
    path = Path(path)
    media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    raw = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{raw}"


async def chat(prompt: str, model: str | None = None) -> dict:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    payload = {
        "model": model or settings.openrouter_vision_model,
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(f"{BASE_URL}/chat/completions", headers=_headers(), json=payload)
        data = _json_or_text(response)
        return {"ok": response.is_success, "status_code": response.status_code, "data": data}


async def analyze_images(prompt: str, image_paths: Iterable[str | Path], model: str | None = None) -> dict:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    content = [{"type": "text", "text": prompt}]
    for path in image_paths:
        content.append({"type": "image_url", "image_url": {"url": file_to_data_url(path)}})
    payload = {
        "model": model or settings.openrouter_vision_model,
        "messages": [{"role": "user", "content": content}],
        "provider": {"data_collection": "deny"},
    }
    async with httpx.AsyncClient(timeout=240) as client:
        response = await client.post(f"{BASE_URL}/chat/completions", headers=_headers(), json=payload)
        return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def image_model_capabilities(model: str | None = None) -> dict:
    model = model or settings.openrouter_image_model
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(f"{BASE_URL}/images/models/{model}", headers=_headers())
        return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def generate_image(
    prompt: str,
    reference_paths: Iterable[str | Path] | None = None,
    model: str | None = None,
    aspect_ratio: str = "16:9",
    resolution: str = "2K",
    output_format: str = "png",
) -> dict:
    """Generate/edit an image through OpenRouter Unified Image API.

    OpenRouter returns base64 image bytes in data[].b64_json; storage is handled by the caller.
    """
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}

    payload = {
        "model": model or settings.openrouter_image_model,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "output_format": output_format,
        "n": 1,
        "provider": {"allow_fallbacks": True},
    }
    refs = [file_to_data_url(path) for path in (reference_paths or [])]
    if refs:
        payload["input_references"] = refs

    async with httpx.AsyncClient(timeout=600) as client:
        response = await client.post(f"{BASE_URL}/images", headers=_headers(), json=payload)
        return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


def _json_or_text(response: httpx.Response):
    try:
        return response.json()
    except Exception:
        return {"text": response.text}
