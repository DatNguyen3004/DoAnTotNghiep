import os
import sys
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).parent.parent))

from database import SessionLocal
from models.user import User
from models.project import Project
from models.scene import Scene
from models.frame import Frame
from models.annotation import Annotation
import config as _cfg

def main():
    print("=== NULABEL PATH DIAGNOSTICS ===")
    print(f"NUSCENES_ROOT in config: {_cfg.NUSCENES_ROOT}")
    print(f"NUSCENES_META in config: {_cfg.NUSCENES_META}")
    
    db = SessionLocal()
    try:
        # Get one frame that belongs to a nuScenes scene
        frame = db.query(Frame).filter(Frame.cam_front.like("samples/%")).first()
        if not frame:
            print("No nuScenes frames found in database!")
            return
            
        print(f"\nFound nuScenes frame ID: {frame.id}")
        print(f"Database cam_front path: {frame.cam_front}")
        
        # Test path resolution
        resolved_path = os.path.join(_cfg.NUSCENES_ROOT, frame.cam_front)
        print(f"Resolved absolute path: {resolved_path}")
        
        # Check if exists
        exists = os.path.exists(resolved_path)
        print(f"File exists on disk: {exists}")
        
        if not exists:
            # Let's inspect D:\Dataset-image directory
            print("\nScanning D:\\Dataset-image contents...")
            img_root = Path(r"D:\Dataset-image")
            if img_root.exists():
                for p in img_root.glob("**/*"):
                    if p.is_file() and p.suffix == ".jpg":
                        print(f"Found a sample JPG on disk: {p}")
                        break
            else:
                print("D:\\Dataset-image does not exist!")
    finally:
        db.close()

if __name__ == "__main__":
    main()
