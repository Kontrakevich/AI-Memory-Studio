from __future__ import annotations

import asyncio
import json
import traceback
from pathlib import Path
from typing import Any

from . import memory_prompts
from .memory_models import PipelineStartRequest
from .memory_project import (
    add_diag,
    load_state,
    memory_project_dir,
    public_asset_url,
    relative_to_project,
    save_state,
    set_stage,
)
from .model_registry import (
    choose_image_model,
    choose_video_model,
    choose_video_qa_model,
    choose_vision_model,
    refresh_registry,
    registry_summary,
)
from .providers import openrouter_v3
from .settings import settings
from .storage import save_json


class PipelineBlocked(RuntimeError):
    pass


def _state(project_id: str) -> dict[str, Any]:
    return load_state(project_id)


def _save(project_id: str, state: dict[str, Any]) -> None:
    save_state(project_id, state)


def _write_json(project_id: str, relative: str, payload: dict[str, Any]) -> str:
    path = memory_project_dir(project_id) / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(path, payload)
    return str(path)


def _json_ok(result: dict[str, Any]) -> dict[str, Any]:
    if not result.get("ok"):
        raise RuntimeError(str(result.get("error") or result.get("data") or "OpenRouter request failed"))
    payload = result.get("json") or {}
    if payload.get("_parse_error"):
        raise RuntimeError("Model returned non-JSON output where strict JSON was required")
    return payload


def _qa_passed(payload: dict[str, Any]) -> bool:
    return str(payload.get("status", "")).upper() == "PASS"


def _period_source_labels(prefix: str, paths: list[str]) -> list[str]:
    return [f"{prefix}_{i:02d}" for i in range(1, len(paths) + 1)]


async def _select_models(project_id: str, request: PipelineStartRequest) -> dict[str, Any]:
    registry = await refresh_registry(force=False)
    state = _state(project_id)
    meta = state["meta"]

    vision = choose_vision_model(registry, request.vision_model)
    image = choose_image_model(registry, request.image_model)
    video = choose_video_model(
        registry,
        requested=request.video_model,
        duration=int(meta.get("duration") or settings.memory_video_duration),
        resolution=str(meta.get("resolution") or settings.memory_video_resolution),
        aspect_ratio=str(meta.get("aspect_ratio") or settings.memory_aspect_ratio),
        require_first_frame=True,
        prefer_last_frame=True,
    )
    video_qa = choose_video_qa_model(registry)

    if not vision.get("id"):
        raise PipelineBlocked("No vision-capable OpenRouter model is available")
    if not image.get("id"):
        raise PipelineBlocked("No OpenRouter image model is available")
    if video.get("error") or not video.get("id"):
        raise PipelineBlocked(video.get("error") or "No compatible OpenRouter video model is available")

    selected = {
        "registry": registry_summary(registry),
        "vision": vision,
        "image": image,
        "video": video,
        "video_qa": video_qa,
    }
    state["model_selection"] = selected
    add_diag(state, "info", "OpenRouter model routing complete", {
        "vision": vision.get("id"),
        "image": image.get("id"),
        "video": video.get("id"),
        "video_qa": video_qa.get("id"),
    })
    _save(project_id, state)
    return selected


