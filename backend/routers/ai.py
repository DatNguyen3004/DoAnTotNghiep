from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os

from database import get_db
from models.user import User
from models.frame import Frame
from routers.auth import get_current_user
from services.ai_service import run_inference, get_model, get_model_error
from config import NUSCENES_ROOT

router = APIRouter()

CAMERA_COLUMN_MAP = {
    "CAM_FRONT":       "cam_front",
    "CAM_FRONT_LEFT":  "cam_front_left",
    "CAM_FRONT_RIGHT": "cam_front_right",
    "CAM_BACK":        "cam_back",
    "CAM_BACK_LEFT":   "cam_back_left",
    "CAM_BACK_RIGHT":  "cam_back_right",
}


class PredictRequest(BaseModel):
    frame_id: int
    camera: str
    threshold: Optional[float] = 0.25
    ai_review_threshold: Optional[float] = 0.85


class FlowRequest(BaseModel):
    frame_id_prev: int
    frame_id_next: int
    camera: str
    bboxes: Optional[list] = None  # [{bbox_x, bbox_y, bbox_w, bbox_h}]


# ───────────────────────────────────────────────
# GET /api/ai/status
# ───────────────────────────────────────────────
@router.get("/status")
def ai_status(current_user: User = Depends(get_current_user)):
    """Kiểm tra trạng thái model AI."""
    model = get_model()
    error = get_model_error()
    if model is not None:
        return {"status": "ready", "message": "Model YOLOv8 đã sẵn sàng"}
    elif error:
        return {"status": "error", "message": error}
    else:
        return {"status": "not_loaded", "message": "Model chưa được load"}


# ───────────────────────────────────────────────
# POST /api/ai/predict
# ───────────────────────────────────────────────
@router.post("/predict")
def predict(
    body: PredictRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chạy YOLOv8 inference trên một frame/camera."""
    # Lấy frame
    frame = db.query(Frame).filter(Frame.id == body.frame_id).first()
    if not frame:
        raise HTTPException(status_code=404, detail="Không tìm thấy frame")

    # Lấy đường dẫn ảnh
    camera_upper = body.camera.upper()
    column = CAMERA_COLUMN_MAP.get(camera_upper)
    if not column:
        raise HTTPException(status_code=400, detail=f"Camera không hợp lệ: {body.camera}")

    relative_path = getattr(frame, column, None)
    if not relative_path:
        raise HTTPException(status_code=404, detail=f"Frame không có ảnh cho camera {camera_upper}")

    image_path = os.path.join(NUSCENES_ROOT, relative_path)

    # Chạy inference
    try:
        predictions = run_inference(
            image_path=image_path,
            conf_threshold=body.threshold or 0.25,
            ai_review_threshold=body.ai_review_threshold or 0.85,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi inference: {str(e)}")

    return {
        "frame_id": body.frame_id,
        "camera": camera_upper,
        "predictions": predictions,
        "count": len(predictions),
    }


# ───────────────────────────────────────────────
# POST /api/ai/flow
# ───────────────────────────────────────────────
@router.post("/flow")
def optical_flow(
    body: FlowRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tính vector dịch chuyển trung bình giữa 2 frame liên tiếp."""
    import cv2
    import numpy as np

    camera_upper = body.camera.upper()
    column = CAMERA_COLUMN_MAP.get(camera_upper)
    if not column:
        raise HTTPException(status_code=400, detail=f"Camera không hợp lệ: {body.camera}")

    frame_prev = db.query(Frame).filter(Frame.id == body.frame_id_prev).first()
    frame_next = db.query(Frame).filter(Frame.id == body.frame_id_next).first()
    if not frame_prev or not frame_next:
        raise HTTPException(status_code=404, detail="Không tìm thấy frame")

    path_prev = getattr(frame_prev, column, None)
    path_next = getattr(frame_next, column, None)
    if not path_prev or not path_next:
        return {"dx": 0.0, "dy": 0.0}

    img_prev = cv2.imread(os.path.join(NUSCENES_ROOT, path_prev))
    img_next = cv2.imread(os.path.join(NUSCENES_ROOT, path_next))
    if img_prev is None or img_next is None:
        return {"dx": 0.0, "dy": 0.0}

    h, w = img_prev.shape[:2]
    gray_prev = cv2.cvtColor(img_prev, cv2.COLOR_BGR2GRAY)
    gray_next = cv2.cvtColor(img_next, cv2.COLOR_BGR2GRAY)

    # Tính optical flow (Farneback)
    flow = cv2.calcOpticalFlowFarneback(
        gray_prev, gray_next,
        None, 0.5, 3, 15, 3, 5, 1.2, 0
    )

    # Nếu có bboxes → tính flow riêng cho từng bbox
    if body.bboxes:
        per_bbox = []
        for bb in body.bboxes:
            x1 = max(0, int(bb['bbox_x'] * w))
            y1 = max(0, int(bb['bbox_y'] * h))
            x2 = min(w, int((bb['bbox_x'] + bb['bbox_w']) * w))
            y2 = min(h, int((bb['bbox_y'] + bb['bbox_h']) * h))
            if x2 > x1 and y2 > y1:
                region = flow[y1:y2, x1:x2]
                dx = float(np.median(region[..., 0])) / w
                dy = float(np.median(region[..., 1])) / h
            else:
                dx, dy = 0.0, 0.0
            per_bbox.append({"dx": round(dx, 6), "dy": round(dy, 6)})
        return {"per_bbox": per_bbox}

    # Fallback: vector trung bình toàn ảnh
    dx = float(np.median(flow[..., 0])) / w
    dy = float(np.median(flow[..., 1])) / h
    return {"dx": round(dx, 6), "dy": round(dy, 6)}
