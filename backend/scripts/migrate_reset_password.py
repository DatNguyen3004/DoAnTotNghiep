"""
Migration: Thêm cột reset_token và reset_expires vào bảng users
Chạy: python scripts/migrate_reset_password.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Kiểm tra cột đã tồn tại chưa
        result = conn.execute(text("""
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token'
        """))
        exists = result.scalar()

        if not exists:
            conn.execute(text("ALTER TABLE users ADD reset_token NVARCHAR(255) NULL"))
            conn.execute(text("ALTER TABLE users ADD reset_expires DATETIME NULL"))
            conn.commit()
            print("✓ Đã thêm cột reset_token và reset_expires")
        else:
            print("✓ Cột đã tồn tại, bỏ qua")

if __name__ == "__main__":
    migrate()
