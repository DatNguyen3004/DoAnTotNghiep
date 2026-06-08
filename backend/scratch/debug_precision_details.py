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
from routers.tasks import calculate_task_user_precision

db = SessionLocal()
try:
    for tid in [329, 335, 336, 347, 350, 352]:
        t = db.query(Task).filter(Task.id == tid).first()
        if t:
            try:
                prec = calculate_task_user_precision(db, t.id, t.scene_id)
                print(f"Task ID {t.id}: Status={t.status}, Precision={prec}")
            except Exception as e:
                print(f"Task ID {t.id}: Error={e}")
finally:
    db.close()
