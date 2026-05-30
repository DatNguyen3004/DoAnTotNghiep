"""Migration: Them cot image_url, is_deleted va cap nhat message nullable cho bang chat_messages."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

queries = [
    ("ALTER TABLE chat_messages ADD image_url NVARCHAR(1000) NULL", "image_url"),
    ("ALTER TABLE chat_messages ADD is_deleted BIT NOT NULL DEFAULT 0", "is_deleted"),
    ("ALTER TABLE chat_messages ALTER COLUMN message NVARCHAR(MAX) NULL", "message nullable")
]

with engine.connect() as conn:
    for sql, name in queries:
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"[OK] Added/Updated column: {name}")
        except Exception as e:
            if "already" in str(e).lower() or "duplicate column" in str(e).lower() or "Column names in each table must be unique" in str(e).lower():
                print(f"[SKIP] Column already exists: {name}")
            else:
                print(f"[ERROR] Failed to run {name}: {e}")
