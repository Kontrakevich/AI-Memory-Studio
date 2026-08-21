import asyncio
import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from .overlay_service import render_card
from .prompt_service import build_image_prompt, build_video_prompt
from .settings import settings
from .storage import load_json, project_dir, save_json
from .providers import openrouter, seedance, seedream


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_file(project_id: str) -> Path:
    return project_dir(project_id) / "project.json"


def _load_state(project_id: str) -> dict[str, Any]:
    return load_json(_project_file(project_id))


def _save_state(project_id: str, state: dict[str, Any]) -> None:
    save_json(_project_file(project_id), state)


def _diag(state: dict, level: str, message: str, payload: dict | None = None) -> None:
    state.setdefault("diagnostics", []).append(
        {"ts": _now(), "level": level, "message": message, "payload": payload or {}}
    )


def _task(state: dict, task_type: str, provider: str, status: str, **extra) -> dict:
    item = {
        "id": f"{task_type}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')}",
        "type": task_type,
        "provider": provider,
        "status": status,
        "updated_at": _now(),
        **extra,
    }
    state.setdefault("tasks", []).append(item)
    return item


def _extract_openrouter_text(result: dict) -> str:
    try:
        content = result["data"]["choices"][0]["message"]["content"]
        if isinstance(content, str):
            return content
        return json.dumps(content, ensure_ascii=False)
    except Exception:
        return ""


async def build_identity_passport(project_id: str) -> dict:
    state = _load_state(project_id)
    if not settings.openrouter_api_key:
        passport = {"status": "skipped", "reason": "OPENROUTER_API_KEY is empty"}
        state.setdefault("assets", {})["identity_passport"] = passport
        _save_state(project_id, state)
        return passport

    prompt = """Analyze the two reference photographs as the same real person at different ages.
Return strict JSON only. Do not infer ethnicity, health, religion, politics or other sensitive traits.
Describe only stable visible identity cues useful for image consistency: face shape, eye geometry,
eyebrows, nose geometry, mouth, jaw/chin, hairline where visible, distinctive non-sensitive visual features,
and explicit constraints for preserving identity across age transformations.
Schema: {\"stable_features\": {...}, \"identity_constraints\": [...], \"confidence_notes\": [...]}."""
    refs = [state["assets"]["child_image"], state["assets"]["adult_image"]]
    result = await openrouter.analyze_images(prompt, refs)
    passport: dict[str, Any]
    if result.get("ok"):
        raw = _extract_openrouter_text(result).strip()
        try:
            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.startswith("json"):
                    raw = raw[4:].lstrip()
            passport = json.loads(raw)
        except Exception:
            passport = {"raw": raw}
        passport["status"] = "ready"
        _diag(state, "info", "Identity passport created")
    else:
        passport = {"status": "failed", "error": result.get("error") or result.get("data")}
        _diag(state, "error", "Identity passport failed", {"provider": "openrouter"})

    state.setdefault("assets", {})["identity_passport"] = passport
    save_json(project_dir(project_id) / "identity" / "passport.json", passport)
    _save_state(project_id, state)
    return passport


def _with_identity(prompt: str, passport: dict | None) -> str:
    if not passport or passport.get("status") != "ready":
        return prompt
    clean = {k: v for k, v in passport.items() if k != "status"}
    return f"{prompt}\n\nIDENTITY PASSPORT (preserve; do not invent new traits):\n{json.dumps(clean, ensure_ascii=False)}"


async def _download(url: str, output: Path) -> None:
    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        output.write_bytes(response.content)


def _save_openrouter_b64(api_payload: dict, output: Path) -> None:
    item = api_payload["data"][0]
    raw = item.get("b64_json") or item.get("b64Json")
    if not raw:
        raise ValueError("OpenRouter image response did not contain b64_json")
    output.write_bytes(base64.b64decode(raw))


async def generate_still(
    project_id: str,
    label: str,
    prompt: str,
    provider: str,
    reference_paths: list[str],
) -> dict:
    state = _load_state(project_id)
    output = project_dir(project_id) / "epochs" / f"{project_id}_{label}_clean.png"
    record = _task(state, "image", provider, "running", label=label)
    _save_state(project_id, state)

    try:
        if provider in {"seedream", "ark"}:
            result = await seedream.generate_image(prompt, reference_paths, response_format="url")
            if not result.get("ok"):
                raise RuntimeError(str(result.get("data") or result.get("error")))
            api = result["data"]
            source_url = api["data"][0]["url"]
            await _download(source_url, output)
            provider_asset = {"url": source_url, "expires": "provider-managed temporary URL"}
        elif provider in {"openrouter", "nano_banana"}:
            result = await openrouter.generate_image(prompt, reference_paths)
            if not result.get("ok"):
                raise RuntimeError(str(result.get("data") or result.get("error")))
            api = result["data"]
            _save_openrouter_b64(api, output)
            provider_asset = {"url": None, "note": "OpenRouter returned base64; saved locally"}
        else:
            raise ValueError(f"Unsupported image provider: {provider}")

        state = _load_state(project_id)
        record = next((t for t in state.get("tasks", []) if t["id"] == record["id"]), record)
        record.update({"status": "succeeded", "updated_at": _now(), "output": str(output)})
        state.setdefault("assets", {}).setdefault("stills", {})[label] = {
            "path": str(output),
            "provider": provider,
            **provider_asset,
        }
        _diag(state, "info", f"Image generated: {label}", {"provider": provider})
        _save_state(project_id, state)
        return state["assets"]["stills"][label]
    except Exception as exc:
        state = _load_state(project_id)
        for task in state.get("tasks", []):
            if task["id"] == record["id"]:
                task.update({"status": "failed", "updated_at": _now(), "error": str(exc)})
        _diag(state, "error", f"Image generation failed: {label}", {"provider": provider, "error": str(exc)})
        _save_state(project_id, state)
        raise


