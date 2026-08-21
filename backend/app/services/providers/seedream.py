import base64
import mimetypes
from pathlib import Path
from typing import Iterable

import httpx

from ..settings import settings


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.ark_key}",
        "Content-Type": "application/json",
    }


def file_to_data_url(path: str | Path) -> str:
    path = Path(path)
    media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    raw = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{raw}"


async def generate_image(
    prompt: str,
    reference_paths: Iterable[str | Path] | None = None,
    model: str | None = None,
    size: str | None = None,
    response_format: str = "url",
    watermark: bool = False,
) -> dict:
    """Generate or edit an image through the official Volcengine Ark Seedream API.

    The provider accepts local references as base64 data URLs and can return a temporary
    public URL, which can be passed directly into Seedance 2.0 as a reference image.
    """
    if not settings.ark_key:
        return {"ok": False, "error": "ARK_API_KEY is empty"}

    refs = [file_to_data_url(path) for path in (reference_paths or [])]
    payload = {
        "model": model or settings.seedream_model,
        "prompt": prompt,
        "size": size or settings.seedream_size,
        "sequential_image_generation": "disabled",
        "response_format": response_format,
        "watermark": watermark,
    }
    if refs:
        payload["image"] = refs

    url = f"{settings.seedance_base_url.rstrip('/')}/images/generations"
    async with httpx.AsyncClient(timeout=600) as client:
        response = await client.post(url, headers=_headers(), json=payload)
        return {
            "ok": response.is_success,
            "status_code": response.status_code,
            "data": _json_or_text(response),
            "request": {
                "model": payload["model"],
                "size": payload["size"],
                "reference_count": len(refs),
                "response_format": response_format,
                "watermark": watermark,
            },
        }


def _json_or_text(response: httpx.Response):
    try:
        return response.json()
    except Exception:
        return {"text": response.text}
