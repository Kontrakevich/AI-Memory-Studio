from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path
from typing import Any, Iterable, Optional

import httpx

from ..settings import settings

BASE_URL = "https://openrouter.ai/api/v1"


def _headers(content_type: bool = True) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": settings.public_base_url or "http://127.0.0.1:8011",
        "X-Title": settings.app_title,
    }
    if content_type:
        headers["Content-Type"] = "application/json"
    return headers


def file_to_data_url(path: str | Path) -> str:
    path = Path(path)
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _json_or_text(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:
        return {"text": response.text}


def _extract_text(payload: dict[str, Any]) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except Exception:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") in {"text", "output_text"} and item.get("text"):
                    chunks.append(str(item["text"]))
                elif item.get("content"):
                    chunks.append(str(item["content"]))
        return "\n".join(chunks)
    return str(content)


def parse_json_text(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
    try:
        return json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except Exception:
                pass
    return {"raw": raw, "_parse_error": True}


async def _list_models_for_input(modality: str) -> dict[str, Any]:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    params = {"input_modalities": modality, "output_modalities": "text"}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(f"{BASE_URL}/models", headers=_headers(False), params=params)
    return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def list_general_models() -> dict[str, Any]:
    return await _list_models_for_input("image")


async def list_video_understanding_models() -> dict[str, Any]:
    return await _list_models_for_input("video")


async def list_image_models() -> dict[str, Any]:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(f"{BASE_URL}/images/models", headers=_headers(False))
    return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def list_video_models() -> dict[str, Any]:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(f"{BASE_URL}/videos/models", headers=_headers(False))
    return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def _chat_content_json(prompt: str, content: list[dict[str, Any]], model: str, timeout: int) -> dict[str, Any]:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}, *content]}],
        "temperature": 0,
        "provider": {"data_collection": "deny", "allow_fallbacks": True},
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{BASE_URL}/chat/completions", headers=_headers(), json=payload)
    data = _json_or_text(response)
    text = _extract_text(data) if isinstance(data, dict) else ""
    return {
        "ok": response.is_success,
        "status_code": response.status_code,
        "data": data,
        "text": text,
        "json": parse_json_text(text) if response.is_success else {},
    }


async def analyze_images_json(
    prompt: str,
    image_paths: Iterable[str | Path],
    model: str,
    timeout: int = 300,
) -> dict[str, Any]:
    media = [{"type": "image_url", "image_url": {"url": file_to_data_url(path)}} for path in image_paths]
    return await _chat_content_json(prompt, media, model, timeout)


async def analyze_video_url_json(
    prompt: str,
    video_url: str,
    model: str,
    timeout: int = 600,
) -> dict[str, Any]:
    media = [{"type": "video_url", "video_url": {"url": video_url}}]
    return await _chat_content_json(prompt, media, model, timeout)


async def generate_image(
    prompt: str,
    reference_paths: Iterable[str | Path],
    model: str,
    aspect_ratio: str = "9:16",
    resolution: str = "2K",
    output_format: str = "png",
) -> dict[str, Any]:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "output_format": output_format,
        "n": 1,
        "provider": {"allow_fallbacks": True, "data_collection": "deny"},
    }
    refs = [file_to_data_url(path) for path in reference_paths]
    if refs:
        payload["input_references"] = refs
    async with httpx.AsyncClient(timeout=settings.openrouter_generation_timeout) as client:
        response = await client.post(f"{BASE_URL}/images", headers=_headers(), json=payload)
    return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


def decode_first_image(api_payload: dict[str, Any], output: str | Path) -> Path:
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    item = (api_payload.get("data") or [None])[0] or {}
    raw = item.get("b64_json") or item.get("b64Json")
    if not raw:
        raise ValueError("OpenRouter image response did not contain data[0].b64_json")
    output.write_bytes(base64.b64decode(raw))
    return output


async def submit_video(
    *,
    prompt: str,
    model: str,
    duration: int,
    resolution: str,
    aspect_ratio: str,
    generate_audio: bool,
    first_frame_url: Optional[str] = None,
    last_frame_url: Optional[str] = None,
    input_reference_urls: Optional[list[str]] = None,
) -> dict[str, Any]:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "generate_audio": generate_audio,
    }
    frame_images: list[dict[str, Any]] = []
    if first_frame_url:
        frame_images.append({
            "type": "image_url",
            "image_url": {"url": first_frame_url},
            "frame_type": "first_frame",
        })
    if last_frame_url:
        frame_images.append({
            "type": "image_url",
            "image_url": {"url": last_frame_url},
            "frame_type": "last_frame",
        })
    if frame_images:
        payload["frame_images"] = frame_images
    if input_reference_urls:
        payload["input_references"] = [
            {"type": "image_url", "image_url": {"url": url}}
            for url in input_reference_urls
        ]
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(f"{BASE_URL}/videos", headers=_headers(), json=payload)
    return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def poll_video(polling_url: str) -> dict[str, Any]:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    url = polling_url if polling_url.startswith("http") else f"https://openrouter.ai{polling_url}"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(url, headers=_headers(False))
    return {"ok": response.is_success, "status_code": response.status_code, "data": _json_or_text(response)}


async def download_video(job: dict[str, Any], output: str | Path) -> Path:
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    unsigned = job.get("unsigned_urls") or []
    url = unsigned[0] if unsigned else f"{BASE_URL}/videos/{job['id']}/content?index=0"
    headers = _headers(False) if url.startswith("https://openrouter.ai/api/") else {}
    async with httpx.AsyncClient(timeout=600, follow_redirects=True) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        output.write_bytes(response.content)
    return output
