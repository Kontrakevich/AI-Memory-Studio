from __future__ import annotations

import json
from typing import Any


def source_qa_prompt(labels: list[str]) -> str:
    return f"""You are the SOURCE QA gate for an identity-preserving memory-film pipeline.
The attached images are labeled, in order: {', '.join(labels)}.
Return STRICT JSON only.
Do not infer age, gender, ethnicity, health, personality or attractiveness.
For every image judge only technical usefulness for identity reconstruction.
Schema:
{{
  "images": [{{
    "label": "...",
    "status": "PASS|REVIEW|FAIL",
    "face_visibility": "HIGH|MEDIUM|LOW",
    "face_resolution": "HIGH|MEDIUM|LOW",
    "focus": "HIGH|MEDIUM|LOW",
    "occlusion": "HIGH|MEDIUM|LOW",
    "perspective_distortion": "HIGH|MEDIUM|LOW",
    "expression_distortion": "HIGH|MEDIUM|LOW",
    "lighting_reliability": "HIGH|MEDIUM|LOW",
    "color_reliability": "HIGH|MEDIUM|LOW",
    "hair_visibility": "HIGH|MEDIUM|LOW",
    "body_visibility": "HIGH|MEDIUM|LOW",
    "wardrobe_visibility": "HIGH|MEDIUM|LOW",
    "notes": ["..."]
  }}],
  "period_status": "PASS|REVIEW|FAIL",
  "request_better_photo": false,
  "request_message": ""
}}
A source is FAIL only when it is genuinely unusable. Do not invent missing evidence."""


IDENTITY_ANALYZER_CORE = """You are a high-precision facial-geometry, identity-feature, hair and wardrobe analyst.
SOURCE IMAGES are the only authority. Do not infer age, gender, sex, ethnicity, attractiveness, personality or emotion.
Analyze all supplied approved views as observations of ONE fixed person for this time-period.

ABSOLUTE SOURCE RULES:
- Do not invent anatomy, asymmetry, skin marks, scars, moles, freckles, pigmentation, birthmarks, wardrobe details, footwear or accessories.
- If a feature is unsupported, use UNKNOWN or an empty value.
- Never turn shadows, JPEG artifacts, blur, reflections, dust, scanning damage or color casts into identity features.
- Preserve anatomical LEFT/RIGHT relative to the person, never the viewer.
- Natural asymmetry is identity data and must not be symmetrized.
- Use normalized ratios, not invented millimeters.

FACE GEOMETRY: reconstruct source-supported head/face proportions, forehead, temples, eyes, brows, nose, midface, mouth, jaw/chin, ears and profile. Separate camera/lens/expression distortion from anatomy.
PROFILE: if true profile evidence is weak, set PROFILE_CONFIDENCE=LOW and keep unsupported Z/depth values UNKNOWN.
MARKS: a mark is CONFIRMED only when visibly source-supported. A confirmed mark must retain side, anatomical position, relative size, shape, color character and confidence. No source evidence = no mark.
HAIR: record hairline, parting, type, texture, density, length, volume, growth direction, fringe and source-derived color where reliable.
WARDROBE: record only visible garments, fit, construction, material class if supported, color after conceptual WB normalization, pattern, collar/lapel/buttons/pockets/seams, footwear and accessories. Do not complete a missing outfit with generic clothing.

Return STRICT JSON only using this schema:
{
  "face_geometry": {
    "head_shape": "...|UNKNOWN",
    "face_shape": "...|UNKNOWN",
    "normalized_ratios": {},
    "landmarks": {},
    "eyes": {},
    "brows": {},
    "nose": {},
    "midface": {},
    "mouth": {},
    "jaw_chin": {},
    "ears": {},
    "profile": {"confidence":"HIGH|MEDIUM|LOW", "data":{}},
    "distortion_notes": []
  },
  "natural_asymmetries": [],
  "distinctive_marks": [{
    "type":"...",
    "side":"LEFT|RIGHT|CENTER",
    "anatomical_region":"...",
    "normalized_position":"...",
    "relative_size":"...",
    "shape":"...",
    "color_character":"...",
    "relief":"FLAT|RAISED|UNKNOWN",
    "confidence":"HIGH|MEDIUM|LOW",
    "source_labels":[]
  }],
  "uncertain_marks": [],
  "hair": {},
  "wardrobe": {
    "components": [],
    "fit": {},
    "construction": {},
    "materials": {},
    "colors": {},
    "patterns": {},
    "footwear": {},
    "accessories": {}
  },
  "identity_critical_features": [],
  "anti_drift_rules": [],
  "confidence_notes": []
}
"""


