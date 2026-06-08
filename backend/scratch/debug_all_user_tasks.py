import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models.user
import models.project
import models.scene
import models.frame
import models.annotation
import models.task_submission
from models.task import Task
from models.user import User
from routers.tasks import calculate_task_user_precision

db = SessionLocal()
try:
    users = db.query(User).all()
    for u in users:
        print(f"User: {u.username} (ID: {u.id})")
        tasks = db.query(Task).filter(Task.assigned_to == u.id).all()
        for t in tasks:
            precision = None
            if t.status in ('approved', 'rejected', 'reviewed'):
                try:
                    precision = calculate_task_user_precision(db, t.id, t.scene_id)
                except Exception as e:
                    precision = f"Error: {e}"
            print(f"  Task ID: {t.id}, ProjectID: {t.project_id}, Status: {t.status}, IsDeleted: {t.is_deleted}, Precision: {precision}")
finally:
    db.close()
