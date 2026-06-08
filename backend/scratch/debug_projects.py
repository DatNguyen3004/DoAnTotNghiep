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
        print(f"Task ID: {t.id}, ProjectID: {t.project_id}, Status: {t.status}")
finally:
    db.close()
