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
        tasks = db.query(Task).filter(Task.assigned_to == u.id).all()
        evaluated = [t for t in tasks if t.status in ('approved', 'rejected', 'reviewed')]
        precisions = []
        for t in evaluated:
            try:
                prec = calculate_task_user_precision(db, t.id, t.scene_id)
                precisions.append((t.id, t.project_id, t.status, prec))
            except Exception as e:
                precisions.append((t.id, t.project_id, t.status, f"Error: {e}"))
        print(f"User: {u.username} (ID: {u.id})")
        print(f"  Evaluated tasks: {precisions}")
        if precisions:
            valid_precs = [p[3] for p in precisions if isinstance(p[3], int)]
            avg = round(sum(valid_precs) / len(valid_precs)) if valid_precs else None
            print(f"  Calculated quality_rate: {avg}%")
finally:
    db.close()
