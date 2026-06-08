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
from models.task_submission import TaskSubmission
from routers.tasks import calculate_task_user_precision

db = SessionLocal()
try:
    tasks = db.query(Task).filter(Task.assigned_to == 2, Task.project_id == 1).all()
    print("TASK DETAILS FOR USER 2 IN PROJECT 1:")
    for t in tasks:
        # Check if there is an admin override/submission
        admin_sub = db.query(TaskSubmission).filter(
            TaskSubmission.task_id == t.id,
            TaskSubmission.action.in_(["admin_approved", "admin_rejected"])
        ).first()
        admin_moderated = admin_sub is not None
        
        prec = None
        if t.status in ('approved', 'rejected', 'reviewed'):
            try:
                prec = calculate_task_user_precision(db, t.id, t.scene_id)
            except Exception as e:
                prec = f"Error: {e}"
        print(f"Task ID: {t.id}")
        print(f"  Status: {t.status}")
        print(f"  IsDeleted: {t.is_deleted}")
        print(f"  Admin Moderated: {admin_moderated}")
        print(f"  Precision: {prec}")
finally:
    db.close()
