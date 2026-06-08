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
from models.annotation import Annotation

db = SessionLocal()
try:
    for tid in [329, 335, 336, 347, 350, 352]:
        t = db.query(Task).filter(Task.id == tid).first()
        if t:
            anns = db.query(Annotation).filter(Annotation.task_id == tid).all()
            subs = db.query(TaskSubmission).filter(TaskSubmission.task_id == tid).all()
            print(f"Task ID {tid}: status={t.status}")
            print(f"  Annotation count in DB: {len(anns)}")
            print(f"  Submission history:")
            for s in subs:
                print(f"    - Action: {s.action}, Created At: {s.created_at}")
finally:
    db.close()
