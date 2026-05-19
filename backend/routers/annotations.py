from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import os

from database import get_db
from models.user import User
from models.task import Task
from models.annotation import Annotation
from models.frame import Frame
from schemas.task import AnnotationSave, AnnotationOut
from routers.auth import get_current_user
from services.ai_service import run_inference
import config as _cfg
from services.video_dataset import get_video_frame_path

CAMERA_COLUMN_MAP = {
    "CAM_FRONT":       "cam_front",
    "CAM_FRONT_LEFT":  "cam_front_left",
    "CAM_FRONT_RIGHT": "cam_front_right",
    "CAM_BACK":        "cam_back",
    "CAM_BACK_LEFT":   "cam_back_left",
    "CAM_BACK_RIGHT":  "cam_back_right",
}

def get_ai_predictions_for_frame_cam(db: Session, frame_id: int, camera: str) -> list:
    """Chạy YOLOv8 inference trên một frame/camera để lấy danh sách dự đoán của AI."""
    frame = db.query(Frame).filter(Frame.id == frame_id).first()
    if not frame:
        return []

    camera_upper = camera.upper()
    column = CAMERA_COLUMN_MAP.get(camera_upper)
    if not column:
        return []

    relative_path = getattr(frame, column, None)
    if not relative_path:
        return []

    nuscenes_root = _cfg.NUSCENES_ROOT

    # Intercept for video-based nuScenes dataset
    video_frame_path = get_video_frame_path(
        nuscenes_root,
        frame.scene.name,
        camera_upper,
        frame.frame_index
    )
    if video_frame_path:
        image_path = video_frame_path
    else:
        if relative_path.startswith("uploads/"):
            image_path = os.path.join("static", relative_path)
        else:
            image_path = os.path.join(nuscenes_root, relative_path)

    try:
        predictions = run_inference(
            image_path=image_path,
            conf_threshold=0.25,
            ai_review_threshold=0.85,
        )
        return predictions
    except Exception as e:
        print(f"Error running inference for frame {frame_id} {camera}: {e}")
        return []

