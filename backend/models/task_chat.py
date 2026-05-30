from sqlalchemy import Column, Integer, UnicodeText, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class TaskChat(Base):
    __tablename__ = "task_chats"

    id          = Column(Integer, primary_key=True, index=True)
    task_id     = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    sender_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    message     = Column(UnicodeText, nullable=False)
    created_at  = Column(DateTime, server_default=func.now())

    task   = relationship("Task")
    sender = relationship("User")
