from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import os, shutil, zipfile
from pathlib import Path

from models.user import User
from routers.auth import require_admin

router = APIRouter()

ENV_PATH = Path(__file__).parent.parent / ".env"
NUSCENES_UPLOAD_DIR = "static/uploads/nuscenes"
os.makedirs(NUSCENES_UPLOAD_DIR, exist_ok=True)

# Trạng thái giải nén đang chạy
_extract_status: dict = {}


def _read_env() -> dict:
    env = {}
    if ENV_PATH.exists():
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip()
    return env


def _write_env(env: dict):
    lines = []
    for k, v in env.items():
        lines.append(f"{k}={v}")
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def _apply_nuscenes_root(path: str):
    """Cập nhật NUSCENES_ROOT trong .env và runtime."""
    env = _read_env()
    env["NUSCENES_ROOT"] = path
    _write_env(env)
    import config as cfg
    cfg.NUSCENES_ROOT = path
    cfg.NUSCENES_META = os.path.join(path, "v1.0-mini")


def _extract_nuscenes_task(task_id: str, zip_path: str, extract_dir: str):
    """Background task: giải nén ZIP/TGZ nuScenes, xóa bộ dữ liệu cũ trước."""
    try:
        _extract_status[task_id] = {"status": "running", "progress": 0, "message": "Đang chuẩn bị..."}

        # Xóa các thư mục nuScenes cũ (trừ thư mục đang giải nén)
        for item in os.listdir(NUSCENES_UPLOAD_DIR):
            item_path = os.path.join(NUSCENES_UPLOAD_DIR, item)
            if os.path.isdir(item_path) and item != task_id:
                shutil.rmtree(item_path, ignore_errors=True)

        _extract_status[task_id]["message"] = "Đang giải nén..."

        fname = zip_path.lower()
        is_tar = fname.endswith(".tgz") or fname.endswith(".tar.gz")

        if is_tar:
            import tarfile
            with tarfile.open(zip_path, 'r:gz') as tf:
                members = tf.getmembers()
                total = len(members)
                for i, member in enumerate(members):
                    tf.extract(member, extract_dir, filter='data')
                    if i % 100 == 0:
                        _extract_status[task_id]["progress"] = int(i / total * 90)
                        _extract_status[task_id]["message"] = f"Đã giải nén {i}/{total} file..."
        else:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                members = zf.namelist()
                total = len(members)
                for i, member in enumerate(members):
                    zf.extract(member, extract_dir)
                    if i % 100 == 0:
                        _extract_status[task_id]["progress"] = int(i / total * 90)
                        _extract_status[task_id]["message"] = f"Đã giải nén {i}/{total} file..."

        # Tìm thư mục chứa v1.0-mini
        nuscenes_root = None
        for root, dirs, files in os.walk(extract_dir):
            if "v1.0-mini" in dirs:
                nuscenes_root = root
                break

        if not nuscenes_root and os.path.isdir(os.path.join(extract_dir, "v1.0-mini")):
            nuscenes_root = extract_dir

        if not nuscenes_root:
            _extract_status[task_id] = {
                "status": "error", "progress": 0,
                "message": "Không tìm thấy thư mục v1.0-mini trong file. Đảm bảo đây là nuScenes mini đúng cấu trúc."
            }
            return

        try:
            os.remove(zip_path)
        except Exception:
            pass

        # Cập nhật config — dùng đường dẫn tuyệt đối
        _apply_nuscenes_root(os.path.abspath(nuscenes_root))

        nuscenes_root_abs = os.path.abspath(nuscenes_root)
        _extract_status[task_id] = {
            "status": "done", "progress": 100,
            "message": "Hoàn thành! Bộ dữ liệu nuScenes đã sẵn sàng.",
            "nuscenes_root": nuscenes_root_abs,
        }

    except Exception as e:
        _extract_status[task_id] = {"status": "error", "progress": 0, "message": f"Lỗi: {str(e)}"}
        try:
            os.remove(zip_path)
        except Exception:
            pass


class NuScenesConfig(BaseModel):
    nuscenes_root: str


class NuScenesConfigOut(BaseModel):
    nuscenes_root: str
    is_valid: bool
    message: str


@router.get("/config/nuscenes", response_model=NuScenesConfigOut)
def get_nuscenes_config(current_user: User = Depends(require_admin)):
    """Lấy cấu hình đường dẫn nuScenes hiện tại."""
    import config as _cfg
    nuscenes_root = _cfg.NUSCENES_ROOT
    is_valid = os.path.isdir(nuscenes_root)
    meta_path = os.path.join(nuscenes_root, "v1.0-mini")
    if is_valid and not os.path.isdir(meta_path):
        is_valid = False
        message = "Thư mục tồn tại nhưng không tìm thấy v1.0-mini bên trong"
    elif is_valid:
        message = "Đường dẫn hợp lệ"
    else:
        message = "Đường dẫn không tồn tại hoặc không hợp lệ"
    return NuScenesConfigOut(nuscenes_root=nuscenes_root, is_valid=is_valid, message=message)


@router.put("/config/nuscenes")
def update_nuscenes_config(
    body: NuScenesConfig,
    current_user: User = Depends(require_admin),
):
    """Cập nhật đường dẫn nuScenes và reload config runtime."""
    path = body.nuscenes_root.strip()

    # Validate đường dẫn
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Đường dẫn không tồn tại: {path}")

    meta_path = os.path.join(path, "v1.0-mini")
    if not os.path.isdir(meta_path):
        raise HTTPException(
            status_code=400,
            detail=f"Không tìm thấy thư mục v1.0-mini trong {path}. Đảm bảo đây là thư mục gốc nuScenes mini."
        )

    # Ghi vào .env
    env = _read_env()
    env["NUSCENES_ROOT"] = path
    _write_env(env)

    # Reload config runtime (không cần restart server)
    import config as cfg
    cfg.NUSCENES_ROOT = path
    cfg.NUSCENES_META = os.path.join(path, "v1.0-mini")

    return {
        "message": "Đã cập nhật đường dẫn nuScenes thành công",
        "nuscenes_root": path,
        "is_valid": True,
    }

import uuid

@router.post("/upload-nuscenes")
async def upload_nuscenes_zip(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
):
    """Upload file ZIP/TGZ nuScenes mini, giải nén và cấu hình tự động."""
    filename = file.filename or ""
    ext = filename.lower()
    if not (ext.endswith(".zip") or ext.endswith(".tgz") or ext.endswith(".tar.gz")):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file .zip, .tgz hoặc .tar.gz")

    task_id = uuid.uuid4().hex
    # Lưu với đúng extension
    if ext.endswith(".tar.gz"):
        save_ext = ".tar.gz"
    elif ext.endswith(".tgz"):
        save_ext = ".tgz"
    else:
        save_ext = ".zip"

    archive_path = os.path.join(NUSCENES_UPLOAD_DIR, f"nuscenes_{task_id}{save_ext}")
    extract_dir = os.path.join(NUSCENES_UPLOAD_DIR, task_id)
    os.makedirs(extract_dir, exist_ok=True)

    _extract_status[task_id] = {"status": "uploading", "progress": 0, "message": "Đang nhận file..."}
    with open(archive_path, "wb") as f:
        import shutil as _shutil
        _shutil.copyfileobj(file.file, f)

    background_tasks.add_task(_extract_nuscenes_task, task_id, archive_path, extract_dir)
    return {"task_id": task_id, "message": "Đang giải nén trong nền..."}


@router.get("/upload-nuscenes/status/{task_id}")
def get_upload_status(task_id: str, current_user: User = Depends(require_admin)):
    status = _extract_status.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    return status
