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

db = SessionLocal()
try:
    tasks = db.query(Task).all()
    for t in tasks:
        assignee = db.query(User).filter(User.id == t.assigned_to).first()
        print(f"Task ID: {t.id}, Assigned To: {assignee.username if assignee else 'None'} (ID: {t.assigned_to}), Status: {t.status}, IsDeleted: {t.is_deleted}")
finally:
    db.close()
