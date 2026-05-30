"""
Migration: Tạo bảng chat_messages để lưu tin nhắn chat toàn hệ thống (chung và riêng).
Chạy: python scripts/migrate_add_chat_messages.py (từ thư mục backend/)
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
import models.task_chat     # noqa
import models.chat_message  # noqa — bảng mới

def migrate():
    print("Creating table chat_messages (if not exists)...")
    Base.metadata.create_all(bind=engine)
    print("Done! Table chat_messages is ready.")

if __name__ == "__main__":
    migrate()
