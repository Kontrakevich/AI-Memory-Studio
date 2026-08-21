import httpx
from ..settings import settings


async def submit_image_job(payload: dict) -> dict:
    if not settings.nano_banana_api_key:
        return {"ok": False, "error": "NANO_BANANA_API_KEY is empty"}
    return {"ok": True, "note": "Wire your exact Nano Banana endpoint here", "payload": payload}
