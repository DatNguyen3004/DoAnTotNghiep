from sqlalchemy import Column, Integer, Unicode, DateTime, ForeignKey, UnicodeText
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class TaskSubmission(Base):
    """
    Ghi lại lịch sử mỗi lần labeler nộp bài, reviewer từ chối hoặc phê duyệt.
    action: 'submitted' | 'rejected' | 'approved' | 'admin_approved' | 'admin_rejected'
    """
    __tablename__ = "task_submissions"

    id          = Column(Integer, primary_key=True, index=True)
    task_id     = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    action      = Column(Unicode(30), nullable=False)   # submitted / rejected / approved / admin_approved / admin_rejected
    actor_id    = Column(Integer, ForeignKey("users.id"), nullable=True)  # người thực hiện hành động
    feedback    = Column(UnicodeText, nullable=True)     # feedback khi reject (Unicode để hỗ trợ tiếng Việt)
    annotations_snapshot = Column(UnicodeText, nullable=True)  # Snapshot nhãn ở lần nộp đầu tiên (JSON string)
    created_at  = Column(DateTime, server_default=func.now())

    task  = relationship("Task")
    actor = relationship("User", foreign_keys=[actor_id])
