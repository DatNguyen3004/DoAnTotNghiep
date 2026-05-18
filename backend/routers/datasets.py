import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from PIL import Image
import io

from database import get_db
from models.user import User
from models.scene import Scene
from models.frame import Frame
from schemas.dataset import SceneOut, FrameOut, FrameMetadata
from routers.auth import get_current_user
from config import NUSCENES_ROOT as _NUSCENES_ROOT_INIT
import config as _cfg
from services.video_dataset import get_video_frame_path

# Luôn đọc runtime để phản ánh cập nhật từ Settings
def _get_nuscenes_root():
    return _cfg.NUSCENES_ROOT

router = APIRouter()


def _placeholder_response(camera_label: str) -> StreamingResponse:
    """Tạo ảnh placeholder nền xám với tên camera ở giữa."""
    img = Image.new("RGB", (1600, 900), color=(226, 232, 240))
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(img)
    cx, cy = 800, 450

    # Icon camera đơn giản — nét đậm, màu đen
    lw = 8
    draw.rectangle([cx-100, cy-80, cx+100, cy+70], outline=(0, 0, 0), width=lw)
    draw.ellipse([cx-38, cy-38, cx+38, cy+38], outline=(0, 0, 0), width=lw-2)
    draw.rectangle([cx+72, cy-100, cx+112, cy-62], fill=(0, 0, 0))

    # Chữ "Không có dữ liệu" — to, đậm, màu đen
    main_text = "Không có dữ liệu"
    try:
        font_big = ImageFont.truetype("arial.ttf", 72)
    except Exception:
        font_big = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), main_text, font=font_big)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, cy + 110), main_text, fill=(0, 0, 0), font=font_big)

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg",
                             headers={"Cache-Control": "no-cache", "X-No-Data": "1"})

CAMERA_COLUMNS = [
    "cam_front", "cam_front_left", "cam_front_right",
    "cam_back", "cam_back_left", "cam_back_right",
]

CAMERA_CHANNEL_MAP = {
    "CAM_FRONT":       "cam_front",
    "CAM_FRONT_LEFT":  "cam_front_left",
    "CAM_FRONT_RIGHT": "cam_front_right",
    "CAM_BACK":        "cam_back",
    "CAM_BACK_LEFT":   "cam_back_left",
    "CAM_BACK_RIGHT":  "cam_back_right",
}