async def _source_qa(project_id: str, vision_model: str) -> None:
    state = _state(project_id)
    set_stage(state, "source_qa", "running", model=vision_model, message="Проверяем исходные фотографии")
    _save(project_id, state)

    child_paths = state["assets"]["child_sources"]
    adult_paths = state["assets"]["adult_sources"]
    child_labels = _period_source_labels("child", child_paths)
    adult_labels = _period_source_labels("current", adult_paths)

    child_result = await openrouter_v3.analyze_images_json(
        memory_prompts.source_qa_prompt(child_labels), child_paths, vision_model
    )
    adult_result = await openrouter_v3.analyze_images_json(
        memory_prompts.source_qa_prompt(adult_labels), adult_paths, vision_model
    )
    child_qa = _json_ok(child_result)
    adult_qa = _json_ok(adult_result)
    payload = {"child": child_qa, "current": adult_qa}
    _write_json(project_id, "analysis/source_qa.json", payload)

    failed = []
    for period, qa in payload.items():
        if str(qa.get("period_status", "PASS")).upper() == "FAIL":
            failed.append({"period": period, "message": qa.get("request_message") or "Source quality is insufficient"})

    state = _state(project_id)
    state.setdefault("analysis", {})["source_qa"] = payload
    if failed:
        set_stage(state, "source_qa", "blocked", model=vision_model, qa=payload, message="Нужны более качественные исходные фото")
        state["status"] = "awaiting_sources"
        state["blocking_reason"] = failed
        add_diag(state, "warning", "Source QA blocked the pipeline", {"failures": failed})
        _save(project_id, state)
        raise PipelineBlocked("Source QA failed; upload a better source photo")

    set_stage(state, "source_qa", "passed", model=vision_model, qa=payload, message="Исходники пригодны")
    add_diag(state, "info", "Source QA passed")
    _save(project_id, state)


async def _identity_analysis(project_id: str, vision_model: str) -> tuple[dict[str, Any], dict[str, Any]]:
    state = _state(project_id)
    set_stage(state, "identity_analysis", "running", model=vision_model, message="Восстанавливаем две версии личности")
    _save(project_id, state)

    child_paths = state["assets"]["child_sources"]
    adult_paths = state["assets"]["adult_sources"]
    child_labels = _period_source_labels("child", child_paths)
    adult_labels = _period_source_labels("current", adult_paths)

    child_result, adult_result = await asyncio.gather(
        openrouter_v3.analyze_images_json(
            memory_prompts.identity_analysis_prompt("EARLIER_SELF", child_labels), child_paths, vision_model
        ),
        openrouter_v3.analyze_images_json(
            memory_prompts.identity_analysis_prompt("PRESENT_SELF", adult_labels), adult_paths, vision_model
        ),
    )
    child_identity = _json_ok(child_result)
    adult_identity = _json_ok(adult_result)
    _write_json(project_id, "identity/earlier_self_analysis.json", child_identity)
    _write_json(project_id, "identity/present_self_analysis.json", adult_identity)

    state = _state(project_id)
    state.setdefault("identity", {})["earlier_self_analysis"] = child_identity
    state.setdefault("identity", {})["present_self_analysis"] = adult_identity
    set_stage(state, "identity_analysis", "passed", model=vision_model, message="Геометрия, метки, волосы и гардероб извлечены")
    add_diag(state, "info", "Identity analysis passed")
    _save(project_id, state)
    return child_identity, adult_identity


async def _identity_lock(project_id: str, vision_model: str, child_identity: dict[str, Any], adult_identity: dict[str, Any]) -> dict[str, Any]:
    state = _state(project_id)
    set_stage(state, "identity_lock", "running", model=vision_model, message="Собираем cross-age identity lock")
    _save(project_id, state)

    result = await openrouter_v3.analyze_images_json(
        memory_prompts.cross_age_lock_prompt(child_identity, adult_identity), [], vision_model
    )
    lock = _json_ok(result)
    _write_json(project_id, "identity/cross_age_lock.json", lock)

    state = _state(project_id)
    state.setdefault("identity", {})["cross_age_lock"] = lock
    set_stage(state, "identity_lock", "passed", model=vision_model, output={"lock": "identity/cross_age_lock.json"})
    add_diag(state, "info", "Cross-age identity lock created")
    _save(project_id, state)
    return lock