def identity_analysis_prompt(period_name: str, labels: list[str]) -> str:
    return f"""{IDENTITY_ANALYZER_CORE}

PERIOD_ROLE: {period_name}
SOURCE_LABELS: {', '.join(labels)}
The output describes ONLY this period's source-supported identity state."""


def cross_age_lock_prompt(child_identity: dict[str, Any], adult_identity: dict[str, Any]) -> str:
    child = json.dumps(child_identity, ensure_ascii=False)
    adult = json.dumps(adult_identity, ensure_ascii=False)
    return f"""You are the longitudinal identity-lock reconciler.
Two analyses describe the SAME real person at two different time-periods.
Do not average the two faces and do not transfer period-specific morphology between them.
CHILD/PREVIOUS PERIOD geometry controls only that period. CURRENT PERIOD geometry controls only that period.
The only cross-period transfer allowed is confirmation of clearly persistent identity-specific features when evidence is compatible.
Never invent a mark. Never transfer a mark whose time of appearance is uncertain.
Return STRICT JSON only.

CHILD_PERIOD_ANALYSIS:
{child}

CURRENT_PERIOD_ANALYSIS:
{adult}

Schema:
{{
  "persistent_identity_signatures": [],
  "persistent_marks_confirmed": [],
  "child_lock": {{"must_preserve": [], "must_not_import_from_current": []}},
  "adult_lock": {{"must_preserve": [], "must_not_import_from_child": []}},
  "cross_age_conflicts": [],
  "global_rules": [
    "NO FACE AVERAGING",
    "NO INVENTED FACIAL MARKS",
    "PERIOD-SPECIFIC GEOMETRY REMAINS PERIOD-SPECIFIC"
  ]
}}"""


