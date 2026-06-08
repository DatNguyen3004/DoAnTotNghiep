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
    tasks = db.query(Task).order_by(Task.updated_at.desc()).all()
    print("TASKS ORDERED BY UPDATED_AT DESC:")
    for t in tasks:
        print(f"Task ID: {t.id}, ProjectID: {t.project_id}, Status: {t.status}, Updated At: {t.updated_at}, is_deleted: {t.is_deleted}")
finally:
    db.close()
