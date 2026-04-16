from sqlalchemy import Column, Integer, Float, Unicode, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class Annotation(Base):
    __tablename__ = "annotations"

    id              = Column(Integer, primary_key=True, index=True)
    task_id         = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    frame_id        = Column(Integer, ForeignKey("frames.id"), nullable=False)
    camera          = Column(Unicode(30), nullable=False)
    category        = Column(Unicode(50), nullable=False)
    # Normalized coordinates (0.0 - 1.0)
    bbox_x          = Column(Float, nullable=False)
    bbox_y          = Column(Float, nullable=False)
    bbox_w          = Column(Float, nullable=False)
    bbox_h          = Column(Float, nullable=False)
    confidence      = Column(Float, nullable=True)        # NULL = manual, 0-1 = AI
    is_ai_generated = Column(Boolean, default=False)
    needs_review    = Column(Boolean, default=False)
    track_id        = Column(Integer, nullable=True)
    custom_name     = Column(Unicode(200), nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now())
