from sqlalchemy import Column, Integer, Unicode, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Task(Base):
    __tablename__ = "tasks"

    id          = Column(Integer, primary_key=True, index=True)
    project_id  = Column(Integer, ForeignKey("projects.id"), nullable=False)
    scene_id    = Column(Integer, ForeignKey("scenes.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status      = Column(Unicode(20), nullable=False, default="pending")
    feedback    = Column(Unicode(4000), nullable=True)
    time_spent          = Column(Integer, default=0)       # seconds — labeler total
    reviewer_time_spent = Column(Integer, default=0)       # seconds — reviewer total
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project  = relationship("Project")
    scene    = relationship("Scene")
    assignee = relationship("User", foreign_keys=[assigned_to])
    reviewer = relationship("User", foreign_keys=[reviewer_id])
