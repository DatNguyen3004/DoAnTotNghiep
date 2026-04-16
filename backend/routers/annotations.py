from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.user import User
from models.task import Task
from models.annotation import Annotation
from schemas.task import AnnotationSave, AnnotationOut
from routers.auth import get_current_user

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

    # Insert new annotations
    new_annotations = []
    for ann in body.annotations:
        db_ann = Annotation(
            task_id=task_id,
            frame_id=body.frame_id,
            camera=ann.camera,
            category=ann.category,
            bbox_x=ann.bbox_x,
            bbox_y=ann.bbox_y,
            bbox_w=ann.bbox_w,
            bbox_h=ann.bbox_h,
            confidence=ann.confidence,
            is_ai_generated=ann.is_ai_generated,
            needs_review=ann.needs_review,
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
