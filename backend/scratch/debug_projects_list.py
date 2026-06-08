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
from models.project import Project

db = SessionLocal()
try:
    projects = db.query(Project).all()
    for p in projects:
        print(f"Project ID: {p.id}")
finally:
    db.close()
