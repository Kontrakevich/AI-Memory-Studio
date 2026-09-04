from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


StageStatus = Literal["pending", "running", "passed", "failed", "blocked", "skipped"]


class MemoryProjectMeta(BaseModel):
    title: str = "Моя встреча с собой"
    person_name: Optional[str] = None
    memory_note: Optional[str] = None
    scene_preset: str = "SCHOOL_CLASSROOM"
    aspect_ratio: str = "9:16"
    duration: int = 8
    resolution: str = "720p"
    generate_audio: bool = False
    child_age_offset: int = 0
    adult_age_offset: int = 0


class PipelineStartRequest(BaseModel):
    project_id: str
    force_restart: bool = False
    vision_model: Optional[str] = None
    image_model: Optional[str] = None
    video_model: Optional[str] = None


class StageRecord(BaseModel):
    name: str
    status: StageStatus = "pending"
    attempt: int = 0
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    model: Optional[str] = None
    message: Optional[str] = None
    qa: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)


class ProjectStateV3(BaseModel):
    id: str
    version: str = "3.0"
    meta: MemoryProjectMeta
    status: str = "created"
    current_stage: str = "created"
    assets: Dict[str, Any] = Field(default_factory=dict)
    identity: Dict[str, Any] = Field(default_factory=dict)
    stages: Dict[str, StageRecord] = Field(default_factory=dict)
    model_selection: Dict[str, Any] = Field(default_factory=dict)
    diagnostics: List[Dict[str, Any]] = Field(default_factory=list)


PIPELINE_STAGES = [
    "source_qa",
    "identity_analysis",
    "identity_lock",
    "character_cards",
    "character_cards_qa",
    "scene_plan",
    "anchor_frames",
    "anchor_frames_qa",
    "video_generation",
    "video_qa",
    "finalize",
]
