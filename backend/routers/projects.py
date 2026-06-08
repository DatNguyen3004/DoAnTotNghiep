from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os, shutil, uuid, tempfile, zipfile, io, zipfile, io

from database import get_db, SessionLocal
from models.project import Project, ProjectMember
from models.scene import Scene
from models.frame import Frame  # noqa - cần load để SQLAlchemy resolve relationship
from models.task import Task
from models.user import User
from schemas.project import ProjectCreate, ProjectOut, MemberAdd
from routers.auth import get_current_user, require_admin

router = APIRouter()

UPLOAD_DIR = "static/uploads/covers"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def _to_out(project: Project, db: Session) -> dict:
    scene_count = db.query(Scene).filter(Scene.project_id == project.id).count()
    d = ProjectOut.model_validate(project).model_dump()
    d['scene_count'] = scene_count
    return d

def create_scenes_from_folder(db: Session, project_id: int, folder_path: str):
    """Tự động tạo các nhiệm vụ chưa phân công từ folder mặc định"""
    if not os.path.isdir(folder_path):
        return
    
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    image_files = sorted([f for f in os.listdir(folder_path) if os.path.splitext(f)[1].lower() in image_extensions])
    
    if not image_files:
        return
    
    # Chia nhiệm vụ (mỗi scene 40 ảnh), mặc định KHÔNG gán user (unassigned)
    batch_size = 40
    for batch_idx, i in enumerate(range(0, len(image_files), batch_size)):
        if batch_idx >= 10: break # Lấy 10 nhiệm vụ mẫu
        batch_files = image_files[i:i + batch_size]
        
        scene = Scene(
            project_id=project_id,
            scene_token=f"scene-{uuid.uuid4().hex[:8]}",
            name=f"Nhiệm vụ {batch_idx + 1}",
            description=f"Dữ liệu nuScenes mặc định",
            frame_count=len(batch_files),
            assigned_to=None, # Đảm bảo chưa được phân công
            status="pending"
        )
        db.add(scene)
        db.flush()
        
        for frame_idx, filename in enumerate(batch_files):
            frame = Frame(
                scene_id=scene.id,
                frame_index=frame_idx,
                cam_front=os.path.join(folder_path, filename)
            )
            db.add(frame)
    db.commit()

@router.get("", response_model=List[ProjectOut])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Chỉ admin gốc (username="admin") mới thấy tất cả
    if current_user.username == "admin":
        projects = db.query(Project).filter(Project.is_active == True).all()
    else:
        # Các người dùng khác chỉ thấy dự án họ tham gia HOẶC họ tự tạo
        memberships = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
        project_ids = [m.project_id for m in memberships]
        projects = db.query(Project).filter(
            (Project.id.in_(project_ids)) | (Project.created_by == current_user.id), 
            Project.is_active == True
        ).all()
    return [_to_out(p, db) for p in projects]

