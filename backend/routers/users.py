from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import shutil

from database import get_db
from models.user import User
from models.project import ProjectMember
from schemas.user import UserCreate, UserUpdate, UserOut
from routers.auth import get_current_user, require_admin
from services.auth_service import hash_password

router = APIRouter()

@router.post("/upload-avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    # Ensure uploads directory exists
    upload_dir = "static/uploads/avatars"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)

    file_extension = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"url": f"/uploads/avatars/{filename}"}

@router.get("", response_model=List[UserOut])
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return db.query(User).filter(User.is_active == True).all()

@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    return user

@router.post("", response_model=UserOut)
def create_user(
    body: UserCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Tên đăng nhập đã tồn tại")
    if body.role not in ["admin", "user"]:
        raise HTTPException(status_code=400, detail="Role không hợp lệ")

    user = User(
        username=body.username,
        full_name=body.full_name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Chỉ cho phép tự sửa hoặc Admin sửa người khác
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Không có quyền chỉnh sửa")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    if body.full_name is not None: user.full_name = body.full_name
    if body.email is not None:     user.email = body.email
    if body.phone is not None:     user.phone = body.phone
    if body.address is not None:   user.address = body.address
    if body.gender is not None:    user.gender = body.gender
    if body.birth_date is not None: user.birth_date = body.birth_date
    if body.avatar_url is not None: user.avatar_url = body.avatar_url
    if body.new_password:
        user.password_hash = hash_password(body.new_password)

    db.commit()
    db.refresh(user)
    return user

@router.get("/{user_id}/stats")
def get_user_stats(
    user_id: int,
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Thống kê chất lượng gán nhãn và kiểm thử của một user."""
    from models.task import Task
    from sqlalchemy import func

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    # ── Thống kê gán nhãn (labeler) ──
    query = db.query(Task).filter(Task.assigned_to == user_id)
    if project_id is not None:
        query = query.filter(Task.project_id == project_id)
    tasks = query.all()

    total = len(tasks)
    # Admin-evaluated counts
    admin_approved_count = sum(1 for t in tasks if t.status in ('approved', 'rejected'))  # Đã duyệt (Admin ra quyết định)
    admin_rejected_count = sum(1 for t in tasks if t.status == 'rejected')   # Chưa đạt
    # Reviewer approved but not yet admin-evaluated → Đã nộp
    reviewer_approved_count = sum(1 for t in tasks if t.status in ('reviewed', 'under_review', 'submitted'))
    in_progress = sum(1 for t in tasks if t.status == 'in_progress')
    pending = sum(1 for t in tasks if t.status == 'pending')
    # Keep legacy fields for compatibility
    approved = sum(1 for t in tasks if t.status == 'approved')   # Chỉ Đạt yêu cầu
    rejected = admin_rejected_count
    submitted = sum(1 for t in tasks if t.status in ('submitted', 'under_review', 'approved', 'rejected', 'reviewed'))

    total_rejects = sum((t.reject_count or 0) for t in tasks)
    total_submissions = submitted + total_rejects

    completed_times = [t.time_spent for t in tasks if t.time_spent and t.status in ('approved', 'submitted', 'under_review')]
    avg_time = int(sum(completed_times) / len(completed_times)) if completed_times else 0

    def calculate_task_user_precision(db_session, t_id, s_id):
        import os
        import json
        from models.frame import Frame
        from models.annotation import Annotation
        from routers.tasks import CAMERA_COLUMN_MAP, get_ai_predictions_for_frame_cam

        cache_path = os.path.join("static", "cache", "predictions", f"task_{t_id}.json")
        all_ai_preds = {}
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    all_ai_preds = json.load(f)
            except Exception:
                pass

        frames = db_session.query(Frame).filter(Frame.scene_id == s_id).all()
        user_annotations = db_session.query(Annotation).filter(Annotation.task_id == t_id).all()

        user_ann_groups = {}
        for ann in user_annotations:
            key = f"{ann.frame_id}_{ann.camera}"
            if key not in user_ann_groups:
                user_ann_groups[key] = []
            user_ann_groups[key].append({
                "category": ann.category,
                "bbox_x": ann.bbox_x,
                "bbox_y": ann.bbox_y,
                "bbox_w": ann.bbox_w,
                "bbox_h": ann.bbox_h,
            })

        total_user_objs = 0
        total_matched_objs = 0
        total_missing_objs = 0

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

        for f in frames:
            for cam in CAMERA_COLUMN_MAP.keys():
                column = CAMERA_COLUMN_MAP[cam]
                if getattr(f, column, None):
                    key = f"{f.id}_{cam}"
                    ai_list = all_ai_preds.get(key)
                    if ai_list is None:
                        ai_list = get_ai_predictions_for_frame_cam(db_session, f.id, cam)
                    
                    user_list = user_ann_groups.get(key, [])
                    total_user_objs += len(user_list)
                    
                    available_ai = [dict(p) for p in ai_list]
                    matched_count = 0
                    
                    for user_ann in user_list:
                        best_match = None
                        best_iou = 0.1
                        best_idx = -1
                        
                        for idx, ai_box in enumerate(available_ai):
                            if ai_box["category"] == user_ann["category"]:
                                iou_val = py_iou(user_ann, ai_box)
                                if iou_val > best_iou:
                                    best_iou = iou_val
                                    best_match = ai_box
                                    best_idx = idx
                                    
                        if best_match:
                            matched_count += 1
                            available_ai.pop(best_idx)
                            
                    total_matched_objs += matched_count
                    total_missing_objs += len(available_ai)

        if (total_user_objs + total_missing_objs) > 0:
            return round((total_matched_objs / (total_user_objs + total_missing_objs)) * 100)
        return 100

    evaluated_tasks = [t for t in tasks if t.status in ('approved', 'rejected')]
    precisions = []
    for t in evaluated_tasks:
        precisions.append(calculate_task_user_precision(db, t.id, t.scene_id))

    quality_rate = round(sum(precisions) / len(precisions)) if precisions else 0

    # ── Thống kê kiểm thử (reviewer) ──
    rev_query = db.query(Task).filter(Task.reviewer_id == user_id)
    if project_id is not None:
        rev_query = rev_query.filter(Task.project_id == project_id)
    reviewed_tasks = rev_query.all()

    total_reviewed = len(reviewed_tasks)
    # Số lần reviewer approve nhưng admin reject lại (kiểm thử sai)
    reviewer_wrong = sum((t.reviewer_wrong_count or 0) for t in reviewed_tasks)
    # Tổng lần đã kiểm thử (đã có kết quả: reviewed, approved, rejected)
    total_review_done = sum(1 for t in reviewed_tasks if t.status in ('reviewed', 'approved', 'rejected'))
    # Tỷ lệ kiểm thử đúng
    review_quality_rate = round((total_review_done - reviewer_wrong) / total_review_done * 100) if total_review_done > 0 else 0

    return {
        "user_id": user_id,
        "total_tasks": total,
        "approved": approved,
        "rejected": rejected,
        "submitted": submitted,
        "in_progress": in_progress,
        "pending": pending,
        "total_rejects": total_rejects,
        "total_submissions": total_submissions,
        "quality_rate": quality_rate,
        "avg_time_seconds": avg_time,
        # Các trạng thái mới
        "admin_approved": admin_approved_count,
        "admin_rejected": admin_rejected_count,
        "reviewer_approved": reviewer_approved_count,
        # Chất lượng kiểm thử
        "total_reviewed": total_reviewed,
        "reviewer_wrong": reviewer_wrong,
        "review_quality_rate": review_quality_rate,
        "suspicious_pairs": [],
    }


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể xóa chính mình")
    db.delete(user)
    db.commit()
    return {"message": "Đã xóa người dùng"}
