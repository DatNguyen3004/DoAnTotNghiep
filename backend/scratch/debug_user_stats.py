import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models.user import User
from models.task import Task
from routers.tasks import calculate_task_user_precision

db = SessionLocal()
try:
    print("USERS:", flush=True)
    users = db.query(User).all()
    for u in users:
        print(f"ID: {u.id}, Username: {u.username}, Role: {u.role}", flush=True)

    print("\nTASKS:", flush=True)
    tasks = db.query(Task).all()
    for t in tasks:
        print(f"Checking task ID: {t.id}, status: {t.status}, is_deleted: {t.is_deleted}", flush=True)
        precision = None
        if t.status in ('approved', 'rejected', 'reviewed'):
            try:
                # Print message indicating we are starting calculation
                print(f"  Calculating precision for task {t.id}...", end="", flush=True)
                precision = calculate_task_user_precision(db, t.id, t.scene_id)
                print(f" Done. Precision: {precision}", flush=True)
            except Exception as e:
                precision = f"Error: {e}"
                print(f" Error: {e}", flush=True)
        else:
            print(f"  Skipped calculation. Status not in ('approved', 'rejected', 'reviewed').", flush=True)
finally:
    db.close()