async def generate_meeting_anchor(project_id: str, passport: dict | None) -> dict | None:
    """Generate the video anchor with Seedream so Seedance gets a public reference URL."""
    if not settings.ark_key:
        state = _load_state(project_id)
        _diag(state, "warning", "Meeting anchor skipped: ARK_API_KEY is empty")
        _save_state(project_id, state)
        return None

    state = _load_state(project_id)
    person = state["person"]
    prompt = f"""Create one photorealistic cinematic 16:9 master keyframe for a September 1st memory film.
Use both supplied photographs as references of the SAME PERSON at two ages.
Show the school-age version on the left or midground and the current adult version approaching from the right.
They clearly share the same identity, but their ages remain distinct and natural.
Authentic Russian school environment appropriate to the person's school years ({person['school_years']}).
Warm early-September daylight, restrained nostalgia, documentary credibility, premium cinematic photography.
No text, no logos, no fantasy morph, no duplicated limbs, no exaggerated emotion.
Leave the upper 12% visually quiet for a later deterministic caption overlay.
The frame must be immediately usable as an image-to-video first frame."""
    prompt = _with_identity(prompt, passport)
    refs = [state["assets"]["child_image"], state["assets"]["adult_image"]]
    return await generate_still(project_id, "meeting_anchor", prompt, "seedream", refs)


async def run_project_pipeline(
    project_id: str,
    decades: list[str],
    image_provider: str,
    create_video: bool = True,
    render_cards: bool = True,
) -> None:
    state = _load_state(project_id)
    state["status"] = "processing"
    state["tasks"] = []
    _diag(state, "info", "Production pipeline started", {"image_provider": image_provider, "decades": decades})
    _save_state(project_id, state)

    try:
        passport = await build_identity_passport(project_id)
        state = _load_state(project_id)
        refs = [state["assets"]["child_image"], state["assets"]["adult_image"]]

        for decade in decades:
            state = _load_state(project_id)
            prompt = _with_identity(build_image_prompt(state, decade), passport)
            try:
                asset = await generate_still(project_id, decade, prompt, image_provider, refs)
                if render_cards:
                    state = _load_state(project_id)
                    card_path = render_card(project_id, decade, state, asset["path"])
                    state.setdefault("assets", {}).setdefault("cards", {})[decade] = card_path
                    _save_state(project_id, state)
            except Exception:
                # Continue other decades; diagnostics already contain the error.
                continue

        anchor = await generate_meeting_anchor(project_id, passport) if create_video else None

        if create_video and anchor and anchor.get("url"):
            state = _load_state(project_id)
            video_prompt = build_video_prompt(state)
            video_result = await seedance.submit_video_job(video_prompt, [anchor["url"]])
            if video_result.get("ok"):
                task_id = video_result["data"].get("id")
                state.setdefault("assets", {})["video"] = {
                    "provider": "seedance",
                    "external_task_id": task_id,
                    "status": "submitted",
                    "reference_url": anchor["url"],
                }
                _task(state, "video", "seedance", "submitted", external_task_id=task_id)
                _diag(state, "info", "Seedance task submitted", {"task_id": task_id})
            else:
                _diag(state, "error", "Seedance submission failed", {"response": video_result.get("data")})
            _save_state(project_id, state)

        state = _load_state(project_id)
        failed = [t for t in state.get("tasks", []) if t.get("status") == "failed"]
        state["status"] = "partial" if failed else ("video_submitted" if create_video else "completed")
        _diag(state, "info", "Production pipeline finished", {"failed_tasks": len(failed)})
        _save_state(project_id, state)
    except Exception as exc:
        state = _load_state(project_id)
        state["status"] = "failed"
        _diag(state, "error", "Pipeline crashed", {"error": str(exc)})
        _save_state(project_id, state)


async def refresh_video_status(project_id: str) -> dict:
    state = _load_state(project_id)
    video = state.get("assets", {}).get("video") or {}
    task_id = video.get("external_task_id")
    if not task_id:
        return {"ok": False, "error": "No Seedance external_task_id in this project"}

    result = await seedance.get_video_job(task_id)
    if not result.get("ok"):
        _diag(state, "error", "Seedance status request failed", {"task_id": task_id, "response": result.get("data")})
        _save_state(project_id, state)
        return result

    api = result["data"]
    status = api.get("status", "unknown")
    video["status"] = status
    video["provider_response"] = {
        "model": api.get("model"),
        "created_at": api.get("created_at"),
        "updated_at": api.get("updated_at"),
        "usage": api.get("usage"),
    }

    if status == "succeeded":
        url = (api.get("content") or {}).get("video_url")
        video["url"] = url
        if url:
            output = project_dir(project_id) / "video" / f"{project_id}_master.mp4"
            await _download(url, output)
            video["path"] = str(output)
            state["status"] = "completed"
            _diag(state, "info", "Seedance video downloaded", {"task_id": task_id})
    elif status == "failed":
        video["error"] = api.get("error")
        state["status"] = "partial"
        _diag(state, "error", "Seedance task failed", {"task_id": task_id, "error": api.get("error")})

    state["assets"]["video"] = video
    _save_state(project_id, state)
    return {"ok": True, "status": status, "video": video}
