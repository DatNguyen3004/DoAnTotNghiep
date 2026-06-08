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
from routers.tasks import get_task_precision_details

db = SessionLocal()
try:
    for tid in [329, 335, 336, 347, 350, 352]:
        t = db.query(Task).filter(Task.id == tid).first()
        if t:
            try:
                res = get_task_precision_details(db, t.id, t.scene_id)
                print(f"Task ID {tid}: success, precision={res['precision']}")
            except Exception as e:
                import traceback
                print(f"Task ID {tid}: failed with exception:")
                traceback.print_exc()
finally:
    db.close()
