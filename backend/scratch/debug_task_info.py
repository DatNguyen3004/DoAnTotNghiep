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
from models.scene import Scene
from models.frame import Frame
from models.annotation import Annotation

db = SessionLocal()
try:
    task = db.query(Task).filter(Task.id == 317).first()
    if task:
        scene = db.query(Scene).filter(Scene.id == task.scene_id).first()
        frames = db.query(Frame).filter(Frame.scene_id == task.scene_id).all()
        anns = db.query(Annotation).filter(Annotation.task_id == task.id).all()
        print(f"Task 317: assigned_to={task.assigned_to}, status={task.status}, is_deleted={task.is_deleted}")
        print(f"Scene: {scene.name if scene else 'None'}, description={scene.description if scene else 'None'}")
        print(f"Frame count: {len(frames)}")
        print(f"Annotation count: {len(anns)}")
    else:
        print("Task 317 not found")
finally:
    db.close()
