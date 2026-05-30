"""Migration: Them cot general_chat_cleared_at cho bang users."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

sql = "ALTER TABLE users ADD general_chat_cleared_at DATETIME NULL"

with engine.connect() as conn:
    try:
        conn.execute(text(sql))
        conn.commit()
        print("[OK] Added column: general_chat_cleared_at to users table")
    except Exception as e:
        if "already" in str(e).lower() or "duplicate column" in str(e).lower() or "Column names in each table must be unique" in str(e).lower():
            print("[SKIP] Column general_chat_cleared_at already exists in users table")
        else:
            print(f"[ERROR] Failed to run: {e}")
