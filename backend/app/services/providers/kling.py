import httpx
from ..settings import settings


async def submit_video_job(payload: dict) -> dict:
    if not settings.kling_api_key:
        return {"ok": False, "error": "KLING_API_KEY is empty"}
    return {"ok": True, "note": "Wire your exact Kling endpoint here", "payload": payload}
