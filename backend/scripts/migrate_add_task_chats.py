"""
Migration: Tạo bảng task_chats để lưu tin nhắn giữa labeler và reviewer.
Chạy: python scripts/migrate_add_task_chats.py (từ thư mục backend/)
"""
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, Base
import models.user          # noqa
import models.project       # noqa
import models.scene         # noqa
import models.frame         # noqa
import models.task          # noqa
import models.annotation    # noqa
import models.task_submission  # noqa
import models.task_chat     # noqa — bảng mới

def migrate():
    print("Creating table task_chats (if not exists)...")
    Base.metadata.create_all(bind=engine)
    print("Done! Table task_chats is ready.")

if __name__ == "__main__":
    migrate()
