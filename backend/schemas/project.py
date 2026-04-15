from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    created_by: int
    created_at: Optional[datetime] = None
    scene_count: int = 0

    class Config:
        from_attributes = True

class MemberAdd(BaseModel):
    user_id: int