@router.post("", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    import config as _cfg

    try:
        project = Project(
            name=body.name,
            description=body.description,
            created_by=current_user.id
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        # Chỉ import nuScenes nếu admin chọn nguồn mặc định
        if (body.data_source or "nuscenes") == "nuscenes":
            try:
                _import_nuscenes_to_project(db, project.id, _cfg.NUSCENES_ROOT, _cfg.NUSCENES_META)
            except Exception as e:
                print(f"Lỗi khi nạp dữ liệu nuScenes: {e}")

        return project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi tạo dự án: {str(e)}")


def _import_nuscenes_to_project(db, project_id: int, nuscenes_root: str, nuscenes_meta: str):
    """Import nuScenes dataset vào project — dùng metadata JSON chuẩn."""
    import json as _json

    CAMERA_CHANNELS = [
        "CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT",
        "CAM_BACK", "CAM_BACK_LEFT", "CAM_BACK_RIGHT",
    ]

    def load_json(filename):
        path = os.path.join(nuscenes_meta, filename)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Không tìm thấy {path}")
        with open(path, encoding="utf-8") as f:
            return {item["token"]: item for item in _json.load(f)}

    scenes = load_json("scene.json")
    samples = load_json("sample.json")
    sample_data_list = load_json("sample_data.json")
    cal_sensors = load_json("calibrated_sensor.json")
    sensors = load_json("sensor.json")

    # Build channel lookup
    channel_lookup = {}
    for cs_token, cs in cal_sensors.items():
        sensor = sensors.get(cs["sensor_token"], {})
        channel_lookup[cs_token] = sensor.get("channel", "")

    # Nhóm sample_data theo sample_token + channel
    cam_map = {}
    for sd in sample_data_list.values():
        channel = channel_lookup.get(sd["calibrated_sensor_token"], "")
        if channel not in CAMERA_CHANNELS:
            continue
        tok = sd["sample_token"]
        if tok not in cam_map:
            cam_map[tok] = {}
        cam_map[tok][channel] = sd["filename"]

    cam_field_map = {
        "CAM_FRONT": "cam_front",
        "CAM_FRONT_LEFT": "cam_front_left",
        "CAM_FRONT_RIGHT": "cam_front_right",
        "CAM_BACK": "cam_back",
        "CAM_BACK_LEFT": "cam_back_left",
        "CAM_BACK_RIGHT": "cam_back_right",
    }

    for scene_token, scene in scenes.items():
        # Bỏ qua nếu đã import
        if db.query(Scene).filter_by(project_id=project_id, scene_token=scene_token).first():
            continue

        scene_samples = [s for s in samples.values() if s["scene_token"] == scene_token]
        scene_samples.sort(key=lambda x: x["timestamp"])

        db_scene = Scene(
            project_id=project_id,
            scene_token=scene_token,
            name=scene.get("name", scene_token),
            description=scene.get("description", ""),
            frame_count=len(scene_samples),
        )
        db.add(db_scene)
        db.flush()

        for idx, sample in enumerate(scene_samples):
            cams = cam_map.get(sample["token"], {})
            kwargs = {
                "scene_id": db_scene.id,
                "frame_index": idx,
                "timestamp": sample.get("timestamp"),
            }
            for cam, field in cam_field_map.items():
                if cam in cams:
                    kwargs[field] = cams[cam]
            db.add(Frame(**kwargs))

    db.commit()

@router.get("/select-folder")
def select_folder(current_user: User = Depends(require_admin)):
    import tkinter as tk
    from tkinter import filedialog
    import threading
    
    result = []
    def ask_dir():
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        folder = filedialog.askdirectory(title="Chọn thư mục nguồn")
        if folder:
            result.append(folder)
        root.destroy()
        
    t = threading.Thread(target=ask_dir)
    t.start()
    t.join()
    
    if result:
        return {"folder_path": result[0]}
    return {"folder_path": ""}


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return project

@router.get("/{project_id}/similarity-stats")
def get_ai_similarity_stats(
    project_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Tính toán % tương đồng giữa AI và người dùng (IoU trung bình) cho các nhãn AI."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
        
    from models.annotation import Annotation
    from models.task import Task
    
    # Lấy tất cả các nhãn do AI tạo ra trong dự án này (những nhãn chưa bị xóa)
    annotations = db.query(Annotation).join(Task).filter(
        Task.project_id == project_id,
        Annotation.is_ai_generated == True,
        Annotation.ai_bbox_w.isnot(None)
    ).all()
    
    if not annotations:
        return {"total_ai_labels_kept": 0, "average_iou": 0.0, "similarity_percent": 0.0}
        
    total_iou = 0.0
    for ann in annotations:
        # Tính IoU
        ax1, ay1 = ann.bbox_x, ann.bbox_y
        ax2, ay2 = ann.bbox_x + ann.bbox_w, ann.bbox_y + ann.bbox_h
        
        bx1, by1 = ann.ai_bbox_x, ann.ai_bbox_y
        bx2, by2 = ann.ai_bbox_x + ann.ai_bbox_w, ann.ai_bbox_y + ann.ai_bbox_h
        
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        
        if ix2 <= ix1 or iy2 <= iy1:
            iou = 0.0
        else:
            inter = (ix2 - ix1) * (iy2 - iy1)
            union = (ann.bbox_w * ann.bbox_h) + (ann.ai_bbox_w * ann.ai_bbox_h) - inter
            iou = inter / union if union > 0 else 0.0
            
        total_iou += iou
        
    avg_iou = total_iou / len(annotations)
    
    return {
        "total_ai_labels_kept": len(annotations),
        "average_iou": round(avg_iou, 4),
        "similarity_percent": round(avg_iou * 100, 2)
    }

@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    body: ProjectCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    project.name = body.name
    project.description = body.description
    db.commit()
    db.refresh(project)
    return project

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    from models.annotation import Annotation

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    # Lấy tất cả scene và task thuộc project
    scenes = db.query(Scene).filter(Scene.project_id == project_id).all()
    scene_ids = [s.id for s in scenes]

    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    task_ids = [t.id for t in tasks]

    # 0. Thu thập đường dẫn file vật lý cần xóa
    cam_columns = ["cam_front", "cam_front_left", "cam_front_right", "cam_back", "cam_back_left", "cam_back_right"]
    dirs_to_delete = set()
    files_to_delete = []

    if scene_ids:
        frames = db.query(Frame).filter(Frame.scene_id.in_(scene_ids)).all()
        for frame in frames:
            for col in cam_columns:
                rel_path = getattr(frame, col, None)
                if rel_path and rel_path.startswith("uploads/"):
                    abs_path = os.path.join("static", rel_path)
                    # Thu thập thư mục cha để xóa cả thư mục một lần
                    parent_dir = os.path.dirname(abs_path)
                    if parent_dir and parent_dir != "static/uploads/frames":
                        dirs_to_delete.add(parent_dir)
                    else:
                        files_to_delete.append(abs_path)

    # Xóa ảnh bìa dự án
    if project.cover_image:
        cover_path = os.path.join("static", project.cover_image.lstrip("/"))
        files_to_delete.append(cover_path)

    # 1. Xóa annotations
    if task_ids:
        db.query(Annotation).filter(Annotation.task_id.in_(task_ids)).delete(synchronize_session=False)

    # 2. Xóa tasks
    db.query(Task).filter(Task.project_id == project_id).delete(synchronize_session=False)

    # 3. Xóa frames
    if scene_ids:
        db.query(Frame).filter(Frame.scene_id.in_(scene_ids)).delete(synchronize_session=False)

    # 4. Xóa scenes
    db.query(Scene).filter(Scene.project_id == project_id).delete(synchronize_session=False)

    # 5. Xóa project members
    db.query(ProjectMember).filter(ProjectMember.project_id == project_id).delete(synchronize_session=False)

    # 6. Xóa project
    db.delete(project)
    db.commit()

    # 7. Xóa file vật lý sau khi DB đã commit thành công
    for d in dirs_to_delete:
        if os.path.isdir(d):
            shutil.rmtree(d, ignore_errors=True)
    for f in files_to_delete:
        if os.path.isfile(f):
            try:
                os.remove(f)
            except Exception:
                pass

    return {"message": "Đã xóa dự án và toàn bộ dữ liệu liên quan"}


@router.post("/{project_id}/cover")
async def upload_cover(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận JPG, PNG, WEBP")
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    project.cover_image = f"/uploads/covers/{filename}"
    db.commit()
    return {"cover_image": project.cover_image}


@router.get("/{project_id}/members")
def list_members(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    memberships = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    result = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            result.append({
                "id": user.id,
                "username": user.username,
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
                "avatar_url": user.avatar_url,
                "task_count": 0,
                "completed": 0,
            })
    return result

@router.post("/{project_id}/members")
def add_member(
    project_id: int,
    body: MemberAdd,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    existing = db.query(ProjectMember).filter_by(project_id=project_id, user_id=body.user_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Người dùng đã là thành viên")
    db.add(ProjectMember(project_id=project_id, user_id=body.user_id))
    db.commit()
    return {"message": "Đã thêm thành viên"}

@router.delete("/{project_id}/members/{user_id}")
def remove_member(
    project_id: int,
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    member = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")
    db.delete(member)
    db.commit()
    return {"message": "Đã xóa thành viên"}


# ── Video Import ──────────────────────────────────────────────────────────────

CAMERA_CHANNELS = [
    "CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT",
    "CAM_BACK", "CAM_BACK_LEFT", "CAM_BACK_RIGHT",
]

VIDEO_UPLOAD_DIR = "static/uploads/videos"
FRAME_UPLOAD_DIR = "static/uploads/frames"
os.makedirs(VIDEO_UPLOAD_DIR, exist_ok=True)
os.makedirs(FRAME_UPLOAD_DIR, exist_ok=True)

# Lưu trạng thái import đang chạy: {task_id: {status, progress, message}}
_import_status: dict = {}


def _extract_frames_task(
    task_id: str,
    project_id: int,
    video_paths: dict,   # {camera_channel: filepath}
    fps_target: float,
):
    """Background task: cắt frame từ video và lưu vào DB, ghi ảnh song song theo camera."""
    from concurrent.futures import ThreadPoolExecutor
    try:
        import cv2
        _import_status[task_id] = {"status": "running", "progress": 0, "message": "Đang xử lý video..."}

        # Xác định số frame từ camera đầu tiên
        first_cam = list(video_paths.keys())[0]
        cap_check = cv2.VideoCapture(video_paths[first_cam])
        src_fps = cap_check.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap_check.get(cv2.CAP_PROP_FRAME_COUNT))
        cap_check.release()

        frame_interval = max(1, round(src_fps / fps_target))

        # Tạo thư mục lưu frame
        scene_dir = os.path.join(FRAME_UPLOAD_DIR, f"proj{project_id}_{task_id[:8]}")
        os.makedirs(scene_dir, exist_ok=True)

        # Mở tất cả video cùng lúc
        caps = {}
        for cam, path in video_paths.items():
            caps[cam] = cv2.VideoCapture(path)

        # Hàm ghi 1 ảnh (chạy trong thread riêng)
        def save_frame(cam, frame, frame_index):
            fname = f"{cam}_{frame_index:06d}.jpg"
            fpath = os.path.join(scene_dir, fname)
            cv2.imwrite(fpath, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            return cam, f"uploads/frames/proj{project_id}_{task_id[:8]}/{fname}"

        # Cắt frame
        frame_data = []
        frame_index = 0
        raw_index = 0

        with ThreadPoolExecutor(max_workers=len(caps)) as executor:
            while True:
                frames_read = {}
                any_ok = False
                for cam, cap in caps.items():
                    ret, frame = cap.read()
                    if ret:
                        frames_read[cam] = frame
                        any_ok = True

                if not any_ok:
                    break

                if raw_index % frame_interval == 0:
                    # Ghi tất cả camera song song
                    futures = {
                        executor.submit(save_frame, cam, frm, frame_index): cam
                        for cam, frm in frames_read.items()
                    }
                    cam_paths = {}
                    for future in futures:
                        cam, rel_path = future.result()
                        cam_paths[cam] = rel_path

                    frame_data.append({
                        "frame_index": frame_index,
                        "timestamp": int((raw_index / src_fps) * 1e6),
                        "cam_paths": cam_paths,
                    })
                    frame_index += 1

                    progress = min(95, int((raw_index / max(total_frames, 1)) * 95))
                    _import_status[task_id]["progress"] = progress
                    _import_status[task_id]["message"] = f"Đã cắt {frame_index} khung hình..."

                raw_index += 1

        # Đóng tất cả video
        for cap in caps.values():
            cap.release()

        # Lưu vào DB
        _import_status[task_id]["message"] = "Đang lưu vào cơ sở dữ liệu..."
        db = SessionLocal()
        try:
            SCENE_SIZE = 40
            total = len(frame_data)
            scene_count = max(1, (total + SCENE_SIZE - 1) // SCENE_SIZE)
            last_scene_id = None

            cam_field_map = {
                "CAM_FRONT": "cam_front",
                "CAM_FRONT_LEFT": "cam_front_left",
                "CAM_FRONT_RIGHT": "cam_front_right",
                "CAM_BACK": "cam_back",
                "CAM_BACK_LEFT": "cam_back_left",
                "CAM_BACK_RIGHT": "cam_back_right",
            }

            for scene_idx in range(scene_count):
                batch = frame_data[scene_idx * SCENE_SIZE : (scene_idx + 1) * SCENE_SIZE]
                scene = Scene(
                    project_id=project_id,
                    scene_token=f"video-{task_id[:12]}-{scene_idx:03d}",
                    name=f"Scene {scene_idx + 1}",
                    description=f"Imported from video",
                    frame_count=len(batch),
                )
                db.add(scene)
                db.flush()
                last_scene_id = scene.id

                for fd in batch:
                    kwargs = {
                        "scene_id": scene.id,
                        "frame_index": fd["frame_index"] % SCENE_SIZE,
                        "timestamp": fd["timestamp"],
                    }
                    for cam, path in fd["cam_paths"].items():
                        field = cam_field_map.get(cam)
                        if field:
                            kwargs[field] = path
                    db.add(Frame(**kwargs))

            db.commit()
            _import_status[task_id] = {
                "status": "done",
                "progress": 100,
                "message": f"Hoàn thành! Đã tạo {total} khung hình trong {scene_count} scene.",
                "scene_id": last_scene_id,
                "frame_count": total,
            }
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

        # Xóa file video tạm
        for path in video_paths.values():
            try:
                os.remove(path)
            except Exception:
                pass

    except Exception as e:
        _import_status[task_id] = {
            "status": "error",
            "progress": 0,
            "message": f"Lỗi: {str(e)}",
        }


@router.post("/{project_id}/import-video")
async def import_video(
    project_id: int,
    background_tasks: BackgroundTasks,
    fps_target: float = 2.0,
    cam_front: Optional[UploadFile] = File(None),
    cam_front_left: Optional[UploadFile] = File(None),
    cam_front_right: Optional[UploadFile] = File(None),
    cam_back: Optional[UploadFile] = File(None),
    cam_back_left: Optional[UploadFile] = File(None),
    cam_back_right: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Upload video cho từng camera, cắt frame và tạo scene mới."""
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    # Map file upload theo camera
    uploads = {
        "CAM_FRONT": cam_front,
        "CAM_FRONT_LEFT": cam_front_left,
        "CAM_FRONT_RIGHT": cam_front_right,
        "CAM_BACK": cam_back,
        "CAM_BACK_LEFT": cam_back_left,
        "CAM_BACK_RIGHT": cam_back_right,
    }

    # Lọc camera nào có file
    provided = {cam: f for cam, f in uploads.items() if f is not None}
    if not provided:
        raise HTTPException(status_code=400, detail="Vui lòng upload ít nhất 1 file video")

    # Kiểm tra định dạng
    allowed_ext = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    for cam, upload in provided.items():
        ext = os.path.splitext(upload.filename or "")[1].lower()
        if ext not in allowed_ext:
            raise HTTPException(status_code=400, detail=f"{cam}: Chỉ chấp nhận MP4, AVI, MOV, MKV, WEBM")

    # Lưu file tạm
    task_id = uuid.uuid4().hex
    tmp_dir = os.path.join(VIDEO_UPLOAD_DIR, task_id)
    os.makedirs(tmp_dir, exist_ok=True)

    video_paths = {}
    for cam, upload in provided.items():
        ext = os.path.splitext(upload.filename or ".mp4")[1].lower()
        tmp_path = os.path.join(tmp_dir, f"{cam}{ext}")
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(upload.file, f)
        video_paths[cam] = tmp_path

    # Khởi tạo trạng thái
    _import_status[task_id] = {"status": "queued", "progress": 0, "message": "Đang chờ xử lý..."}

    # Chạy background
    background_tasks.add_task(
        _extract_frames_task,
        task_id, project_id,
        video_paths,
        fps_target,
    )

    return {"task_id": task_id, "message": "Đang xử lý video trong nền..."}


@router.get("/{project_id}/import-video/status/{task_id}")
def get_import_status(
    project_id: int,
    task_id: str,
    current_user: User = Depends(require_admin),
):
    """Kiểm tra tiến trình import video."""
    status = _import_status.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    return status


# ── Image Import ──────────────────────────────────────────────────────────────

IMAGE_UPLOAD_DIR = "static/uploads/images"
os.makedirs(IMAGE_UPLOAD_DIR, exist_ok=True)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}


def _import_images_task(
    task_id: str,
    project_id: int,
    scene_name: str,
    image_paths: list,   # list of (original_filename, saved_filepath)
):
    """Background task: tạo scene + frame từ danh sách ảnh đã lưu, mỗi scene 40 ảnh."""
    SCENE_SIZE = 40
    try:
        _import_status[task_id] = {"status": "running", "progress": 5, "message": "Đang xử lý ảnh..."}

        total = len(image_paths)
        print(f"[import_images] task={task_id[:8]} total={total} images, will create {(total+39)//40} scenes")
        if total == 0:
            _import_status[task_id] = {"status": "error", "progress": 0, "message": "Không tìm thấy ảnh hợp lệ."}
            return

        db = SessionLocal()
        try:
            scene_count = (total + SCENE_SIZE - 1) // SCENE_SIZE
            last_scene_id = None
            processed = 0

            for scene_idx in range(scene_count):
                batch = image_paths[scene_idx * SCENE_SIZE : (scene_idx + 1) * SCENE_SIZE]
                scene_token = f"images-{task_id[:12]}-{scene_idx:03d}"
                scene = Scene(
                    project_id=project_id,
                    scene_token=scene_token,
                    name=f"Scene {scene_idx + 1}",
                    description=f"Imported {len(batch)} images",
                    frame_count=len(batch),
                )
                db.add(scene)
                db.flush()
                last_scene_id = scene.id

                for frame_idx, (orig_name, saved_path) in enumerate(batch):
                    rel_path = os.path.relpath(saved_path, "static").replace("\\", "/")
                    db.add(Frame(
                        scene_id=scene.id,
                        frame_index=frame_idx,
                        cam_front=rel_path,
                    ))
                    processed += 1
                    progress = 5 + int(processed / total * 90)
                    _import_status[task_id]["progress"] = progress
                    _import_status[task_id]["message"] = f"Đã xử lý {processed}/{total} ảnh..."

            db.commit()
            _import_status[task_id] = {
                "status": "done",
                "progress": 100,
                "message": f"Hoàn thành! Đã tạo {total} khung hình trong {scene_count} scene.",
                "scene_id": last_scene_id,
                "frame_count": total,
            }
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    except Exception as e:
        _import_status[task_id] = {
            "status": "error",
            "progress": 0,
            "message": f"Lỗi: {str(e)}",
        }


@router.post("/{project_id}/import-images")
async def import_images(
    project_id: int,
    background_tasks: BackgroundTasks,
    files: Optional[List[UploadFile]] = File(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Upload nhiều ảnh từ folder và tạo scene mới (mỗi scene 40 ảnh)."""
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    if not files:
        raise HTTPException(status_code=400, detail="Vui lòng upload ít nhất 1 file ảnh")

    print(f"[import-images] project={project_id} received {len(files)} files")

    task_id = uuid.uuid4().hex
    save_dir = os.path.join(IMAGE_UPLOAD_DIR, f"{project_id}_{task_id[:8]}")
    os.makedirs(save_dir, exist_ok=True)

    image_paths = []  # list of (original_filename, saved_filepath)

    try:
        for upload in files:
            ext = os.path.splitext(upload.filename or "")[1].lower()
            if ext not in IMAGE_EXTENSIONS:
                continue  # bỏ qua file không phải ảnh
            # webkitdirectory gửi đường dẫn đầy đủ (folder/file.jpg) → chỉ lấy tên file
            basename = os.path.basename(upload.filename.replace("\\", "/"))
            safe_name = f"{uuid.uuid4().hex[:8]}_{basename}"
            dest = os.path.join(save_dir, safe_name)
            with open(dest, "wb") as f:
                shutil.copyfileobj(upload.file, f)
            image_paths.append((basename, dest))

        # Sort theo tên gốc để đảm bảo thứ tự frame
        image_paths.sort(key=lambda x: x[0])

        if not image_paths:
            raise HTTPException(status_code=400, detail="Không tìm thấy ảnh hợp lệ trong folder đã upload")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý file: {str(e)}")

    _import_status[task_id] = {"status": "queued", "progress": 0, "message": "Đang chờ xử lý..."}

    background_tasks.add_task(
        _import_images_task,
        task_id,
        project_id,
        "",  # scene_name không dùng nữa, tự đặt "Scene N"
        image_paths,
    )

    return {"task_id": task_id, "message": "Đang xử lý ảnh trong nền..."}


@router.get("/{project_id}/import-images/status/{task_id}")
def get_import_images_status(
    project_id: int,
    task_id: str,
    current_user: User = Depends(require_admin),
):
    """Kiểm tra tiến trình import ảnh."""
    status = _import_status.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    return status


# ── Multi-Camera Image Import ─────────────────────────────────────────────────

CAM_FIELD_MAP_IMG = {
    "cam_front":       "cam_front",
    "cam_front_left":  "cam_front_left",
    "cam_front_right": "cam_front_right",
    "cam_back":        "cam_back",
    "cam_back_left":   "cam_back_left",
    "cam_back_right":  "cam_back_right",
}


def _import_images_multicam_task(
    task_id: str,
    project_id: int,
    cam_image_paths: dict,  # {cam_key: [(orig_name, saved_path), ...]}
):
    """Background task: ghép ảnh 6 camera theo index, tạo scene 40 frame."""
    SCENE_SIZE = 40
    try:
        _import_status[task_id] = {"status": "running", "progress": 5, "message": "Đang xử lý ảnh..."}

        # Lấy số ảnh ít nhất giữa các camera có dữ liệu
        cam_counts = {k: len(v) for k, v in cam_image_paths.items() if v}
        if not cam_counts:
            _import_status[task_id] = {"status": "error", "progress": 0, "message": "Không tìm thấy ảnh hợp lệ."}
            return

        total = min(cam_counts.values())
        print(f"[import_multicam] task={task_id[:8]} total={total} frames, cams={list(cam_counts.keys())}")

        db = SessionLocal()
        try:
            scene_count = (total + SCENE_SIZE - 1) // SCENE_SIZE
            last_scene_id = None
            processed = 0

            for scene_idx in range(scene_count):
                start = scene_idx * SCENE_SIZE
                end = min(start + SCENE_SIZE, total)
                batch_size = end - start

                scene = Scene(
                    project_id=project_id,
                    scene_token=f"multicam-{task_id[:12]}-{scene_idx:03d}",
                    name=f"Scene {scene_idx + 1}",
                    description=f"Multi-camera import, {batch_size} frames",
                    frame_count=batch_size,
                )
                db.add(scene)
                db.flush()
                last_scene_id = scene.id

                for frame_idx in range(batch_size):
                    global_idx = start + frame_idx
                    kwargs = {
                        "scene_id": scene.id,
                        "frame_index": frame_idx,
                    }
                    for cam_key, paths in cam_image_paths.items():
                        if global_idx < len(paths):
                            _, saved_path = paths[global_idx]
                            rel_path = os.path.relpath(saved_path, "static").replace("\\", "/")
                            kwargs[cam_key] = rel_path

                    db.add(Frame(**kwargs))
                    processed += 1
                    progress = 5 + int(processed / total * 90)
                    _import_status[task_id]["progress"] = progress
                    _import_status[task_id]["message"] = f"Đã xử lý {processed}/{total} khung hình..."

            db.commit()
            _import_status[task_id] = {
                "status": "done",
                "progress": 100,
                "message": f"Hoàn thành! Đã tạo {total} khung hình trong {scene_count} scene.",
                "scene_id": last_scene_id,
                "frame_count": total,
            }
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    except Exception as e:
        _import_status[task_id] = {"status": "error", "progress": 0, "message": f"Lỗi: {str(e)}"}


@router.post("/{project_id}/import-images-multicam")
async def import_images_multicam(
    project_id: int,
    background_tasks: BackgroundTasks,
    cam_front: Optional[List[UploadFile]] = File(None),
    cam_front_left: Optional[List[UploadFile]] = File(None),
    cam_front_right: Optional[List[UploadFile]] = File(None),
    cam_back: Optional[List[UploadFile]] = File(None),
    cam_back_left: Optional[List[UploadFile]] = File(None),
    cam_back_right: Optional[List[UploadFile]] = File(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Upload ảnh cho 6 camera riêng biệt, ghép theo index và tạo scene mới."""
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    uploads = {
        "cam_front":       cam_front,
        "cam_front_left":  cam_front_left,
        "cam_front_right": cam_front_right,
        "cam_back":        cam_back,
        "cam_back_left":   cam_back_left,
        "cam_back_right":  cam_back_right,
    }

    provided = {k: v for k, v in uploads.items() if v}
    if not provided:
        raise HTTPException(status_code=400, detail="Vui lòng upload ít nhất 1 folder ảnh")

    task_id = uuid.uuid4().hex
    save_dir = os.path.join(IMAGE_UPLOAD_DIR, f"{project_id}_{task_id[:8]}")
    os.makedirs(save_dir, exist_ok=True)

    cam_image_paths = {}
    try:
        for cam_key, file_list in provided.items():
            paths = []
            for upload in file_list:
                ext = os.path.splitext(upload.filename or "")[1].lower()
                if ext not in IMAGE_EXTENSIONS:
                    continue
                basename = os.path.basename(upload.filename.replace("\\", "/"))
                safe_name = f"{cam_key}_{uuid.uuid4().hex[:6]}_{basename}"
                dest = os.path.join(save_dir, safe_name)
                with open(dest, "wb") as f:
                    shutil.copyfileobj(upload.file, f)
                paths.append((basename, dest))
            # Sort theo tên gốc để đảm bảo thứ tự
            paths.sort(key=lambda x: x[0])
            if paths:
                cam_image_paths[cam_key] = paths

        if not cam_image_paths:
            raise HTTPException(status_code=400, detail="Không tìm thấy ảnh hợp lệ")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý file: {str(e)}")

    _import_status[task_id] = {"status": "queued", "progress": 0, "message": "Đang chờ xử lý..."}
    background_tasks.add_task(_import_images_multicam_task, task_id, project_id, cam_image_paths)
    return {"task_id": task_id, "message": "Đang xử lý ảnh trong nền..."}


@router.get("/{project_id}/import-images-multicam/status/{task_id}")
def get_import_images_multicam_status(
    project_id: int,
    task_id: str,
    current_user: User = Depends(require_admin),
):
    status = _import_status.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    return status


from pydantic import BaseModel
from pathlib import Path
import cv2


class LocalImagesImportRequest(BaseModel):
    folder_path: str
    camera_channel: Optional[str] = "CAM_FRONT"

class LocalVideoImportRequest(BaseModel):
    folder_path: str
    camera_channel: Optional[str] = "CAM_FRONT"
    fps_target: float = 2.0


def _import_local_images_task(
    task_id: str,
    project_id: int,
    folder_path: str,
    camera_channel: str,
):
    try:
        _import_status[task_id] = {"status": "running", "progress": 5, "message": "Đang quét thư mục ảnh..."}
        
        path_obj = Path(folder_path)
        if not path_obj.exists() or not path_obj.is_dir():
            _import_status[task_id] = {"status": "error", "progress": 0, "message": f"Thư mục không tồn tại hoặc không phải là thư mục: {folder_path}"}
            return
            
        # Quét các thư mục con (mỗi thư mục con đại diện cho một Scene)
        subdirs = sorted([d for d in path_obj.iterdir() if d.is_dir()], key=lambda x: x.name)
        
        scenes_to_process = []
        if len(subdirs) == 0:
            # Fallback nếu không có thư mục con, coi chính thư mục đó là 1 scene
            scenes_to_process.append((path_obj.name, path_obj))
        else:
            for d in subdirs:
                scenes_to_process.append((d.name, d))
                
        # Đếm tổng số lượng ảnh để tính phần trăm progress
        total_images = 0
        scene_images_map = []
        
        for name, dir_path in scenes_to_process:
            img_files = []
            for ext in IMAGE_EXTENSIONS:
                img_files.extend(list(dir_path.glob(f"*{ext}")))
                img_files.extend(list(dir_path.glob(f"*{ext.upper()}")))
            img_files = sorted(list(set(img_files)), key=lambda x: x.name)
            if img_files:
                total_images += len(img_files)
                scene_images_map.append((name, img_files))
                
        if total_images == 0:
            _import_status[task_id] = {"status": "error", "progress": 0, "message": "Không tìm thấy ảnh hợp lệ trong thư mục."}
            return
            
        base_save_dir = os.path.join(IMAGE_UPLOAD_DIR, f"{project_id}_{task_id[:8]}")
        os.makedirs(base_save_dir, exist_ok=True)
        
        db = SessionLocal()
        try:
            processed = 0
            field_name = camera_channel.lower()
            if field_name not in ["cam_front", "cam_front_left", "cam_front_right", "cam_back", "cam_back_left", "cam_back_right"]:
                field_name = "cam_front"
                
            last_scene_id = None
            scene_count = len(scene_images_map)
            
            for scene_idx, (sname, files) in enumerate(scene_images_map):
                save_dir = os.path.join(base_save_dir, sname)
                os.makedirs(save_dir, exist_ok=True)
                
                scene_token = f"local-images-{task_id[:12]}-{scene_idx:03d}"
                scene = Scene(
                    project_id=project_id,
                    scene_token=scene_token,
                    name=sname,
                    description=f"Imported {len(files)} local images",
                    frame_count=len(files),
                )
                db.add(scene)
                db.flush()
                last_scene_id = scene.id
                
                for frame_idx, p in enumerate(files):
                    safe_name = f"{uuid.uuid4().hex[:8]}_{p.name}"
                    dest = os.path.join(save_dir, safe_name)
                    shutil.copy2(p, dest)
                    
                    rel_path = os.path.relpath(dest, "static").replace("\\", "/")
                    kwargs = {
                        "scene_id": scene.id,
                        "frame_index": frame_idx,
                        field_name: rel_path
                    }
                    db.add(Frame(**kwargs))
                    processed += 1
                    
                    progress = 5 + int(processed / total_images * 90)
                    _import_status[task_id]["progress"] = progress
                    _import_status[task_id]["message"] = f"Đang xử lý {processed}/{total_images} ảnh..."
                    
            db.commit()
            _import_status[task_id] = {
                "status": "done",
                "progress": 100,
                "message": f"Hoàn thành! Đã tạo {total_images} khung hình trong {scene_count} scene.",
                "scene_id": last_scene_id,
                "frame_count": total_images,
            }
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()
            
    except Exception as e:
        _import_status[task_id] = {
            "status": "error",
            "progress": 0,
            "message": f"Lỗi: {str(e)}",
        }


def _import_local_video_task(
    task_id: str,
    project_id: int,
    folder_path: str,
    camera_channel: str,
    fps_target: float,
):
    try:
        _import_status[task_id] = {"status": "running", "progress": 5, "message": "Đang quét thư mục video..."}
        
        path_obj = Path(folder_path)
        if not path_obj.exists():
            _import_status[task_id] = {"status": "error", "progress": 0, "message": f"Đường dẫn không tồn tại: {folder_path}"}
            return

        scenes_to_process = []  # List của tuple: (scene_name, list_of_video_paths)
        VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

        if path_obj.is_file():
            # Fallback nếu truyền trực tiếp file video
            if path_obj.suffix.lower() in VIDEO_EXTENSIONS:
                scenes_to_process.append((path_obj.stem, [path_obj]))
        elif path_obj.is_dir():
            # Quét các thư mục con
            subdirs = sorted([d for d in path_obj.iterdir() if d.is_dir()], key=lambda x: x.name)
            if len(subdirs) > 0:
                for d in subdirs:
                    vfiles = []
                    for ext in VIDEO_EXTENSIONS:
                        vfiles.extend(list(d.glob(f"*{ext}")))
                        vfiles.extend(list(d.glob(f"*{ext.upper()}")))
                    vfiles = sorted(list(set(vfiles)), key=lambda x: x.name)
                    if vfiles:
                        scenes_to_process.append((d.name, vfiles))
            
            # Fallback nếu không có thư mục con nào hoặc để quét thêm ở thư mục cha trực tiếp
            if not scenes_to_process:
                vfiles = []
                for ext in VIDEO_EXTENSIONS:
                    vfiles.extend(list(path_obj.glob(f"*{ext}")))
                    vfiles.extend(list(path_obj.glob(f"*{ext.upper()}")))
                vfiles = sorted(list(set(vfiles)), key=lambda x: x.name)
                for vf in vfiles:
                    scenes_to_process.append((vf.stem, [vf]))

        if not scenes_to_process:
            _import_status[task_id] = {"status": "error", "progress": 0, "message": "Không tìm thấy video hợp lệ."}
            return

        base_scene_dir = os.path.join(FRAME_UPLOAD_DIR, f"proj{project_id}_{task_id[:8]}")
        os.makedirs(base_scene_dir, exist_ok=True)
        
        db = SessionLocal()
        try:
            field_name = camera_channel.lower()
            if field_name not in ["cam_front", "cam_front_left", "cam_front_right", "cam_back", "cam_back_left", "cam_back_right"]:
                field_name = "cam_front"
                
            last_scene_id = None
            total_scenes = len(scenes_to_process)
            total_frames_created = 0
            
            for scene_idx, (sname, vfiles) in enumerate(scenes_to_process):
                _import_status[task_id]["message"] = f"Đang xử lý video cho scene: {sname} ({scene_idx+1}/{total_scenes})..."
                _import_status[task_id]["progress"] = 5 + int((scene_idx / total_scenes) * 90)
                
                scene_dir = os.path.join(base_scene_dir, sname)
                os.makedirs(scene_dir, exist_ok=True)
                
                frame_data = []
                frame_index = 0
                
                for vfile in vfiles:
                    cap = cv2.VideoCapture(str(vfile))
                    if not cap.isOpened():
                        continue
                        
                    src_fps = cap.get(cv2.CAP_PROP_FPS)
                    if src_fps <= 0:
                        src_fps = 25.0
                        
                    frame_interval = max(1, round(src_fps / fps_target))
                    raw_index = 0
                    
                    while True:
                        ret, frame = cap.read()
                        if not ret:
                            break
                            
                        if raw_index % frame_interval == 0:
                            fname = f"{camera_channel.upper()}_{frame_index:06d}.jpg"
                            fpath = os.path.join(scene_dir, fname)
                            cv2.imwrite(fpath, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                            
                            rel_path = os.path.relpath(fpath, "static").replace("\\", "/")
                            
                            frame_data.append({
                                "frame_index": frame_index,
                                "timestamp": int((raw_index / src_fps) * 1e6),
                                "path": rel_path,
                            })
                            frame_index += 1
                            
                        raw_index += 1
                    cap.release()
                
                if not frame_data:
                    continue
                
                # Tạo Scene trong DB
                scene = Scene(
                    project_id=project_id,
                    scene_token=f"local-video-{task_id[:12]}-{scene_idx:03d}",
                    name=sname,
                    description=f"Imported from video in {sname}",
                    frame_count=len(frame_data),
                )
                db.add(scene)
                db.flush()
                last_scene_id = scene.id
                total_frames_created += len(frame_data)
                
                # Lưu Frame tương ứng vào DB
                for fd in frame_data:
                    kwargs = {
                        "scene_id": scene.id,
                        "frame_index": fd["frame_index"],
                        "timestamp": fd["timestamp"],
                        field_name: fd["path"],
                    }
                    db.add(Frame(**kwargs))
            
            db.commit()
            _import_status[task_id] = {
                "status": "done",
                "progress": 100,
                "message": f"Hoàn thành! Đã tạo {total_frames_created} khung hình trong {total_scenes} scene.",
                "scene_id": last_scene_id,
                "frame_count": total_frames_created,
            }
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()
            
    except Exception as e:
        _import_status[task_id] = {
            "status": "error",
            "progress": 0,
            "message": f"Lỗi: {str(e)}",
        }


@router.post("/{project_id}/import-local-images")
async def import_local_images(
    project_id: int,
    background_tasks: BackgroundTasks,
    payload: LocalImagesImportRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    task_id = uuid.uuid4().hex
    _import_status[task_id] = {"status": "queued", "progress": 0, "message": "Đang chờ quét thư mục..."}
    background_tasks.add_task(
        _import_local_images_task,
        task_id, project_id,
        payload.folder_path,
        payload.camera_channel
    )
    return {"task_id": task_id, "message": "Đang xử lý trong nền..."}


@router.post("/{project_id}/import-local-video")
async def import_local_video(
    project_id: int,
    background_tasks: BackgroundTasks,
    payload: LocalVideoImportRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    task_id = uuid.uuid4().hex
    _import_status[task_id] = {"status": "queued", "progress": 0, "message": "Đang chờ xử lý video..."}
    background_tasks.add_task(
        _import_local_video_task,
        task_id, project_id,
        payload.folder_path,
        payload.camera_channel,
        payload.fps_target
    )
    return {"task_id": task_id, "message": "Đang xử lý video trong nền..."}


@router.get("/{project_id}/import-status/{task_id}")
def get_generic_import_status(
    project_id: int,
    task_id: str,
    current_user: User = Depends(require_admin),
):
    status = _import_status.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    return status

