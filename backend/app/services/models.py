from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class PersonMeta(BaseModel):
    surname: str
    name: str
    position: str
    school_years: str
    epoch_note: str = "1970s–2020s"
    caption_short: Optional[str] = None
    notes: Optional[str] = None


class ProjectCreate(BaseModel):
    project_name: str
    person: PersonMeta


class TaskRequest(BaseModel):
    project_id: str
    decades: List[str] = Field(default_factory=lambda: ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"])
    image_provider: Optional[str] = None
    video_provider: Optional[str] = None
    render_cards: bool = True
    create_video: bool = True


class ProjectState(BaseModel):
    id: str
    project_name: str
    person: PersonMeta
    status: str
    assets: Dict[str, Any] = Field(default_factory=dict)
    tasks: List[Dict[str, Any]] = Field(default_factory=list)
    diagnostics: List[Dict[str, Any]] = Field(default_factory=list)
