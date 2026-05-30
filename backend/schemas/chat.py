from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ChatMessageCreate(BaseModel):
    recipient_id: Optional[int] = None
    message: str

class ChatMessageOut(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    sender_full_name: Optional[str] = None
    sender_role: str
    sender_avatar_url: Optional[str] = None
    recipient_id: Optional[int] = None
    recipient_username: Optional[str] = None
    message: str
    created_at: datetime

    class Config:
        from_attributes = True

class ChatUserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
