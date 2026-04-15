from sqlalchemy import Column, Integer, Unicode, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Project(Base):
    __tablename__ = "projects"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(Unicode(200), nullable=False)
    description  = Column(Unicode(4000), nullable=True)
    cover_image  = Column(Unicode(500), nullable=True)  # đường dẫn ảnh bìa
    created_by   = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at   = Column(DateTime, server_default=func.now())
    is_active    = Column(Boolean, default=True)

    creator  = relationship("User", foreign_keys=[created_by])
    members  = relationship("ProjectMember", back_populates="project")


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id = Column(Integer, ForeignKey("projects.id"), primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"), primary_key=True)
    joined_at  = Column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="members")
    user    = relationship("User")
