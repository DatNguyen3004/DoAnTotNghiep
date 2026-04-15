"""
Seed tasks cho tat ca 10 scenes + cap nhat mo ta tieng Viet.
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models.user
import models.project
from models.scene import Scene
from models.task import Task
from models.annotation import Annotation
import models.frame

# Mô tả tiếng Việt cho từng scene (theo thứ tự trong nuScenes mini)
SCENE_DESCRIPTIONS_VI = {
    "scene-0061": "Xe tải đỗ, khu vực thi công, ngã tư, rẽ trái, theo sau xe van",
    "scene-0103": "Nhiều người đi bộ bên phải, chờ xe rẽ, giá để xe đạp dài bên trái",
    "scene-0553": "Khu dân cư ban đêm, nhiều xe đỗ hai bên đường",
    "scene-0655": "Ngã tư đô thị, xe buýt phía trước, người đi bộ qua đường",
    "scene-0757": "Đường cao tốc, xe tải chở hàng, làn đường đông đúc",
    "scene-0796": "Khu vực xây dựng, rào chắn, xe cẩu hoạt động",
    "scene-0916": "Bãi đỗ xe ngoài trời, nhiều phương tiện đa dạng",
    "scene-1077": "Đường phố ban đêm, đèn giao thông, xe máy lưu thông",
    "scene-1094": "Giao lộ phức tạp, xe buýt dừng trạm, người qua đường",
    "scene-1100": "Khu thương mại, ô tô và xe đạp, vỉa hè đông người",
}

# Map tên scene (scene-XXXX) → token thật
SCENE_NAME_MAP = {}

db = SessionLocal()
try:
    scenes = db.query(Scene).order_by(Scene.id).all()
    print(f"Found {len(scenes)} scenes in DB")

    # Cập nhật mô tả tiếng Việt
    for scene in scenes:
        # scene_token là hash, ta cần scene name từ nuScenes
        # Tạm gán mô tả theo thứ tự
        pass

    # Lấy danh sách scene names từ nuScenes JSON
    import json
    from config import NUSCENES_META
    with open(os.path.join(NUSCENES_META, "scene.json"), encoding="utf-8") as f:
        nuscenes_scenes = json.load(f)

    token_to_name = {s["token"]: s["name"] for s in nuscenes_scenes}

    # Cập nhật mô tả
    for scene in scenes:
        name = token_to_name.get(scene.scene_token, "")
        desc_vi = SCENE_DESCRIPTIONS_VI.get(name, "Dữ liệu đa camera xe tự hành")
        scene.description = desc_vi
        print(f"  Scene {scene.id}: {name} -> {desc_vi}")

    # Xóa tất cả task + annotation cũ (dữ liệu test)
    db.query(Annotation).delete()
    db.query(Task).delete()
    db.flush()
    print("\nCleared old tasks & annotations")

    # Tạo task mới cho tất cả 10 scenes
    # Labeler IDs: labeler01=2, labeler02=3
    labelers = [2, 3]
    statuses_plan = [
        # (assigned_to, status, reviewer_id, feedback)
        (2, "approved",     3, None),
        (3, "approved",     2, None),
        (2, "under_review", 3, None),
        (3, "in_progress",  None, None),
        (2, "in_progress",  None, None),
        (3, "pending",      None, None),
        (2, "pending",      None, None),
        (3, "rejected",     2, "Thiếu annotation xe máy ở frame 12-18, cần bổ sung thêm"),
        (2, "submitted",    None, None),
        (3, "pending",      None, None),
    ]

    for i, scene in enumerate(scenes):
        assigned_to, status, reviewer_id, feedback = statuses_plan[i % len(statuses_plan)]
        task = Task(
            project_id=scene.project_id,
            scene_id=scene.id,
            assigned_to=assigned_to,
            reviewer_id=reviewer_id,
            status=status,
            feedback=feedback,
            time_spent=0 if status == "pending" else (300 + i * 120),
        )
        db.add(task)
        name = token_to_name.get(scene.scene_token, f"scene-{scene.id}")
        print(f"  Task: {name} -> assigned={assigned_to}, status={status}")

    db.commit()
    print(f"\nDone! Created {len(scenes)} tasks")

finally:
    db.close()
