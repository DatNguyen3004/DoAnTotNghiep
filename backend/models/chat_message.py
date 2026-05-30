from sqlalchemy import Column, Integer, UnicodeText, Unicode, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id                   = Column(Integer, primary_key=True, index=True)
    sender_id            = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id         = Column(Integer, ForeignKey("users.id"), nullable=True) # Null for General Group
    message              = Column(UnicodeText, nullable=True)
    image_url            = Column(Unicode(1000), nullable=True)
    is_deleted           = Column(Boolean, default=False, nullable=False) # Single message recalled
    deleted_by_sender    = Column(Boolean, default=False, nullable=False) # Conversation deleted by sender
    deleted_by_recipient = Column(Boolean, default=False, nullable=False) # Conversation deleted by recipient
    created_at           = Column(DateTime, server_default=func.now())

    sender    = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
