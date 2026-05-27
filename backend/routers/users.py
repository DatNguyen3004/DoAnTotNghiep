from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
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
    tasks = db.query(Task).filter(Task.assigned_to == user_id).all()
    total = len(tasks)
    approved = sum(1 for t in tasks if t.status == 'approved')
    rejected = sum(1 for t in tasks if t.status == 'rejected')
    submitted = sum(1 for t in tasks if t.status in ('submitted', 'under_review', 'approved', 'rejected'))
    in_progress = sum(1 for t in tasks if t.status == 'in_progress')
    pending = sum(1 for t in tasks if t.status == 'pending')

    total_rejects = sum((t.reject_count or 0) for t in tasks)
    total_submissions = submitted + total_rejects

    completed_times = [t.time_spent for t in tasks if t.time_spent and t.status in ('approved', 'submitted', 'under_review')]
    avg_time = int(sum(completed_times) / len(completed_times)) if completed_times else 0

    import re
    from models.task_submission import TaskSubmission

    total_score = 0
    scored_tasks_count = 0

    for t in tasks:
        if t.status in ('submitted', 'under_review', 'approved', 'rejected'):
            # Lấy tất cả lịch sử reject theo thứ tự thời gian tăng dần
            submissions = db.query(TaskSubmission).filter(
                TaskSubmission.task_id == t.id,
                TaskSubmission.action == 'rejected'
            ).order_by(TaskSubmission.created_at.asc()).all()

            deductions = 0
            for idx, sub in enumerate(submissions):
                fb = sub.feedback or ""
                # Đếm số khung hình lỗi trong lần reject này
                matches = re.findall(r'(?:Frame|Khung\s+hình)\s+(\d+)', fb, re.IGNORECASE)
                num_error_frames = len(set(int(m) for m in matches))

                if idx == 0:
                    # Lần đầu sửa lỗi: chỉ trừ 2 điểm / khung hình lỗi (không trừ 5 điểm phạt gốc)
                    deductions += num_error_frames * 2
                else:
                    # Từ lần 2 trở đi: trừ thêm 5 điểm phạt gốc + 2 điểm / khung hình lỗi chưa sửa
                    deductions += 5 + (num_error_frames * 2)

            # Phạt do Admin từ chối (trừ cực nặng 50 điểm)
            admin_rejects = db.query(TaskSubmission).filter(
                TaskSubmission.task_id == t.id,
                TaskSubmission.action == 'admin_rejected'
            ).count()
            deductions += admin_rejects * 50

            task_score = 100 - deductions
            task_score = max(0, task_score)

            total_score += task_score
            scored_tasks_count += 1

    quality_rate = round(total_score / scored_tasks_count) if scored_tasks_count > 0 else 0

    # ── Thống kê kiểm thử (reviewer) ──
    reviewed_tasks = db.query(Task).filter(Task.reviewer_id == user_id).all()
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
