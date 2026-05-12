"""Migration: thêm cột reject_count vào bảng tasks."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE tasks ADD reject_count INT NOT NULL DEFAULT 0"))
        conn.commit()
        print("✓ Đã thêm cột reject_count vào bảng tasks")
    except Exception as e:
        if "already exists" in str(e).lower() or "duplicate column" in str(e).lower() or "Column names in each table must be unique" in str(e).lower():
            print("⚠ Cột reject_count đã tồn tại, bỏ qua.")
        else:
            print(f"✗ Lỗi: {e}")
