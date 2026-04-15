from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class SceneOut(BaseModel):
    id: int
    project_id: int
    scene_token: str
    name: Optional[str] = None
    description: Optional[str] = None
    frame_count: int = 0

    class Config:
        from_attributes = True


class FrameOut(BaseModel):
    id: int
    scene_id: int
    frame_index: int
    timestamp: Optional[int] = None
    cam_front: Optional[str] = None
    cam_front_left: Optional[str] = None
    cam_front_right: Optional[str] = None
    cam_back: Optional[str] = None
    cam_back_left: Optional[str] = None
    cam_back_right: Optional[str] = None

    class Config:
        from_attributes = True


class FrameMetadata(BaseModel):
    id: int
    scene_id: int
    frame_index: int
    timestamp: Optional[int] = None
    cameras: dict  # {channel: filename_or_null}

    class Config:
        from_attributes = True
