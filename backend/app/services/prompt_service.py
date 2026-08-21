import json
from pathlib import Path

ERA_PRESET_ROOT = Path("presets/eras")
LAYOUT_PRESET_PATH = Path("presets/layout_preset.json")


def _load_json(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def build_image_prompt(state: dict, decade: str) -> str:
    person = state["person"]
    era = _load_json(ERA_PRESET_ROOT / f"{decade}.json")
    notes = person.get("notes") or ""
    return f"""
Use the two provided photos as identity references for the same person.

Goal:
Create a highly realistic portrait scene of this same person reinterpreted for the {decade} school era.

Requirements:
- Preserve the same facial identity across all outputs.
- Do not create a different person.
- Keep recognisable bone structure, eyes, nose, smile, and face proportions.
- Show an authentic school-related atmosphere appropriate for the {decade}.
- Adapt hairstyle, clothing, background details, color science, and photo texture to the decade.
- The image must feel like part of one coherent archival series.
- Cinematic, premium, respectful tone.
- Leave a clean safe area in the upper part of the frame for a future text overlay.
- Do not render any text inside the image.

Metadata:
Surname: {person['surname']}
Name: {person['name']}
Position: {person['position']}
School years: {person['school_years']}
Notes: {notes}
Era guidance: {json.dumps(era, ensure_ascii=False)}
""".strip()


def build_video_prompt(state: dict) -> str:
    person = state["person"]
    layout = _load_json(LAYOUT_PRESET_PATH)
    return f"""
Create a short cinematic video based on two key identity images of the same person:
one as a school-age version and one as the adult present-day version.

Scene:
The school-age version stands in a school environment.
The adult present-day version gently approaches.
They look at each other with warmth and recognition.

Style:
Emotional, respectful, cinematic, realistic.
Subtle camera motion.
Natural body movement.
No exaggerated morphing.
No surreal transformations.
Warm back-to-school atmosphere.
Soft September light.
Archival memory feeling blended with present-day realism.

Identity:
Surname: {person['surname']}
Name: {person['name']}
Position: {person['position']}
School years: {person['school_years']}
Layout standard: {json.dumps(layout, ensure_ascii=False)}
""".strip()