async def _generate_card(
    project_id: str,
    role: str,
    source_paths: list[str],
    identity: dict[str, Any],
    cross_lock: dict[str, Any],
    image_model: str,
    age_offset: int,
    repair: list[str] | None = None,
    attempt: int = 1,
) -> str:
    prompt = memory_prompts.character_card_prompt(
        period_role=role,
        identity=identity,
        cross_lock=cross_lock,
        age_offset=age_offset,
    )
    if repair:
        prompt += "\n\nMANDATORY REPAIR FROM PREVIOUS QA:\n- " + "\n- ".join(repair)
    result = await openrouter_v3.generate_image(
        prompt,
        source_paths,
        image_model,
        aspect_ratio="16:9",
        resolution="2K",
    )
    if not result.get("ok"):
        raise RuntimeError(str(result.get("error") or result.get("data")))
    output = memory_project_dir(project_id) / "cards" / f"{role.lower()}_card_attempt_{attempt}.png"
    openrouter_v3.decode_first_image(result["data"], output)
    return str(output)


async def _character_cards(
    project_id: str,
    vision_model: str,
    image_model: str,
    child_identity: dict[str, Any],
    adult_identity: dict[str, Any],
    cross_lock: dict[str, Any],
) -> tuple[str, str]:
    state = _state(project_id)
    set_stage(state, "character_cards", "running", model=image_model, message="Генерируем два identity sheet")
    _save(project_id, state)

    child_paths = state["assets"]["child_sources"]
    adult_paths = state["assets"]["adult_sources"]
    meta = state["meta"]

    child_card, adult_card = await asyncio.gather(
        _generate_card(project_id, "EARLIER_SELF", child_paths, child_identity, cross_lock, image_model, int(meta.get("child_age_offset") or 0)),
        _generate_card(project_id, "PRESENT_SELF", adult_paths, adult_identity, cross_lock, image_model, int(meta.get("adult_age_offset") or 0)),
    )

    state = _state(project_id)
    state.setdefault("assets", {})["character_cards"] = {"earlier_self": child_card, "present_self": adult_card}
    set_stage(state, "character_cards", "passed", model=image_model, output=state["assets"]["character_cards"])
    add_diag(state, "info", "Character cards generated", {"image_model": image_model})
    _save(project_id, state)
    return child_card, adult_card


async def _qa_and_repair_cards(
    project_id: str,
    vision_model: str,
    image_model: str,
    child_identity: dict[str, Any],
    adult_identity: dict[str, Any],
    cross_lock: dict[str, Any],
    child_card: str,
    adult_card: str,
) -> tuple[str, str]:
    state = _state(project_id)
    set_stage(state, "character_cards_qa", "running", model=vision_model, message="Проверяем идентичность карточек")
    _save(project_id, state)

    configs = {
        "earlier_self": {
            "role": "EARLIER_SELF",
            "sources": state["assets"]["child_sources"],
            "identity": child_identity,
            "card": child_card,
            "age_offset": int(state["meta"].get("child_age_offset") or 0),
        },
        "present_self": {
            "role": "PRESENT_SELF",
            "sources": state["assets"]["adult_sources"],
            "identity": adult_identity,
            "card": adult_card,
            "age_offset": int(state["meta"].get("adult_age_offset") or 0),
        },
    }
    qa_out: dict[str, Any] = {}

    for key, cfg in configs.items():
        current_card = cfg["card"]
        last_qa: dict[str, Any] = {}
        for retry in range(settings.pipeline_max_retries + 1):
            qa_result = await openrouter_v3.analyze_images_json(
                memory_prompts.character_card_qa_prompt(cfg["role"], cfg["identity"]),
                [*cfg["sources"], current_card],
                vision_model,
            )
            last_qa = _json_ok(qa_result)
            if _qa_passed(last_qa):
                break
            if retry >= settings.pipeline_max_retries:
                break
            current_card = await _generate_card(
                project_id,
                cfg["role"],
                cfg["sources"],
                cfg["identity"],
                cross_lock,
                image_model,
                cfg["age_offset"],
                repair=list(last_qa.get("repair_instructions") or []),
                attempt=retry + 2,
            )
        qa_out[key] = last_qa
        cfg["card"] = current_card

    _write_json(project_id, "qa/character_cards.json", qa_out)
    state = _state(project_id)
    state["assets"]["character_cards"] = {
        "earlier_self": configs["earlier_self"]["card"],
        "present_self": configs["present_self"]["card"],
    }
    if not all(_qa_passed(v) for v in qa_out.values()):
        set_stage(state, "character_cards_qa", "blocked", model=vision_model, qa=qa_out, message="Identity card QA failed")
        state["status"] = "needs_review"
        add_diag(state, "error", "Character-card QA failed after repair attempts", qa_out)
        _save(project_id, state)
        raise PipelineBlocked("Character-card identity QA failed")

    set_stage(state, "character_cards_qa", "passed", model=vision_model, qa=qa_out, message="Карточки прошли identity QA")
    add_diag(state, "info", "Character-card QA passed")
    _save(project_id, state)
    return configs["earlier_self"]["card"], configs["present_self"]["card"]