# ───────────────────────────────────────────────
# PUT /api/scenes/{scene_id}  (Admin only)
# ───────────────────────────────────────────────
@router.put("/scenes/{scene_id}")
def update_scene(
    scene_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin cập nhật tên và mô tả scene."""
    from routers.auth import require_admin
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Chỉ admin mới có quyền sửa")
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Không tìm thấy scene")
    if "name" in body:
        scene.name = body["name"]
    if "description" in body:
        scene.description = body["description"]
    db.commit()
    db.refresh(scene)
    return {"id": scene.id, "name": scene.name, "description": scene.description}


# ───────────────────────────────────────────────
# GET /api/projects/{project_id}/scenes
# ───────────────────────────────────────────────
@router.get("/projects/{project_id}/scenes", response_model=List[SceneOut])
def list_scenes(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Danh sách scene trong project (sắp xếp theo tên)."""
    scenes = (
        db.query(Scene)
        .filter(Scene.project_id == project_id)
        .order_by(Scene.scene_token)
        .all()
    )
    return scenes


# ───────────────────────────────────────────────
# GET /api/scenes/{scene_id}/frames
# ───────────────────────────────────────────────
@router.get("/scenes/{scene_id}/frames", response_model=List[FrameOut])
def list_frames(
    scene_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Danh sách frame trong scene (sắp xếp theo frame_index)."""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Không tìm thấy scene")

    frames = (
        db.query(Frame)
        .filter(Frame.scene_id == scene_id)
        .order_by(Frame.frame_index)
        .all()
    )
    return frames


# ───────────────────────────────────────────────
# GET /api/frames/{frame_id}/metadata
# ───────────────────────────────────────────────
@router.get("/frames/{frame_id}/metadata", response_model=FrameMetadata)
def get_frame_metadata(
    frame_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Metadata của một frame bao gồm đường dẫn 6 camera."""
    frame = db.query(Frame).filter(Frame.id == frame_id).first()
    if not frame:
        raise HTTPException(status_code=404, detail="Không tìm thấy frame")

    cameras = {}
    for channel, column in CAMERA_CHANNEL_MAP.items():
        cameras[channel] = getattr(frame, column, None)

    return FrameMetadata(
        id=frame.id,
        scene_id=frame.scene_id,
        frame_index=frame.frame_index,
        timestamp=frame.timestamp,
        cameras=cameras,
    )


# ───────────────────────────────────────────────
# GET /api/frames/{frame_id}/image/{camera}
# ───────────────────────────────────────────────
@router.get("/frames/{frame_id}/image/{camera}")
def get_frame_image(
    frame_id: int,
    camera: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trả về file ảnh camera (binary) từ nuScenes dataset trên disk."""
    # Validate camera channel
    camera_upper = camera.upper()
    column = CAMERA_CHANNEL_MAP.get(camera_upper)
    if not column:
        raise HTTPException(
            status_code=400,
            detail=f"Camera không hợp lệ. Phải là một trong: {list(CAMERA_CHANNEL_MAP.keys())}",
        )

    frame = db.query(Frame).filter(Frame.id == frame_id).first()
    if not frame:
        raise HTTPException(status_code=404, detail="Không tìm thấy frame")

    # Intercept for video-based nuScenes dataset
    video_frame_path = get_video_frame_path(
        _get_nuscenes_root(),
        frame.scene.name,
        camera_upper,
        frame.frame_index
    )
    if video_frame_path:
        image_path = video_frame_path
    else:
        relative_path = getattr(frame, column, None)
        if not relative_path:
            # Trả về ảnh placeholder cho camera không có dữ liệu
            return _placeholder_response(camera_upper)

        # Xây dựng đường dẫn tuyệt đối đến file ảnh trên disk
        # nuScenes lưu filename dạng: samples/CAM_FRONT/xxx.jpg
        # Upload ảnh/video lưu dạng: uploads/images/... hoặc uploads/frames/...
        if relative_path.startswith("uploads/"):
            image_path = os.path.join("static", relative_path)
        else:
            image_path = os.path.join(_get_nuscenes_root(), relative_path)

    if not os.path.isfile(image_path):
        return _placeholder_response(camera_upper)

    return FileResponse(
        image_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},  # cache 24h
    )

# ───────────────────────────────────────────────
# GET /api/frames/{frame_id}/thumb/{camera}
# ───────────────────────────────────────────────
@router.get("/frames/{frame_id}/thumb/{camera}")
def get_frame_thumbnail(
    frame_id: int,
    camera: str,
    width: int = 400,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trả về ảnh thu nhỏ (thumbnail) đã nén để tối ưu tốc độ Dashboard."""
    camera_upper = camera.upper()
    column = CAMERA_CHANNEL_MAP.get(camera_upper)
    if not column:
        raise HTTPException(status_code=400, detail="Camera invalid")

    frame = db.query(Frame).filter(Frame.id == frame_id).first()
    if not frame:
        raise HTTPException(status_code=404, detail="Frame not found")

    # Intercept for video-based nuScenes dataset
    video_frame_path = get_video_frame_path(
        _get_nuscenes_root(),
        frame.scene.name,
        camera_upper,
        frame.frame_index
    )
    if video_frame_path:
        image_path = video_frame_path
    else:
        relative_path = getattr(frame, column, None)
        if not relative_path:
            return _placeholder_response(camera_upper)

        image_path = os.path.join(_get_nuscenes_root(), relative_path) if not relative_path.startswith("uploads/") else os.path.join("static", relative_path)

    # Xử lý nén bằng Pillow
    try:
        with Image.open(image_path) as img:
            # Resize giữ tỷ lệ
            ratio = width / float(img.size[0])
            height = int((float(img.size[1]) * float(ratio)))
            img = img.resize((width, height), Image.BILINEAR)
            
            # Nén và lưu vào buffer
            img_io = io.BytesIO()
            img.save(img_io, 'JPEG', quality=60) # Bỏ optimize=True để lưu nhanh hơn
            img_io.seek(0)
            
            return StreamingResponse(
                img_io, 
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=604800"} # Cache 7 ngày
            )
    except Exception as e:
        # Fallback về ảnh gốc nếu lỗi xử lý
        return FileResponse(image_path, media_type="image/jpeg")
