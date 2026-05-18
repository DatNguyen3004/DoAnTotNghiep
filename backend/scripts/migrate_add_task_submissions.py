"""
Migration: Tạo bảng task_submissions để lưu lịch sử nộp/từ chối/phê duyệt task.
Chạy: python scripts/migrate_add_task_submissions.py (từ thư mục backend/)
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
import models.task_submission  # noqa — bảng mới

def migrate():
    print("Tạo bảng task_submissions (nếu chưa tồn tại)...")
    Base.metadata.create_all(bind=engine)
    print("Xong! Bảng task_submissions đã sẵn sàng.")

if __name__ == "__main__":
    migrate()
