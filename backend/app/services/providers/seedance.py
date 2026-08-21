from typing import Iterable

import httpx

from ..settings import settings


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.seedance_api_key}",
        "Content-Type": "application/json",
    }


async def submit_video_job(
    prompt: str,
    reference_urls: Iterable[str] | None = None,
    model: str | None = None,
    ratio: str | None = None,
    duration: int | None = None,
    resolution: str | None = None,
    generate_audio: bool | None = None,
    watermark: bool = False,
) -> dict:
    """Submit a Seedance 2.0 task to the official Volcengine Ark API."""
    if not settings.seedance_api_key:
        return {"ok": False, "error": "SEEDANCE_API_KEY is empty"}

    content = [{"type": "text", "text": prompt}]
    for url in reference_urls or []:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": url},
                "role": "reference_image",
            }
        )

    payload = {
        "model": model or settings.seedance_model,
        "content": content,
        "ratio": ratio or settings.seedance_ratio,
        "duration": duration or settings.seedance_duration,
        "resolution": resolution or settings.seedance_resolution,
        "generate_audio": settings.seedance_generate_audio if generate_audio is None else generate_audio,
        "watermark": watermark,
    }

    url = f"{settings.seedance_base_url.rstrip('/')}/contents/generations/tasks"
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(url, headers=_headers(), json=payload)
        return {
            "ok": response.is_success,
            "status_code": response.status_code,
            "data": _json_or_text(response),
            "request": _redacted_request(payload),
        }


async def get_video_job(task_id: str) -> dict:
    if not settings.seedance_api_key:
        return {"ok": False, "error": "SEEDANCE_API_KEY is empty"}
    url = f"{settings.seedance_base_url.rstrip('/')}/contents/generations/tasks/{task_id}"
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.get(url, headers=_headers())
        return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def delete_video_job(task_id: str) -> dict:
    if not settings.seedance_api_key:
        return {"ok": False, "error": "SEEDANCE_API_KEY is empty"}
    url = f"{settings.seedance_base_url.rstrip('/')}/contents/generations/tasks/{task_id}"
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.delete(url, headers=_headers())
        return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


def _redacted_request(payload: dict) -> dict:
    # Safe for diagnostics: no credentials are included in the request body.
    return payload


def _json_or_text(response: httpx.Response):
    try:
        return response.json()
    except Exception:
        return {"text": response.text}