async def _scene_plan(project_id: str, vision_model: str) -> dict[str, Any]:
    state = _state(project_id)
    set_stage(state, "scene_plan", "running", model=vision_model, message="Режиссируем встречу")
    _save(project_id, state)
    result = await openrouter_v3.analyze_images_json(memory_prompts.scene_plan_prompt(state["meta"]), [], vision_model)
    plan = _json_ok(result)
    _write_json(project_id, "scene/scene_plan.json", plan)
    state = _state(project_id)
    state.setdefault("scene", {})["plan"] = plan
    set_stage(state, "scene_plan", "passed", model=vision_model, output={"scene_plan": "scene/scene_plan.json"})
    add_diag(state, "info", "Scene plan created")
    _save(project_id, state)
    return plan


async def _generate_anchor(
    project_id: str,
    kind: str,
    scene_plan: dict[str, Any],
    child_identity: dict[str, Any],
    adult_identity: dict[str, Any],
    child_card: str,
    adult_card: str,
    image_model: str,
    repair: list[str] | None = None,
    attempt: int = 1,
) -> str:
    prompt = memory_prompts.anchor_prompt(kind, scene_plan, child_identity, adult_identity)
    if repair:
        prompt += "\n\nMANDATORY QA REPAIR:\n- " + "\n- ".join(repair)
    state = _state(project_id)
    if kind == "start":
        refs = [*state["assets"]["child_sources"], child_card]
    else:
        refs = [*state["assets"]["child_sources"], *state["assets"]["adult_sources"], child_card, adult_card]
    result = await openrouter_v3.generate_image(
        prompt,
        refs,
        image_model,
        aspect_ratio=state["meta"].get("aspect_ratio") or settings.memory_aspect_ratio,
        resolution="2K",
    )
    if not result.get("ok"):
        raise RuntimeError(str(result.get("error") or result.get("data")))
    output = memory_project_dir(project_id) / "anchors" / f"{kind}_attempt_{attempt}.png"
    openrouter_v3.decode_first_image(result["data"], output)
    return str(output)