def character_card_prompt(
    *,
    period_role: str,
    identity: dict[str, Any],
    cross_lock: dict[str, Any],
    age_offset: int = 0,
) -> str:
    age_instruction = (
        "Preserve the source apparent maturity exactly; no age transformation."
        if age_offset == 0
        else f"Apply only a subtle, anatomically plausible visual age offset of {age_offset:+d} years to age-dependent morphology; stable identity geometry remains locked."
    )
    return f"""Create ONE SINGLE COMPLETE PHOTOREALISTIC TECHNICAL CHARACTER REFERENCE CARD SHEET.
PERIOD ROLE: {period_role}.
This sheet must represent the exact same source person for this period, not a look-alike.
{age_instruction}

IDENTITY LOCK:
{json.dumps(identity, ensure_ascii=False)}

CROSS-PERIOD LOCK:
{json.dumps(cross_lock, ensure_ascii=False)}

ABSOLUTE IDENTITY RULES:
- Reproduce source-supported facial geometry. Do not beautify, idealize, symmetrize or redesign.
- FRONT, 3/4 and PROFILE are projections of ONE fixed canonical 3D head, not independently invented faces.
- VIEW 04 is VIEW 01 magnified/recropped only. VIEW 05 is VIEW 03 magnified/recropped only.
- Preserve eye spacing, nose axis/construction, mouth width, jaw/chin relationships, ears, hairline and natural asymmetry.
- Every confirmed facial mark from the source must be reproduced whenever its anatomical surface is visible.
- Never invent moles, freckles, scars, birthmarks, pigmentation, redness or other identity marks.
- Unknown evidence stays unknown; do not fill it with generic realism.

WARDROBE RULES:
- Use ONE coherent source-supported outfit for this period.
- Preserve source-supported garment silhouette, fit, color, material response, pattern, collar/lapel, buttons, pockets, seams, footwear and accessories.
- Do not invent hidden distinctive construction. Do not modernize or beautify.

REQUIRED ONE-SHEET LAYOUT:
01 SMALL FRONTAL PORTRAIT
02 SMALL THREE-QUARTER PORTRAIT
03 SMALL TRUE SIDE PROFILE
04 LARGE FRONTAL IDENTITY PORTRAIT
05 LARGE TRUE SIDE PROFILE
06 HEADLESS FULL-LENGTH FRONT BODY
07 HEADLESS FULL-LENGTH REAR / REAR-3/4 BODY
Optional compact wardrobe detail studies ONLY for source-supported details.

HEADLESS BODY RULE:
Views 06/07 begin at the base of the neck and include shoulders, torso, arms, hands, waist, hips, legs, feet, wardrobe and footwear. No head, face, hair, ears, jaw or placeholder head.

STUDIO LOCK:
One clean mid-light neutral gray background, one fixed soft technical lighting setup, one exposure, one white balance, one tonal response and one restrained photographic color pipeline across the whole sheet. The subject rotates; the studio does not.

FINAL OUTPUT: ONE unified character-card canvas, not separate images and not a collage of incompatible identities."""


def character_card_qa_prompt(period_role: str, identity: dict[str, Any]) -> str:
    return f"""You are a strict character-card QA judge.
Compare the supplied source reference images and the generated {period_role} character-card sheet.
Return STRICT JSON only. Do not infer age/gender/ethnicity.
Reject invented marks, identity drift, changed nose/eyes/jaw/chin, profile mismatch, changed asymmetry, changed hair, unsupported wardrobe, inconsistent outfit, non-headless body views, or multiple different identities.
IDENTITY LOCK: {json.dumps(identity, ensure_ascii=False)}
Schema:
{{
  "status":"PASS|FAIL",
  "identity_score":0,
  "geometry_score":0,
  "marks_score":0,
  "hair_score":0,
  "wardrobe_score":0,
  "cross_view_score":0,
  "failures":[],
  "repair_instructions":[]
}}
Scores are 0-100. PASS requires no critical identity failure and identity_score>=85 and geometry_score>=85."""


def scene_plan_prompt(meta: dict[str, Any]) -> str:
    return f"""You are the emotional director for a photorealistic memory film about one person meeting their earlier self.
Return STRICT JSON only. Keep the scene wholesome, restrained, non-romantic and emotionally credible.
Preset: {meta.get('scene_preset', 'SCHOOL_CLASSROOM')}.
Target aspect ratio: {meta.get('aspect_ratio', '9:16')}.
Memory note: {meta.get('memory_note') or 'none'}.

For the SCHOOL_CLASSROOM preset use one continuous physical location, one camera, no morphing, no teleportation, no duplicate characters and no hidden cuts.
Canonical beats:
1 earlier-self alone;
2 notices movement from screen-right;
3 present-self physically walks in from screen-right;
4 recognition;
5 present-self stands beside earlier-self with a warm supportive gesture;
6 both face camera with natural restrained smiles.

Schema:
{{
  "scene":{{"environment":"...","lighting":"...","camera":"...","lens":"...","composition":"..."}},
  "beats":[],
  "start_frame":"...",
  "meeting_frame":"...",
  "end_frame":"...",
  "motion_rules":[],
  "identity_rules":[],
  "negative_rules":[]
}}"""


