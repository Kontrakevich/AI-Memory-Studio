import httpx
from ..settings import settings


async def submit_video_job(payload: dict) -> dict:
    if not settings.seedance_api_key:
        return {"ok": False, "error": "SEEDANCE_API_KEY is empty"}
    headers = {
        "Authorization": f"Bearer {settings.seedance_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        # Replace with exact endpoint used in your account / provider gateway.
        r = await client.post("https://api.seedance2.ai/v1/videos", headers=headers, json=payload)
        try:
            data = r.json()
        except Exception:
            data = {"text": r.text}
        return {"ok": r.is_success, "status_code": r.status_code, "data": data}