async def _anchors_with_qa(
    project_id: str,
    vision_model: str,
    image_model: str,
    scene_plan: dict[str, Any],
    child_identity: dict[str, Any],
    adult_identity: dict[str, Any],
    child_card: str,
    adult_card: str,
) -> dict[str, str]:
    state = _state(project_id)
    set_stage(state, "anchor_frames", "running", model=image_model, message="Создаём start / meeting / end anchors")
    _save(project_id, state)

    anchors: dict[str, str] = {}
    for kind in ("start", "meeting", "end"):
        anchors[kind] = await _generate_anchor(
            project_id, kind, scene_plan, child_identity, adult_identity, child_card, adult_card, image_model
        )

    state = _state(project_id)
    state["assets"]["anchors"] = anchors
    set_stage(state, "anchor_frames", "passed", model=image_model, output=anchors)
    _save(project_id, state)

    set_stage(state, "anchor_frames_qa", "running", model=vision_model, message="Проверяем anchors")
    _save(project_id, state)
    qa_all: dict[str, Any] = {}

    for kind in ("start", "meeting", "end"):
        current = anchors[kind]
        last_qa: dict[str, Any] = {}
        for retry in range(settings.pipeline_max_retries + 1):
            qa_refs = [
                *state["assets"]["child_sources"],
                *state["assets"]["adult_sources"],
                child_card,
                adult_card,
                current,
            ]
            result = await openrouter_v3.analyze_images_json(memory_prompts.anchor_qa_prompt(kind), qa_refs, vision_model)
            last_qa = _json_ok(result)
            if _qa_passed(last_qa):
                break
            if retry >= settings.pipeline_max_retries:
                break
            current = await _generate_anchor(
                project_id,
                kind,
                scene_plan,
                child_identity,
                adult_identity,
                child_card,
                adult_card,
                image_model,
                repair=list(last_qa.get("repair_instructions") or []),
                attempt=retry + 2,
            )
        anchors[kind] = current
        qa_all[kind] = last_qa

    _write_json(project_id, "qa/anchors.json", qa_all)
    state = _state(project_id)
    state["assets"]["anchors"] = anchors
    if not all(_qa_passed(v) for v in qa_all.values()):
        set_stage(state, "anchor_frames_qa", "blocked", model=vision_model, qa=qa_all, message="Anchor QA failed")
        state["status"] = "needs_review"
        add_diag(state, "error", "Anchor QA failed after repair attempts", qa_all)
        _save(project_id, state)
        raise PipelineBlocked("Anchor identity/scene QA failed")
    set_stage(state, "anchor_frames_qa", "passed", model=vision_model, qa=qa_all, message="Anchors прошли QA")
    add_diag(state, "info", "Anchor QA passed")
    _save(project_id, state)
    return anchors


def _public_url_for_file(project_id: str, path: str) -> str | None:
    rel = relative_to_project(project_id, path)
    return public_asset_url(project_id, rel)


async def _wait_video_job(job: dict[str, Any]) -> dict[str, Any]:
    current = job
    for _ in range(90):
        status = str(current.get("status", "")).lower()
        if status in {"completed", "succeeded"}:
            return current
        if status in {"failed", "cancelled", "expired"}:
            raise RuntimeError(str(current.get("error") or f"Video generation {status}"))
        polling_url = current.get("polling_url")
        if not polling_url:
            raise RuntimeError("OpenRouter video job did not return polling_url")
        await asyncio.sleep(20)
        result = await openrouter_v3.poll_video(polling_url)
        if not result.get("ok"):
            raise RuntimeError(str(result.get("error") or result.get("data")))
        current = result["data"]
    raise TimeoutError("Video generation did not complete within 30 minutes")


