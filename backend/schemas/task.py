from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ─── Task Schemas ───

class TaskCreate(BaseModel):
    project_id: int
    scene_id: int
    assigned_to: int


class TaskUserInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


class TaskOut(BaseModel):
    id: int
    project_id: int
    scene_id: int
    assigned_to: int
    reviewer_id: Optional[int] = None
    status: str
    feedback: Optional[str] = None
    time_spent: int = 0
    reviewer_time_spent: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Enriched fields (populated by router)
    scene_name: Optional[str] = None
    scene_description: Optional[str] = None
    frame_count: int = 0
    annotated_frames: int = 0
    assigned_user: Optional[TaskUserInfo] = None
    reviewer_user: Optional[TaskUserInfo] = None

    class Config:
        from_attributes = True


class TaskStatusUpdate(BaseModel):
    status: str


class TaskSubmit(BaseModel):
    time_spent: Optional[int] = None   # total seconds of labeler work

class ReviewSubmit(BaseModel):
    reviewer_time_spent: Optional[int] = None  # total seconds of reviewer work


class ReviewReject(BaseModel):
    feedback: str


class AdminOverride(BaseModel):
    status: str
    feedback: Optional[str] = None


# ─── Annotation Schemas ───

class AnnotationItem(BaseModel):
    camera: str
    category: str
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    confidence: Optional[float] = None
    is_ai_generated: bool = False
    needs_review: bool = False
    track_id: Optional[int] = None
    custom_name: Optional[str] = None


class AnnotationSave(BaseModel):
    frame_id: int
    annotations: List[AnnotationItem]


class AnnotationOut(BaseModel):
    id: int
    task_id: int
    frame_id: int
    camera: str
    category: str
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    confidence: Optional[float] = None
    is_ai_generated: bool = False
    needs_review: bool = False
    track_id: Optional[int] = None
    custom_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
