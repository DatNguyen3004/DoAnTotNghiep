"""
Import nuScenes mini dataset vào DB.
Chạy: python scripts/import_nuscenes.py --project_id 1
"""
import sys, os, json, argparse
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models.user import User        # noqa
from models.project import Project  # noqa
from models.scene import Scene
from models.frame import Frame
from config import NUSCENES_ROOT, NUSCENES_META

CAMERA_CHANNELS = [
    "CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT",
    "CAM_BACK", "CAM_BACK_LEFT", "CAM_BACK_RIGHT"
]

def load_json(filename):
    with open(os.path.join(NUSCENES_META, filename), encoding="utf-8") as f:
        return {item["token"]: item for item in json.load(f)}

def run(project_id: int):
    db = SessionLocal()
    try:
        scenes           = load_json("scene.json")
        samples          = load_json("sample.json")
        sample_data_list = load_json("sample_data.json")
        cal_sensors      = load_json("calibrated_sensor.json")
        sensors          = load_json("sensor.json")

        # Build channel lookup: calibrated_sensor_token → channel
        channel_lookup = {}
        for cs_token, cs in cal_sensors.items():
            sensor = sensors.get(cs["sensor_token"], {})
            channel_lookup[cs_token] = sensor.get("channel", "")

        # Nhóm sample_data theo sample_token + channel
        cam_map = {}  # {sample_token: {channel: filename}}
        for sd in sample_data_list.values():
            channel = channel_lookup.get(sd["calibrated_sensor_token"], "")
            if channel not in CAMERA_CHANNELS:
                continue
            tok = sd["sample_token"]
            if tok not in cam_map:
                cam_map[tok] = {}
            cam_map[tok][channel] = sd["filename"]

        imported_scenes = 0
        imported_frames = 0

        for scene_token, scene in scenes.items():
            # Bỏ qua nếu đã import
            if db.query(Scene).filter_by(project_id=project_id, scene_token=scene_token).first():
                continue

            # Lấy tất cả sample của scene theo thứ tự
            scene_samples = [s for s in samples.values() if s["scene_token"] == scene_token]
            scene_samples.sort(key=lambda x: x["timestamp"])

            db_scene = Scene(
                project_id=project_id,
                scene_token=scene_token,
                description=scene.get("description", ""),
                frame_count=len(scene_samples)
            )
            db.add(db_scene)
            db.flush()

            for idx, sample in enumerate(scene_samples):
                cams = cam_map.get(sample["token"], {})
                db_frame = Frame(
                    scene_id=db_scene.id,
                    frame_index=idx,
                    timestamp=sample["timestamp"],
                    cam_front=cams.get("CAM_FRONT"),
                    cam_front_left=cams.get("CAM_FRONT_LEFT"),
                    cam_front_right=cams.get("CAM_FRONT_RIGHT"),
                    cam_back=cams.get("CAM_BACK"),
                    cam_back_left=cams.get("CAM_BACK_LEFT"),
                    cam_back_right=cams.get("CAM_BACK_RIGHT"),
                )
                db.add(db_frame)
                imported_frames += 1

            imported_scenes += 1

        db.commit()
        print(f"Import xong: {imported_scenes} scene, {imported_frames} frame vào project_id={project_id}")
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project_id", type=int, default=1)
    args = parser.parse_args()
    run(args.project_id)