async def _video_generation(
    project_id: str,
    video_selection: dict[str, Any],
    scene_plan: dict[str, Any],
    anchors: dict[str, str],
    child_card: str,
    adult_card: str,
) -> tuple[str, dict[str, Any]]:
    state = _state(project_id)
    video_model = video_selection["id"]
    set_stage(state, "video_generation", "running", model=video_model, message="Генерируем встречу")
    _save(project_id, state)

    if not settings.public_base_url or not settings.public_base_url.lower().startswith("https://"):
        state = _state(project_id)
        set_stage(
            state,
            "video_generation",
            "blocked",
            model=video_model,
            message="Для reference-guided video нужен PUBLIC_BASE_URL с публичным HTTPS адресом приложения",
        )
        state["status"] = "awaiting_public_url"
        add_diag(state, "warning", "Video blocked: PUBLIC_BASE_URL is missing or not HTTPS")
        _save(project_id, state)
        raise PipelineBlocked("Set PUBLIC_BASE_URL to the public HTTPS address of this app")

    start_url = _public_url_for_file(project_id, anchors["start"])
    end_url = _public_url_for_file(project_id, anchors["end"])
    child_card_url = _public_url_for_file(project_id, child_card)
    adult_card_url = _public_url_for_file(project_id, adult_card)
    meeting_url = _public_url_for_file(project_id, anchors["meeting"])

    metadata = video_selection.get("metadata") or {}
    supported_frames = metadata.get("supported_frame_images") or []
    use_last = "last_frame" in supported_frames

    description = json.dumps(metadata, ensure_ascii=False).lower()
    supports_refs = "reference" in description or bool(metadata.get("supported_input_references"))
    reference_urls = [u for u in (child_card_url, adult_card_url, meeting_url) if u] if supports_refs else None

    result = await openrouter_v3.submit_video(
        prompt=memory_prompts.video_prompt(scene_plan),
        model=video_model,
        duration=int(state["meta"].get("duration") or settings.memory_video_duration),
        resolution=str(state["meta"].get("resolution") or settings.memory_video_resolution),
        aspect_ratio=str(state["meta"].get("aspect_ratio") or settings.memory_aspect_ratio),
        generate_audio=bool(state["meta"].get("generate_audio", settings.memory_generate_audio)),
        first_frame_url=start_url,
        last_frame_url=end_url if use_last else None,
        input_reference_urls=reference_urls,
    )
    if not result.get("ok"):
        raise RuntimeError(str(result.get("error") or result.get("data")))
    job = result["data"]

    state = _state(project_id)
    state.setdefault("assets", {})["video_job"] = {
        "model": video_model,
        "id": job.get("id"),
        "status": job.get("status"),
        "polling_url": job.get("polling_url"),
        "used_last_frame": use_last,
        "used_reference_images": bool(reference_urls),
    }
    _save(project_id, state)

    completed = await _wait_video_job(job)
    output = memory_project_dir(project_id) / "video" / "memory_master.mp4"
    await openrouter_v3.download_video(completed, output)

    state = _state(project_id)
    state["assets"]["video"] = {
        "path": str(output),
        "public_url": _public_url_for_file(project_id, str(output)),
        "model": video_model,
        "job_id": completed.get("id"),
        "provider_status": completed.get("status"),
    }
    set_stage(state, "video_generation", "passed", model=video_model, output=state["assets"]["video"], message="Видео сгенерировано")
    add_diag(state, "info", "OpenRouter video completed", {"model": video_model, "job_id": completed.get("id")})
    _save(project_id, state)
    return str(output), completed


async def _video_qa(project_id: str, qa_model: str, video_path: str) -> dict[str, Any]:
    state = _state(project_id)
    set_stage(state, "video_qa", "running", model=qa_model, message="Проверяем готовое видео")
    _save(project_id, state)

    video_url = _public_url_for_file(project_id, video_path)
    if not video_url:
        raise PipelineBlocked("Video QA requires PUBLIC_BASE_URL")
    result = await openrouter_v3.analyze_video_url_json(memory_prompts.final_video_qa_prompt(), video_url, qa_model)
    qa = _json_ok(result)
    _write_json(project_id, "qa/video.json", qa)

    state = _state(project_id)
    if not _qa_passed(qa):
        set_stage(state, "video_qa", "blocked", model=qa_model, qa=qa, message="Видео не прошло identity QA")
        state["status"] = "needs_review"
        add_diag(state, "error", "Final video QA failed", qa)
        _save(project_id, state)
        raise PipelineBlocked("Final video QA failed")
    set_stage(state, "video_qa", "passed", model=qa_model, qa=qa, message="Видео прошло QA")
    add_diag(state, "info", "Final video QA passed")
    _save(project_id, state)
    return qa


