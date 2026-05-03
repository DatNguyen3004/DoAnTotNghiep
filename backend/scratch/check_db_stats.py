import sqlite3
import os

db_path = "backend/nulabel.db"
if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- KIỂM TRA DỮ LIỆU NHIỆM VỤ (TASKS) ---")
    query = """
    SELECT id, scene_id, assigned_to, status, time_spent, reviewer_time_spent 
    FROM tasks
    """
    try:
        cursor.execute(query)
        rows = cursor.fetchall()
        if not rows:
            print("Không tìm thấy nhiệm vụ nào trong bảng tasks.")
        for row in rows:
            print(f"ID: {row[0]} | Scene: {row[1]} | User: {row[2]} | Status: {row[3]} | Time: {row[4]}s | ReviewTime: {row[5]}s")
    except Exception as e:
        print(f"Lỗi truy vấn: {e}")
    
    conn.close()
