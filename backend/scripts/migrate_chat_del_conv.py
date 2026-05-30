"""Migration: Them cot deleted_by_sender va deleted_by_recipient cho bang chat_messages."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

queries = [
    ("ALTER TABLE chat_messages ADD deleted_by_sender BIT NOT NULL DEFAULT 0", "deleted_by_sender"),
    ("ALTER TABLE chat_messages ADD deleted_by_recipient BIT NOT NULL DEFAULT 0", "deleted_by_recipient")
]

with engine.connect() as conn:
    for sql, name in queries:
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"[OK] Added column: {name}")
        except Exception as e:
            if "already" in str(e).lower() or "duplicate column" in str(e).lower() or "Column names in each table must be unique" in str(e).lower():
                print(f"[SKIP] Column already exists: {name}")
            else:
                print(f"[ERROR] Failed to run {name}: {e}")