async def _finalize(project_id: str) -> None:
    state = _state(project_id)
    set_stage(state, "finalize", "running", message="Финализируем проект")
    state["status"] = "finalizing"
    _save(project_id, state)

    video = state.get("assets", {}).get("video") or {}
    state["final"] = {
        "video": video,
        "earlier_self_card": state.get("assets", {}).get("character_cards", {}).get("earlier_self"),
        "present_self_card": state.get("assets", {}).get("character_cards", {}).get("present_self"),
        "anchors": state.get("assets", {}).get("anchors", {}),
    }
    state["status"] = "completed"
    set_stage(state, "finalize", "passed", output=state["final"], message="Фильм готов")
    add_diag(state, "info", "Pipeline completed")
    _save(project_id, state)


def _write_diagnostic_package(project_id: str, state: dict[str, Any], error: Exception | None = None) -> None:
    pdir = memory_project_dir(project_id) / "logs"
    pdir.mkdir(parents=True, exist_ok=True)
    save_json(pdir / "pipeline_state.json", state)
    last_run = {
        "project_id": project_id,
        "status": state.get("status"),
        "current_stage": state.get("current_stage"),
        "error_type": type(error).__name__ if error else None,
        "error": str(error) if error else None,
        "traceback": traceback.format_exc() if error else None,
        "model_selection": state.get("model_selection"),
        "recent_diagnostics": (state.get("diagnostics") or [])[-50:],
    }
    save_json(pdir / "last_run.json", last_run)


async def run_memory_pipeline(request: PipelineStartRequest) -> None:
    project_id = request.project_id
    state = _state(project_id)
    if state.get("status") == "processing" and not request.force_restart:
        return
    state["status"] = "processing"
    state.pop("blocking_reason", None)
    add_diag(state, "info", "AI Memory Studio V3 pipeline started")
    _save(project_id, state)

    try:
        if not settings.openrouter_api_key:
            raise PipelineBlocked("OPENROUTER_API_KEY is empty")

        selected = await _select_models(project_id, request)
        vision_model = selected["vision"]["id"]
        image_model = selected["image"]["id"]
        video_selection = selected["video"]
        video_qa_model = selected["video_qa"]["id"]

        await _source_qa(project_id, vision_model)
        child_identity, adult_identity = await _identity_analysis(project_id, vision_model)
        cross_lock = await _identity_lock(project_id, vision_model, child_identity, adult_identity)
        child_card, adult_card = await _character_cards(
            project_id, vision_model, image_model, child_identity, adult_identity, cross_lock
        )
        child_card, adult_card = await _qa_and_repair_cards(
            project_id,
            vision_model,
            image_model,
            child_identity,
            adult_identity,
            cross_lock,
            child_card,
            adult_card,
        )
        scene_plan = await _scene_plan(project_id, vision_model)
        anchors = await _anchors_with_qa(
            project_id,
            vision_model,
            image_model,
            scene_plan,
            child_identity,
            adult_identity,
            child_card,
            adult_card,
        )
        video_path, _ = await _video_generation(
            project_id, video_selection, scene_plan, anchors, child_card, adult_card
        )
        await _video_qa(project_id, video_qa_model, video_path)
        await _finalize(project_id)
        _write_diagnostic_package(project_id, _state(project_id))
    except PipelineBlocked as exc:
        state = _state(project_id)
        if state.get("status") == "processing":
            state["status"] = "blocked"
        add_diag(state, "warning", "Pipeline blocked", {"reason": str(exc), "stage": state.get("current_stage")})
        _save(project_id, state)
        _write_diagnostic_package(project_id, state, exc)
    except Exception as exc:
        state = _state(project_id)
        state["status"] = "failed"
        stage = state.get("current_stage")
        if stage and stage in state.get("stages", {}):
            set_stage(state, stage, "failed", message=str(exc))
        add_diag(state, "error", "Pipeline crashed", {"stage": stage, "error": str(exc)})
        _save(project_id, state)
        _write_diagnostic_package(project_id, state, exc)
