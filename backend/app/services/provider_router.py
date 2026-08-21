from datetime import datetime
from .settings import settings


def _task(task_type: str, provider: str, payload: dict) -> dict:
    return {
        "id": datetime.utcnow().strftime("task_%Y%m%d_%H%M%S_%f"),
        "type": task_type,
        "provider": provider,
        "status": "queued",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "payload": payload,
    }


def queue_image_job(project_id: str, decade: str, prompt: str, provider: str | None = None) -> dict:
    provider = provider or settings.default_image_provider
    return _task("image", provider, {
        "project_id": project_id,
        "decade": decade,
        "prompt": prompt,
        "reference_slots": ["child_image", "adult_image"],
        "adapter_note": f"Implement provider adapter for {provider} in providers/*.py",
    })


def queue_video_job(project_id: str, prompt: str, provider: str | None = None) -> dict:
    provider = provider or settings.default_video_provider
    return _task("video", provider, {
        "project_id": project_id,
        "prompt": prompt,
        "reference_slots": ["child_image", "adult_image", "generated_epoch_frames"],
        "adapter_note": f"Implement provider adapter for {provider} in providers/*.py",
    })