def anchor_prompt(kind: str, scene_plan: dict[str, Any], child_lock: dict[str, Any], adult_lock: dict[str, Any]) -> str:
    descriptions = {
        "start": "Earlier-self alone in the locked scene. Present-self is not visible.",
        "meeting": "Both versions are visible and clearly recognizable as the same person from two time-periods, with physical separation and believable floor contact.",
        "end": "Both versions stand naturally side-by-side, present-self visibly taller when source/body evidence supports it, both facing the camera with restrained natural smiles.",
    }
    return f"""Generate one photorealistic {kind.upper()} anchor frame for the locked memory-film scene.
ANCHOR REQUIREMENT: {descriptions[kind]}
SCENE PLAN: {json.dumps(scene_plan, ensure_ascii=False)}
EARLIER-SELF IDENTITY LOCK: {json.dumps(child_lock, ensure_ascii=False)}
PRESENT-SELF IDENTITY LOCK: {json.dumps(adult_lock, ensure_ascii=False)}

ABSOLUTE RULES:
- exactly the required characters; no duplicates;
- each face must match its own period identity, not an average;
- preserve confirmed source marks; invent none;
- preserve hair and wardrobe for each period;
- one physical camera, fixed perspective, coherent scene geometry;
- no morph, portal, fantasy effect, split-screen, text, logos or cinematic gimmicks;
- natural anatomy, hands, floor contact and scale;
- premium live-action photographic realism."""


def anchor_qa_prompt(kind: str) -> str:
    return f"""You are the strict QA judge for the generated {kind} anchor.
Compare all supplied source references, character cards and the anchor.
Return STRICT JSON only.
Check: exact identity of both period versions, no face blending, facial marks source-only, hair, wardrobe, body scale, camera, scene consistency, required character count, anatomy and composition.
Schema: {{"status":"PASS|FAIL","identity_score":0,"scene_score":0,"composition_score":0,"failures":[],"repair_instructions":[]}}.
PASS requires identity_score>=85 and no critical identity/camera/character-count error."""


def video_prompt(scene_plan: dict[str, Any]) -> str:
    return f"""Create one continuous photorealistic live-action shot of a person meeting their earlier self.
SCENE PLAN: {json.dumps(scene_plan, ensure_ascii=False)}

MOTION:
- Begin exactly from the approved first frame.
- Earlier-self is already present and remains the same identity throughout.
- Present-self physically enters from screen-right; no teleportation or morph.
- Recognition unfolds naturally through eyes, head and body orientation.
- Present-self moves beside earlier-self; use a warm supportive, family-safe gesture without obscuring either face.
- Finish naturally at the approved end-frame composition.

CAMERA:
one physical camera, eye-level, no cuts, no hidden cuts, no lens jump, no whip-pan replacement. Only subtle physically plausible pan/track if necessary.

IDENTITY PRIORITY:
identity > motion complexity > cinematic style. If motion threatens identity, simplify motion.
No face reset after occlusion, no generic face interpolation, no age blending, no duplicate bodies, no wardrobe changes, no scene redesign.
Premium natural cinematic realism, restrained emotion, no text or logos."""


def final_video_qa_prompt() -> str:
    return """You are the final QA judge for an identity-preserving memory film.
Use all supplied source photos, character cards, anchor frames and the generated video/frame samples as evidence.
Return STRICT JSON only.
Check identity drift for both versions, face reset after occlusion, child/current blending, source-confirmed marks, hair, wardrobe, body/anatomy, duplicates, morph/teleport, camera jump, scene drift, action order and final composition.
Schema:
{
  "status":"PASS|FAIL",
  "identity_score":0,
  "motion_score":0,
  "camera_score":0,
  "scene_score":0,
  "story_score":0,
  "failures":[],
  "repair_scope":"NONE|VIDEO_ONLY|ANCHOR_AND_VIDEO|IDENTITY_AND_DOWNSTREAM",
  "repair_instructions":[]
}
PASS requires identity_score>=85 and no critical morph, duplicate, face-reset or camera-jump failure."""
