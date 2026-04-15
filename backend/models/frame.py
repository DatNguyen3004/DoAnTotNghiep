from sqlalchemy import Column, Integer, BigInteger, Unicode, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

class Frame(Base):
    __tablename__ = "frames"
    __table_args__ = (UniqueConstraint("scene_id", "frame_index"),)

    id              = Column(Integer, primary_key=True, index=True)
    scene_id        = Column(Integer, ForeignKey("scenes.id"), nullable=False)
    frame_index     = Column(Integer, nullable=False)
    timestamp       = Column(BigInteger, nullable=True)
    cam_front       = Column(Unicode(500), nullable=True)
    cam_front_left  = Column(Unicode(500), nullable=True)
    cam_front_right = Column(Unicode(500), nullable=True)
    cam_back        = Column(Unicode(500), nullable=True)
    cam_back_left   = Column(Unicode(500), nullable=True)
    cam_back_right  = Column(Unicode(500), nullable=True)

    scene = relationship("Scene", back_populates="frames")
