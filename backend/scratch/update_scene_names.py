"""Update scene names from nuScenes metadata."""
import sys, os, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models.user, models.project, models.frame
from models.scene import Scene
from config import NUSCENES_META

db = SessionLocal()
try:
    with open(os.path.join(NUSCENES_META, "scene.json"), encoding="utf-8") as f:
        nuscenes_scenes = json.load(f)
    token_to_name = {s["token"]: s["name"] for s in nuscenes_scenes}

    scenes = db.query(Scene).all()
    for scene in scenes:
        name = token_to_name.get(scene.scene_token, f"scene-{scene.id}")
        scene.name = name
        print(f"  {scene.id}: {scene.scene_token[:16]}... -> {name} | {scene.description}")

    db.commit()
    print(f"\nUpdated {len(scenes)} scene names")
finally:
    db.close()
