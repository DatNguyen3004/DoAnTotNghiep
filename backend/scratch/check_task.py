import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from database import SessionLocal
from models.user import User
from models.project import Project
from models.scene import Scene
from models.frame import Frame
from models.annotation import Annotation
from models.task import Task
import config as _cfg

def main():
    print("=== TASK 273 DIAGNOSTICS ===")
    
    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == 273).first()
        if not task:
            print("Task 273 not found in database!")
            return
            
        print(f"Task ID: {task.id}")
        print(f"Project ID: {task.project_id}")
        print(f"Scene ID: {task.scene_id}")
        
        # Get frames for this scene
        frames = db.query(Frame).filter(Frame.scene_id == task.scene_id).order_by(Frame.frame_index).all()
        print(f"Number of frames in scene: {len(frames)}")
        
        if len(frames) > 0:
            first_frame = frames[0]
            print("\nFirst Frame details:")
            print(f"Frame ID: {first_frame.id}")
            print(f"Frame Index: {first_frame.frame_index}")
            
            # Safe prints of strings that might have backslashes
            print(f"cam_front: {repr(first_frame.cam_front)}")
            print(f"cam_front_left: {repr(first_frame.cam_front_left)}")
            print(f"cam_front_right: {repr(first_frame.cam_front_right)}")
            print(f"cam_back: {repr(first_frame.cam_back)}")
            print(f"cam_back_left: {repr(first_frame.cam_back_left)}")
            print(f"cam_back_right: {repr(first_frame.cam_back_right)}")
            
            # Resolve cam_front path
            if first_frame.cam_front:
                if first_frame.cam_front.startswith("uploads/"):
                    resolved = os.path.join("static", first_frame.cam_front)
                else:
                    resolved = os.path.join(_cfg.NUSCENES_ROOT, first_frame.cam_front)
                print(f"Resolved cam_front path: {resolved}")
                print(f"Resolved path exists on disk: {os.path.exists(resolved)}")
            else:
                print("cam_front is None/empty in database!")
    except Exception as e:
        print(f"Error during diagnostics: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
