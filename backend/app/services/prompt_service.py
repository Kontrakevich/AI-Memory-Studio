import json
from pathlib import Path

ERA_PRESET_ROOT = Path("presets/eras")
VIDEO_PRESET_ROOT = Path("presets/video")
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


def build_video_prompt(state: dict, preset_id: str = "WALK_TO_YOUNGER_SELF") -> str:
    person = state["person"]
    layout = _load_json(LAYOUT_PRESET_PATH)
    preset = _load_json(VIDEO_PRESET_ROOT / f"{preset_id}.json")
    if not preset:
        preset = _load_json(VIDEO_PRESET_ROOT / "WALK_TO_YOUNGER_SELF.json")
        preset_id = "WALK_TO_YOUNGER_SELF"

    return f"""
Create a short cinematic video from the supplied master reference frame. The two visible characters are the SAME REAL PERSON at two different ages: school-age and present-day adult.

PRIMARY DIRECTING PRESET: {preset_id}
{json.dumps(preset, ensure_ascii=False, indent=2)}

Non-negotiable identity rules:
- Preserve both facial identities exactly as established in the master frame.
- Keep the child and adult as clearly different ages of the same person.
- Never morph one body into the other.
- Never merge faces, clothing or limbs.
- No duplicated people, no extra fingers or limbs, no age blending.

Performance direction:
- The younger version behaves naturally and remains grounded in the school environment.
- The adult approaches calmly; movement is emotionally readable but restrained.
- Recognition should be conveyed through eye contact, a subtle expression change, and body language rather than melodrama.
- No hug unless explicitly requested by the preset.
- No dialogue or lip-sync unless explicitly requested.

Visual direction:
- Authentic Russian school atmosphere consistent with the person's school years ({person['school_years']}).
- Premium cinematic realism, documentary credibility, gentle September daylight.
- Natural 35–50mm lens language.
- Subtle camera movement only.
- Keep faces fully visible and uncropped.
- Maintain a visually quiet upper safe-zone for deterministic post-render typography.
- Do not generate any text or logos inside the video.

Identity metadata:
Surname: {person['surname']}
Name: {person['name']}
Position: {person['position']}
School years: {person['school_years']}
Layout standard: {json.dumps(layout, ensure_ascii=False)}
""".strip()
