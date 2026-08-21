import httpx
from ..settings import settings


async def chat(prompt: str, model: str = "openai/gpt-5") -> dict:
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "OPENROUTER_API_KEY is empty"}
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        return {"ok": r.is_success, "status_code": r.status_code, "data": r.json()}