router = APIRouter()


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}/annotations
# ───────────────────────────────────────────────
@router.get("/tasks/{task_id}/annotations", response_model=List[AnnotationOut])
def get_task_annotations(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lấy tất cả annotation của một task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    annotations = (
        db.query(Annotation)
        .filter(Annotation.task_id == task_id)
        .order_by(Annotation.frame_id, Annotation.camera, Annotation.id)
        .all()
    )
    return annotations


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}/annotations/{frame_id}
# ───────────────────────────────────────────────
@router.get("/tasks/{task_id}/annotations/{frame_id}", response_model=List[AnnotationOut])
def get_frame_annotations(
    task_id: int,
    frame_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lấy annotation theo frame cụ thể."""
    annotations = (
        db.query(Annotation)
        .filter(
            Annotation.task_id == task_id,
            Annotation.frame_id == frame_id,
        )
        .order_by(Annotation.camera, Annotation.id)
        .all()
    )
    return annotations


# ───────────────────────────────────────────────
# POST /api/tasks/{task_id}/annotations
# ───────────────────────────────────────────────
@router.post("/tasks/{task_id}/annotations")
def save_annotations(
    task_id: int,
    body: AnnotationSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lưu / cập nhật annotation (upsert theo frame).
    Xóa annotation cũ của frame, insert mới.
    Tự động chuyển status pending → in_progress.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    # Only assigned labeler or admin can save annotations
    if task.assigned_to != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bạn không có quyền chỉnh sửa annotation cho task này")

    # Delete old annotations for this frame
    db.query(Annotation).filter(
        Annotation.task_id == task_id,
        Annotation.frame_id == body.frame_id,
    ).delete()

    # Group annotations by camera to fetch predictions if needed
    annotations_by_cam = {}
    for ann in body.annotations:
        cam = ann.camera
        if cam not in annotations_by_cam:
            annotations_by_cam[cam] = []
        annotations_by_cam[cam].append(ann)

    # IoU helper in python
    def py_iou(boxA, boxB):
        ax1, ay1 = boxA["bbox_x"], boxA["bbox_y"]
        ax2, ay2 = boxA["bbox_x"] + boxA["bbox_w"], boxA["bbox_y"] + boxA["bbox_h"]
        bx1, by1 = boxB["bbox_x"], boxB["bbox_y"]
        bx2, by2 = boxB["bbox_x"] + boxB["bbox_w"], boxB["bbox_y"] + boxB["bbox_h"]
        
        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)
        
        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0
        inter = (ix2 - ix1) * (iy2 - iy1)
        union = (boxA["bbox_w"] * boxA["bbox_h"]) + (boxB["bbox_w"] * boxB["bbox_h"]) - inter
        return inter / union if union > 0.0 else 0.0

    # Get predictions for each camera if there is any manual annotation
    ai_predictions_cache = {}
    for cam, anns in annotations_by_cam.items():
        # Check if any annotation in this camera needs AI matching
        needs_ai_inference = any(
            not getattr(ann, "is_ai_generated", False) or getattr(ann, "ai_bbox_x", None) is None
            for ann in anns
        )
        if needs_ai_inference:
            ai_predictions_cache[cam] = get_ai_predictions_for_frame_cam(db, body.frame_id, cam)
        else:
            ai_predictions_cache[cam] = []

    # Insert new annotations
    new_annotations = []
    for cam, anns in annotations_by_cam.items():
        preds = ai_predictions_cache.get(cam, [])
        used_pred_indices = set()
        
        for ann in anns:
            is_ai = ann.is_ai_generated or False
            ai_x = ann.ai_bbox_x
            ai_y = ann.ai_bbox_y
            ai_w = ann.ai_bbox_w
            ai_h = ann.ai_bbox_h
            conf = ann.confidence
            needs_rev = ann.needs_review
            
            # Nếu là nhãn thủ công hoặc nhãn AI chưa có tọa độ AI gốc, hãy thử tìm đối sánh
            if not is_ai or ai_x is None:
                best_match = None
                best_iou = 0.1  # threshold
                best_idx = -1
                
                boxA = {
                    "bbox_x": ann.bbox_x,
                    "bbox_y": ann.bbox_y,
                    "bbox_w": ann.bbox_w,
                    "bbox_h": ann.bbox_h
                }
                
                for idx, p in enumerate(preds):
                    if p["category"] == ann.category and idx not in used_pred_indices:
                        iou_val = py_iou(boxA, p)
                        if iou_val > best_iou:
                            best_iou = iou_val
                            best_match = p
                            best_idx = idx
                
                if best_match:
                    is_ai = True
                    ai_x = best_match["bbox_x"]
                    ai_y = best_match["bbox_y"]
                    ai_w = best_match["bbox_w"]
                    ai_h = best_match["bbox_h"]
                    conf = best_match["confidence"]
                    needs_rev = best_match["needs_review"]
                    used_pred_indices.add(best_idx)
            
            db_ann = Annotation(
                task_id=task_id,
                frame_id=body.frame_id,
                camera=ann.camera,
                category=ann.category,
                bbox_x=ann.bbox_x,
                bbox_y=ann.bbox_y,
                bbox_w=ann.bbox_w,
                bbox_h=ann.bbox_h,
                confidence=conf,
                is_ai_generated=is_ai,
                ai_bbox_x=ai_x if ai_x is not None else (ann.bbox_x if is_ai else None),
                ai_bbox_y=ai_y if ai_y is not None else (ann.bbox_y if is_ai else None),
                ai_bbox_w=ai_w if ai_w is not None else (ann.bbox_w if is_ai else None),
                ai_bbox_h=ai_h if ai_h is not None else (ann.bbox_h if is_ai else None),
                needs_review=needs_rev,
                track_id=ann.track_id,
                custom_name=ann.custom_name,
            )
            db.add(db_ann)
            new_annotations.append(db_ann)

    # Auto-update status: pending → in_progress
    if task.status == "pending":
        task.status = "in_progress"

    db.commit()

    return {
        "message": f"Đã lưu {len(new_annotations)} annotation cho frame {body.frame_id}",
        "count": len(new_annotations),
    }


# ───────────────────────────────────────────────
# DELETE /api/annotations/{annotation_id}
# ───────────────────────────────────────────────
@router.delete("/annotations/{annotation_id}")
def delete_annotation(
    annotation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Xóa một annotation cụ thể."""
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Không tìm thấy annotation")

    # Check permission via task
    task = db.query(Task).filter(Task.id == annotation.task_id).first()
    if task and task.assigned_to != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa annotation này")

    db.delete(annotation)
    db.commit()
    return {"message": "Đã xóa annotation"}
