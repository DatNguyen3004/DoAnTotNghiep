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
    from config import NUSCENES_ROOT, NUSCENES_META

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
                _import_nuscenes_to_project(db, project.id, NUSCENES_ROOT, NUSCENES_META)
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
    scene_name: str,
    scene_desc: str,
    video_paths: dict,   # {camera_channel: filepath}
    fps_target: float,
):
    """Background task: cắt frame từ video và lưu vào DB."""
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
        expected_count = max(1, total_frames // frame_interval)

        # Tạo thư mục lưu frame cho scene này
        scene_dir = os.path.join(FRAME_UPLOAD_DIR, f"proj{project_id}_{task_id[:8]}")
        os.makedirs(scene_dir, exist_ok=True)

        # Mở tất cả video cùng lúc
        caps = {}
        for cam, path in video_paths.items():
            caps[cam] = cv2.VideoCapture(path)

        # Cắt frame
        frame_data = []  # list of {frame_index, timestamp, cam_paths}
        frame_index = 0
        raw_index = 0

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
                cam_paths = {}
                for cam, frame in frames_read.items():
                    fname = f"{cam}_{frame_index:06d}.jpg"
                    fpath = os.path.join(scene_dir, fname)
                    cv2.imwrite(fpath, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                    # Lưu đường dẫn tương đối từ static/
                    cam_paths[cam] = f"uploads/frames/proj{project_id}_{task_id[:8]}/{fname}"

                frame_data.append({
                    "frame_index": frame_index,
                    "timestamp": int((raw_index / src_fps) * 1e6),  # microseconds
                    "cam_paths": cam_paths,
                })
                frame_index += 1

                # Cập nhật progress
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
            scene = Scene(
                project_id=project_id,
                scene_token=f"video-{task_id[:16]}",
                name=scene_name or f"Video Import {task_id[:8]}",
                description=scene_desc or f"Imported from video, {frame_index} frames",
                frame_count=frame_index,
            )
            db.add(scene)
            db.flush()

            cam_field_map = {
                "CAM_FRONT": "cam_front",
                "CAM_FRONT_LEFT": "cam_front_left",
                "CAM_FRONT_RIGHT": "cam_front_right",
                "CAM_BACK": "cam_back",
                "CAM_BACK_LEFT": "cam_back_left",
                "CAM_BACK_RIGHT": "cam_back_right",
            }

            for fd in frame_data:
                kwargs = {
                    "scene_id": scene.id,
                    "frame_index": fd["frame_index"],
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
                "message": f"Hoàn thành! Đã tạo {frame_index} khung hình.",
                "scene_id": scene.id,
                "frame_count": frame_index,
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
    scene_name: Optional[str] = None,
    scene_desc: Optional[str] = None,
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
        scene_name or project.name,
        scene_desc or "",
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
    """Background task: tạo scene + frame từ danh sách ảnh đã lưu."""
    try:
        _import_status[task_id] = {"status": "running", "progress": 5, "message": "Đang xử lý ảnh..."}

        total = len(image_paths)
        if total == 0:
            _import_status[task_id] = {"status": "error", "progress": 0, "message": "Không tìm thấy ảnh hợp lệ."}
            return

        db = SessionLocal()
        try:
            scene_token = f"images-{task_id[:16]}"
            scene = Scene(
                project_id=project_id,
                scene_token=scene_token,
                name=scene_name or f"Image Import {task_id[:8]}",
                description=f"Imported {total} images",
                frame_count=total,
            )
            db.add(scene)
            db.flush()

            for idx, (orig_name, saved_path) in enumerate(image_paths):
                # Lưu đường dẫn tương đối từ static/
                rel_path = os.path.relpath(saved_path, "static").replace("\\", "/")
                db.add(Frame(
                    scene_id=scene.id,
                    frame_index=idx,
                    cam_front=rel_path,
                ))
                progress = 5 + int((idx + 1) / total * 90)
                _import_status[task_id]["progress"] = progress
                _import_status[task_id]["message"] = f"Đã xử lý {idx + 1}/{total} ảnh..."

            db.commit()
            _import_status[task_id] = {
                "status": "done",
                "progress": 100,
                "message": f"Hoàn thành! Đã tạo {total} khung hình.",
                "scene_id": scene.id,
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
    scene_name: Optional[str] = None,
    files: Optional[List[UploadFile]] = File(None),
    zip_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Upload nhiều ảnh (hoặc 1 file ZIP chứa ảnh) và tạo scene mới."""
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    if not files and not zip_file:
        raise HTTPException(status_code=400, detail="Vui lòng upload ít nhất 1 file ảnh hoặc file ZIP")

    task_id = uuid.uuid4().hex
    scene_token_short = task_id[:8]
    save_dir = os.path.join(IMAGE_UPLOAD_DIR, f"{project_id}_{scene_token_short}")
    os.makedirs(save_dir, exist_ok=True)

    image_paths = []  # list of (original_filename, saved_filepath)

    try:
        if zip_file is not None:
            # Giải nén ZIP và lấy ảnh
            ext = os.path.splitext(zip_file.filename or "")[1].lower()
            if ext != ".zip":
                raise HTTPException(status_code=400, detail="zip_file phải là file .zip")
            zip_bytes = await zip_file.read()
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                members = sorted([
                    m for m in zf.namelist()
                    if os.path.splitext(m)[1].lower() in IMAGE_EXTENSIONS
                    and not os.path.basename(m).startswith(".")
                    and not m.endswith("/")
                ])
                for member in members:
                    basename = os.path.basename(member)
                    if not basename:
                        continue
                    safe_name = f"{uuid.uuid4().hex[:8]}_{basename}"
                    dest = os.path.join(save_dir, safe_name)
                    with zf.open(member) as src, open(dest, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    image_paths.append((basename, dest))

        if files:
            for upload in files:
                ext = os.path.splitext(upload.filename or "")[1].lower()
                if ext not in IMAGE_EXTENSIONS:
                    continue  # bỏ qua file không phải ảnh
                safe_name = f"{uuid.uuid4().hex[:8]}_{upload.filename}"
                dest = os.path.join(save_dir, safe_name)
                with open(dest, "wb") as f:
                    shutil.copyfileobj(upload.file, f)
                image_paths.append((upload.filename, dest))

        # Sort theo tên gốc để đảm bảo thứ tự frame
        image_paths.sort(key=lambda x: x[0])

        if not image_paths:
            raise HTTPException(status_code=400, detail="Không tìm thấy ảnh hợp lệ trong file đã upload")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý file: {str(e)}")

    _import_status[task_id] = {"status": "queued", "progress": 0, "message": "Đang chờ xử lý..."}

    background_tasks.add_task(
        _import_images_task,
        task_id,
        project_id,
        scene_name or project.name,
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


# ── Image Import ──────────────────────────────────────────────────────────────

IMAGE_UPLOAD_DIR = "static/uploads/images"
os.makedirs(IMAGE_UPLOAD_DIR, exist_ok=True)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}


def _import_images_task(
    task_id: str,
    project_id: int,
    scene_name: str,
    image_paths: list,  # list of (original_filename, saved_filepath)
):
    """Background task: tạo scene + frame từ danh sách ảnh đã lưu."""
    try:
        _import_status[task_id] = {"status": "running", "progress": 5, "message": "Đang xử lý ảnh..."}
        total = len(image_paths)
        if total == 0:
            _import_status[task_id] = {"status": "error", "progress": 0, "message": "Không tìm thấy ảnh hợp lệ."}
            return

        db = SessionLocal()
        try:
            scene = Scene(
                project_id=project_id,
                scene_token=f"images-{task_id[:16]}",
                name=scene_name or f"Image Import {task_id[:8]}",
                description=f"Imported {total} images",
                frame_count=total,
            )
            db.add(scene)
            db.flush()

            for idx, (orig_name, saved_path) in enumerate(image_paths):
                rel_path = os.path.relpath(saved_path, "static").replace("\\", "/")
                db.add(Frame(
                    scene_id=scene.id,
                    frame_index=idx,
                    cam_front=rel_path,
                ))
                _import_status[task_id]["progress"] = 5 + int((idx + 1) / total * 90)
                _import_status[task_id]["message"] = f"Đã xử lý {idx + 1}/{total} ảnh..."

            db.commit()
            _import_status[task_id] = {
                "status": "done",
                "progress": 100,
                "message": f"Hoàn thành! Đã tạo {total} khung hình.",
                "scene_id": scene.id,
                "frame_count": total,
            }
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    except Exception as e:
        _import_status[task_id] = {"status": "error", "progress": 0, "message": f"Lỗi: {str(e)}"}


@router.post("/{project_id}/import-images")
async def import_images(
    project_id: int,
    background_tasks: BackgroundTasks,
    scene_name: Optional[str] = None,
    files: Optional[List[UploadFile]] = File(None),
    zip_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Upload nhiều ảnh (hoặc 1 file ZIP chứa ảnh) và tạo scene mới."""
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    if not files and not zip_file:
        raise HTTPException(status_code=400, detail="Vui lòng upload ít nhất 1 file ảnh hoặc file ZIP")

    task_id = uuid.uuid4().hex
    save_dir = os.path.join(IMAGE_UPLOAD_DIR, f"{project_id}_{task_id[:8]}")
    os.makedirs(save_dir, exist_ok=True)

    image_paths = []
    try:
        if zip_file is not None:
            ext = os.path.splitext(zip_file.filename or "")[1].lower()
            if ext != ".zip":
                raise HTTPException(status_code=400, detail="zip_file phải là file .zip")
            zip_bytes = await zip_file.read()
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                members = sorted([
                    m for m in zf.namelist()
                    if os.path.splitext(m)[1].lower() in IMAGE_EXTENSIONS
                    and not os.path.basename(m).startswith(".")
                    and not m.endswith("/")
                ])
                for member in members:
                    basename = os.path.basename(member)
                    if not basename:
                        continue
                    safe_name = f"{uuid.uuid4().hex[:8]}_{basename}"
                    dest = os.path.join(save_dir, safe_name)
                    with zf.open(member) as src, open(dest, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    image_paths.append((basename, dest))

        if files:
            for upload in files:
                ext = os.path.splitext(upload.filename or "")[1].lower()
                if ext not in IMAGE_EXTENSIONS:
                    continue
                safe_name = f"{uuid.uuid4().hex[:8]}_{upload.filename}"
                dest = os.path.join(save_dir, safe_name)
                with open(dest, "wb") as f:
                    shutil.copyfileobj(upload.file, f)
                image_paths.append((upload.filename, dest))

        image_paths.sort(key=lambda x: x[0])

        if not image_paths:
            raise HTTPException(status_code=400, detail="Không tìm thấy ảnh hợp lệ trong file đã upload")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý file: {str(e)}")

    _import_status[task_id] = {"status": "queued", "progress": 0, "message": "Đang chờ xử lý..."}
    background_tasks.add_task(_import_images_task, task_id, project_id, scene_name or project.name, image_paths)
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
