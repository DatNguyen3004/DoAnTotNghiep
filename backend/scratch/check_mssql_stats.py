import pymssql

# Database config
DB_SERVER = "localhost"
DB_NAME = "nulabel"
DB_USER = "sa"
DB_PASSWORD = "12345678"

try:
    conn = pymssql.connect(server=DB_SERVER, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)
    cursor = conn.cursor()
    
    print("--- DETAILED TASK & PROJECT CHECK ---")
    query = "SELECT id, project_id, status, time_spent FROM tasks"
    cursor.execute(query)
    rows = cursor.fetchall()
    
    for row in rows:
        print(f"Task ID: {row[0]} | Project ID: {row[1]} | Status: {row[2]} | Time: {row[3]}s")
    
    conn.close()
except Exception as e:
    print(f"DB Error: {e}")
