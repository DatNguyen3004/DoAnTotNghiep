from sqlalchemy import Column, Integer, Unicode, Boolean, DateTime
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(Unicode(50), unique=True, nullable=False)
    email         = Column(Unicode(100), unique=True, nullable=True)
    password_hash = Column(Unicode(255), nullable=False)
    role          = Column(Unicode(10), nullable=False)
    full_name     = Column(Unicode(100), nullable=True)
    phone         = Column(Unicode(20), nullable=True)
    address       = Column(Unicode(300), nullable=True)
    gender        = Column(Unicode(10), nullable=True)
    birth_date    = Column(Unicode(20), nullable=True)
    avatar_url    = Column(Unicode(500), nullable=True)
    reset_token   = Column(Unicode(255), nullable=True)
    reset_expires = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, server_default=func.now())
    is_active     = Column(Boolean, default=True)
