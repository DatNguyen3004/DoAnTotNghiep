"""Migration: thêm cột is_deleted vào bảng tasks."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE tasks ADD is_deleted BIT NOT NULL DEFAULT 0"))
        conn.commit()
        print("Success: Added is_deleted column to tasks table")
    except Exception as e:
        if "already exists" in str(e).lower() or "duplicate column" in str(e).lower() or "Column names in each table must be unique" in str(e).lower():
            print("Warning: is_deleted column already exists, skipping.")
        else:
            print(f"Error: {e}")
