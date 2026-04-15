from sqlalchemy import Column, Integer, Unicode, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

class Scene(Base):
    __tablename__ = "scenes"
    __table_args__ = (UniqueConstraint("project_id", "scene_token"),)

    id          = Column(Integer, primary_key=True, index=True)
    project_id  = Column(Integer, ForeignKey("projects.id"), nullable=False)
    scene_token = Column(Unicode(100), nullable=False)
    name        = Column(Unicode(100), nullable=True)       # e.g. "scene-0061"
    description = Column(Unicode(500), nullable=True)
    frame_count = Column(Integer, default=0)

    frames  = relationship("Frame", back_populates="scene")
    project = relationship("Project")
