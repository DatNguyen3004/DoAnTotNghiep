"""
Export dữ liệu annotation theo chuẩn nuScenes (simplified 2D).

Cấu trúc ZIP:
  nuscenes_export/
    v1.0-trainval/
      category.json
      instance.json
      scene.json
      sample.json
      sample_data.json
      sample_annotation.json
      sensor.json
      calibrated_sensor.json
      ego_pose.json
      log.json
      map.json
      visibility.json
      attribute.json
"""

import io, json, uuid, zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models.project import Project
from models.scene import Scene
from models.frame import Frame
from models.annotation import Annotation
from models.task import Task
from models.user import User
from routers.auth import get_current_user, require_admin

router = APIRouter()

# ── Category mapping ──────────────────────────────────────────────────────────
CATEGORY_MAP = {
    "vehicle.car":        "vehicle.car",
    "vehicle.truck":      "vehicle.truck",
    "vehicle.bus":        "vehicle.bus",
    "vehicle.motorcycle": "vehicle.motorcycle",
    "human.pedestrian":   "human.pedestrian",
    "vehicle.bicycle":    "vehicle.bicycle",
}

CAMERAS = ["CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT",
           "CAM_BACK", "CAM_BACK_LEFT", "CAM_BACK_RIGHT"]

def _uid(seed: str) -> str:
    """Tạo UUID deterministic từ seed string."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))


@router.get("/{project_id}/export")
def export_project(
    project_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Xuất toàn bộ annotation của project theo chuẩn nuScenes (ZIP)."""
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    scenes = db.query(Scene).filter(Scene.project_id == project_id).all()
    if not scenes:
        raise HTTPException(status_code=404, detail="Dự án chưa có dữ liệu")

    # ── Build lookup tables ───────────────────────────────────────────────────
    scene_ids = [s.id for s in scenes]
    frames = db.query(Frame).filter(Frame.scene_id.in_(scene_ids)).order_by(Frame.scene_id, Frame.frame_index).all()
    frame_ids = [f.id for f in frames]

    # Lấy annotations từ các task đã approved/reviewed
    approved_tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status.in_(["approved", "reviewed"])
    ).all()
    approved_task_ids = [t.id for t in approved_tasks]

    annotations = []
    if approved_task_ids:
        annotations = db.query(Annotation).filter(
            Annotation.task_id.in_(approved_task_ids),
            Annotation.frame_id.in_(frame_ids)
        ).all()

    frame_map = {f.id: f for f in frames}
    scene_map = {s.id: s for s in scenes}

    # ── category.json ─────────────────────────────────────────────────────────
    categories_used = set(a.category for a in annotations)
    category_list = []
    cat_token_map = {}
    for cat in sorted(CATEGORY_MAP.keys()):
        token = _uid(f"category_{cat}")
        cat_token_map[cat] = token
        category_list.append({
            "token": token,
            "name": CATEGORY_MAP.get(cat, cat),
            "description": "",
            "index": len(category_list),
        })

    # ── instance.json ─────────────────────────────────────────────────────────
    # instance = unique (category, track_id) per scene
    instance_map = {}  # (scene_id, category, track_id) → token
    instance_list = []
    for ann in annotations:
        frame = frame_map.get(ann.frame_id)
        if not frame:
            continue
        key = (frame.scene_id, ann.category, ann.track_id or 0)
        if key not in instance_map:
            token = _uid(f"instance_{key[0]}_{key[1]}_{key[2]}")
            instance_map[key] = token
            instance_list.append({
                "token": token,
                "category_token": cat_token_map.get(ann.category, _uid(f"cat_{ann.category}")),
                "nbr_annotations": 0,
                "first_annotation_token": "",
                "last_annotation_token": "",
            })

    # ── sensor.json & calibrated_sensor.json ──────────────────────────────────
    sensor_list = []
    calib_list = []
    sensor_token_map = {}
    calib_token_map = {}
    for cam in CAMERAS:
        s_token = _uid(f"sensor_{cam}")
        c_token = _uid(f"calib_{cam}")
        sensor_token_map[cam] = s_token
        calib_token_map[cam] = c_token
        sensor_list.append({
            "token": s_token,
            "channel": cam,
            "modality": "camera",
        })
        calib_list.append({
            "token": c_token,
            "sensor_token": s_token,
            "translation": [0.0, 0.0, 0.0],
            "rotation": [1.0, 0.0, 0.0, 0.0],
            "camera_intrinsic": [[1266.4, 0, 816.0], [0, 1266.4, 491.5], [0, 0, 1]],
        })

    # ── ego_pose.json (dummy per frame) ───────────────────────────────────────
    ego_pose_list = []
    ego_token_map = {}
    for f in frames:
        token = _uid(f"ego_{f.id}")
        ego_token_map[f.id] = token
        ego_pose_list.append({
            "token": token,
            "timestamp": f.timestamp or (f.frame_index * 500000),
            "rotation": [1.0, 0.0, 0.0, 0.0],
            "translation": [0.0, 0.0, 0.0],
        })

    # ── scene.json ────────────────────────────────────────────────────────────
    scene_list = []
    scene_token_map = {}
    scene_frames = {}  # scene_id → sorted frames
    for f in frames:
        scene_frames.setdefault(f.scene_id, []).append(f)

    for s in scenes:
        token = _uid(f"scene_{s.id}")
        scene_token_map[s.id] = token
        s_frames = scene_frames.get(s.id, [])
        first_sample = _uid(f"sample_{s_frames[0].id}") if s_frames else ""
        last_sample = _uid(f"sample_{s_frames[-1].id}") if s_frames else ""
        scene_list.append({
            "token": token,
            "log_token": _uid(f"log_{project_id}"),
            "nbr_samples": len(s_frames),
            "first_sample_token": first_sample,
            "last_sample_token": last_sample,
            "name": s.scene_token or f"scene-{s.id:04d}",
            "description": s.description or s.name or "",
        })

    # ── sample.json ───────────────────────────────────────────────────────────
    sample_list = []
    sample_token_map = {}
    for f in frames:
        token = _uid(f"sample_{f.id}")
        sample_token_map[f.id] = token
        s_frames = scene_frames.get(f.scene_id, [])
        idx_in_scene = next((i for i, sf in enumerate(s_frames) if sf.id == f.id), 0)
        prev_token = _uid(f"sample_{s_frames[idx_in_scene-1].id}") if idx_in_scene > 0 else ""
        next_token = _uid(f"sample_{s_frames[idx_in_scene+1].id}") if idx_in_scene < len(s_frames)-1 else ""
        sample_list.append({
            "token": token,
            "timestamp": f.timestamp or (f.frame_index * 500000),
            "scene_token": scene_token_map.get(f.scene_id, ""),
            "prev": prev_token,
            "next": next_token,
        })

    # ── sample_data.json ──────────────────────────────────────────────────────
    cam_field_map = {
        "CAM_FRONT": "cam_front",
        "CAM_FRONT_LEFT": "cam_front_left",
        "CAM_FRONT_RIGHT": "cam_front_right",
        "CAM_BACK": "cam_back",
        "CAM_BACK_LEFT": "cam_back_left",
        "CAM_BACK_RIGHT": "cam_back_right",
    }
    sample_data_list = []
    sd_token_map = {}  # (frame_id, cam) → token
    for f in frames:
        for cam in CAMERAS:
            token = _uid(f"sd_{f.id}_{cam}")
            sd_token_map[(f.id, cam)] = token
            filename = getattr(f, cam_field_map[cam], None) or f"samples/{cam}/frame_{f.frame_index:06d}.jpg"
            sample_data_list.append({
                "token": token,
                "sample_token": sample_token_map.get(f.id, ""),
                "ego_pose_token": ego_token_map.get(f.id, ""),
                "calibrated_sensor_token": calib_token_map.get(cam, ""),
                "timestamp": f.timestamp or (f.frame_index * 500000),
                "fileformat": "jpg",
                "is_key_frame": True,
                "height": 900,
                "width": 1600,
                "filename": filename,
                "prev": "",
                "next": "",
            })

    # ── sample_annotation.json ────────────────────────────────────────────────
    ann_list = []
    instance_ann_count = {}
    instance_first = {}
    instance_last = {}

    for ann in annotations:
        frame = frame_map.get(ann.frame_id)
        if not frame:
            continue
        key = (frame.scene_id, ann.category, ann.track_id or 0)
        inst_token = instance_map.get(key, _uid(f"inst_unknown_{ann.id}"))
        token = _uid(f"ann_{ann.id}")

        # Convert normalized bbox → nuScenes 3D (dummy z, h)
        # nuScenes: translation=[cx, cy, cz], size=[w, l, h] in meters (dummy)
        # Chúng ta lưu normalized [0,1] → dùng pixel coords với dummy depth
        cx = ann.bbox_x + ann.bbox_w / 2
        cy = ann.bbox_y + ann.bbox_h / 2
        w_norm = ann.bbox_w
        h_norm = ann.bbox_h

        ann_token = {
            "token": token,
            "sample_token": sample_token_map.get(ann.frame_id, ""),
            "instance_token": inst_token,
            "visibility_token": "4",
            "attribute_tokens": [],
            # 3D bbox (dummy) — translation in normalized image coords
            "translation": [round(cx, 6), round(cy, 6), 0.5],
            "size": [round(w_norm, 6), round(h_norm, 6), 0.5],
            "rotation": [1.0, 0.0, 0.0, 0.0],
            "prev": "",
            "next": "",
            "num_lidar_pts": 0,
            "num_radar_pts": 0,
            # Extra: 2D bbox info
            "bbox_2d": {
                "x": round(ann.bbox_x, 6),
                "y": round(ann.bbox_y, 6),
                "w": round(ann.bbox_w, 6),
                "h": round(ann.bbox_h, 6),
                "camera": ann.camera,
            },
            "confidence": ann.confidence,
            "is_ai_generated": ann.is_ai_generated,
            "track_id": ann.track_id,
            "custom_name": ann.custom_name,
        }
        ann_list.append(ann_token)

        # Track instance first/last
        instance_ann_count[inst_token] = instance_ann_count.get(inst_token, 0) + 1
        if inst_token not in instance_first:
            instance_first[inst_token] = token
        instance_last[inst_token] = token

    # Update instance first/last/count
    for inst in instance_list:
        t = inst["token"]
        inst["nbr_annotations"] = instance_ann_count.get(t, 0)
        inst["first_annotation_token"] = instance_first.get(t, "")
        inst["last_annotation_token"] = instance_last.get(t, "")

    # ── Misc static tables ────────────────────────────────────────────────────
    log_list = [{
        "token": _uid(f"log_{project_id}"),
        "logfile": f"project_{project_id}.log",
        "vehicle": "car",
        "date_captured": "2024-01-01",
        "location": "vietnam",
    }]

    visibility_list = [
        {"token": "1", "level": "v0-40",  "description": "visibility of whole object is between 0 and 40%"},
        {"token": "2", "level": "v40-60", "description": "visibility of whole object is between 40 and 60%"},
        {"token": "3", "level": "v60-80", "description": "visibility of whole object is between 60 and 80%"},
        {"token": "4", "level": "v80-100","description": "visibility of whole object is between 80 and 100%"},
    ]

    attribute_list = [
        {"token": _uid("attr_moving"),    "name": "vehicle.moving",    "description": ""},
        {"token": _uid("attr_stopped"),   "name": "vehicle.stopped",   "description": ""},
        {"token": _uid("attr_parked"),    "name": "vehicle.parked",    "description": ""},
        {"token": _uid("attr_standing"),  "name": "pedestrian.standing","description": ""},
        {"token": _uid("attr_walking"),   "name": "pedestrian.walking", "description": ""},
    ]

    map_list = [{
        "token": _uid(f"map_{project_id}"),
        "log_tokens": [_uid(f"log_{project_id}")],
        "category": "semantic_prior",
        "filename": "maps/map.png",
    }]

    # ── Build ZIP ─────────────────────────────────────────────────────────────
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        base = "v1.0-trainval"

        def add(name, data):
            zf.writestr(f"{base}/{name}", json.dumps(data, ensure_ascii=False, indent=2))

        add("category.json",           category_list)
        add("instance.json",           instance_list)
        add("scene.json",              scene_list)
        add("sample.json",             sample_list)
        add("sample_data.json",        sample_data_list)
        add("sample_annotation.json",  ann_list)
        add("sensor.json",             sensor_list)
        add("calibrated_sensor.json",  calib_list)
        add("ego_pose.json",           ego_pose_list)
        add("log.json",                log_list)
        add("visibility.json",         visibility_list)
        add("attribute.json",          attribute_list)
        add("map.json",                map_list)

        # README
        readme = f"""NuLabel Export — nuScenes Format
Project: {project.name}
Scenes: {len(scenes)}
Frames: {len(frames)}
Annotations: {len(ann_list)}
Instances: {len(instance_list)}

Notes:
- 3D bbox translation/size are in normalized image coordinates (not metric)
- bbox_2d field contains original 2D normalized coordinates [0,1]
- Only annotations from approved/reviewed tasks are included
"""
        zf.writestr("README.txt", readme)

    buf.seek(0)
    # Sanitize filename — chỉ dùng ASCII
    safe_name = ''.join(c if c.isascii() and (c.isalnum() or c in '-_') else '_' for c in project.name)
    filename = f"nulabel_export_{safe_name}_{project_id}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
