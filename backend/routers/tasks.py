from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from typing import List, Optional

from database import get_db
from models.user import User
from models.task import Task
from models.scene import Scene
from models.annotation import Annotation
from schemas.task import (
    TaskCreate, TaskOut, TaskUserInfo, TaskStatusUpdate,
    TaskSubmit, ReviewSubmit, ReviewReject, AdminOverride,
)
from routers.auth import get_current_user, require_admin
from services.task_service import assign_reviewer

router = APIRouter()

VALID_STATUSES = {"pending", "in_progress", "submitted", "under_review", "reviewed", "approved", "rejected"}


def _enrich_task(task: Task, db: Session) -> dict:
    """Enrich task with scene info, user info, and annotation count."""
    scene = db.query(Scene).filter(Scene.id == task.scene_id).first()

    # Count distinct frames that have annotations
    annotated_frames = (
        db.query(sa_func.count(sa_func.distinct(Annotation.frame_id)))
        .filter(Annotation.task_id == task.id)
        .scalar()
    ) or 0

    assignee = db.query(User).filter(User.id == task.assigned_to).first()
    reviewer = db.query(User).filter(User.id == task.reviewer_id).first() if task.reviewer_id else None

    return TaskOut(
        id=task.id,
        project_id=task.project_id,
        scene_id=task.scene_id,
        assigned_to=task.assigned_to,
        reviewer_id=task.reviewer_id,
        status=task.status,
        feedback=task.feedback,
        time_spent=task.time_spent or 0,
        reviewer_time_spent=task.reviewer_time_spent or 0,
        created_at=task.created_at,
        updated_at=task.updated_at,
        scene_name=scene.name or scene.scene_token if scene else None,
        scene_description=scene.description if scene else None,
        frame_count=scene.frame_count if scene else 0,
        annotated_frames=annotated_frames,
        assigned_user=TaskUserInfo.model_validate(assignee) if assignee else None,
        reviewer_user=TaskUserInfo.model_validate(reviewer) if reviewer else None,
    ).model_dump()


# ───────────────────────────────────────────────
# GET /api/tasks
# ───────────────────────────────────────────────
@router.get("")
def list_tasks(
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    role: Optional[str] = Query(None),       # "reviewer" → tasks where current user is reviewer
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Danh sách task.
    - Admin: thấy tất cả (filter theo project_id)
    - User: chỉ thấy task assigned_to mình
    - ?role=reviewer: task mà user hiện tại là reviewer
    """
    query = db.query(Task)

    if project_id:
        query = query.filter(Task.project_id == project_id)

    if status:
        query = query.filter(Task.status == status)

    if role == "reviewer":
        # Tasks where current user is the reviewer
        query = query.filter(Task.reviewer_id == current_user.id)
    elif current_user.role != "admin":
        # Regular users see only their assigned tasks
        query = query.filter(Task.assigned_to == current_user.id)

    tasks = query.order_by(Task.created_at.desc()).all()
    return [_enrich_task(t, db) for t in tasks]


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}
# ───────────────────────────────────────────────
@router.get("/{task_id}")
def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    return _enrich_task(task, db)


# ───────────────────────────────────────────────
# POST /api/tasks  (Admin creates tasks)
# ───────────────────────────────────────────────
@router.post("")
def create_task(
    body: TaskCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin tạo task gán nhãn cho một labeler."""
    # Check scene exists
    scene = db.query(Scene).filter(Scene.id == body.scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Không tìm thấy scene")

    # Check user exists
    user = db.query(User).filter(User.id == body.assigned_to, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    task = Task(
        project_id=body.project_id,
        scene_id=body.scene_id,
        assigned_to=body.assigned_to,
        status="pending",
    )
    db.add(task)

    # Tự động thêm user vào project nếu chưa là member
    from models.project import ProjectMember
    existing_member = db.query(ProjectMember).filter_by(
        project_id=body.project_id, user_id=body.assigned_to
    ).first()
    if not existing_member:
        db.add(ProjectMember(project_id=body.project_id, user_id=body.assigned_to))

    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)


# ───────────────────────────────────────────────
# DELETE /api/tasks/{task_id}  (Admin only)
# ───────────────────────────────────────────────
@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    # Xóa annotations trước
    db.query(Annotation).filter(Annotation.task_id == task_id).delete()
    db.delete(task)
    db.commit()
    return {"message": "Đã xóa task"}

# ───────────────────────────────────────────────
# PUT /api/tasks/{task_id}/status
# ───────────────────────────────────────────────
@router.put("/{task_id}/status")
def update_task_status(
    task_id: int,
    body: TaskStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status không hợp lệ: {body.status}")

    task.status = body.status
    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)


# ───────────────────────────────────────────────
# POST /api/tasks/{task_id}/submit
# ───────────────────────────────────────────────
@router.post("/{task_id}/submit")
def submit_task(
    task_id: int,
    body: TaskSubmit = TaskSubmit(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Labeler nộp bài:
    1. Validate có ít nhất 1 annotation
    2. Tự động assign reviewer (labeler khác, least-loaded)
    3. Chuyển status → under_review
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if task.assigned_to != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bạn không có quyền nộp task này")

    # Validate: phải có ít nhất 1 annotation
    ann_count = db.query(Annotation).filter(Annotation.task_id == task_id).count()
    if ann_count == 0:
        raise HTTPException(
            status_code=422,
            detail="Không thể nộp: task chưa có annotation nào. Vui lòng gán nhãn trước khi nộp.",
        )

    # Update time spent if provided
    if body.time_spent is not None:
        task.time_spent = body.time_spent

    # Auto-assign reviewer — giữ reviewer cũ nếu đã có, ngược lại tìm mới
    if task.reviewer_id:
        reviewer_id = task.reviewer_id  # Giữ nguyên reviewer cũ
    else:
        reviewer_id = assign_reviewer(db, task_id, task.project_id, task.assigned_to)

    if reviewer_id:
        task.reviewer_id = reviewer_id
        task.status = "under_review"
    else:
        task.status = "submitted"

    # Giữ feedback để reviewer biết frame nào cần kiểm tra lại lần 2
    db.commit()
    db.refresh(task)

    result = _enrich_task(task, db)
    if reviewer_id:
        result["message"] = "Bài đã nộp và đang chờ kiểm duyệt."
    else:
        result["message"] = "Bài đã nộp. Không tìm thấy reviewer — Admin cần xử lý."
    return result


# ───────────────────────────────────────────────
# POST /api/tasks/{task_id}/review/approve
# ───────────────────────────────────────────────
@router.post("/{task_id}/review/approve")
def approve_task(
    task_id: int,
    body: ReviewSubmit = ReviewSubmit(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reviewer approve bài làm."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if task.reviewer_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bạn không phải reviewer của task này")

    if task.status not in ("under_review", "submitted", "reviewed"):
        raise HTTPException(status_code=400, detail=f"Không thể approve task ở trạng thái '{task.status}'")

    task.status = "reviewed"
    if body.reviewer_time_spent is not None:
        task.reviewer_time_spent = (task.reviewer_time_spent or 0) + body.reviewer_time_spent
    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)


# ───────────────────────────────────────────────
# POST /api/tasks/{task_id}/review/reject
# ───────────────────────────────────────────────
@router.post("/{task_id}/review/reject")
def reject_task(
    task_id: int,
    body: ReviewReject,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reviewer reject bài làm — feedback bắt buộc."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if task.reviewer_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bạn không phải reviewer của task này")

    if task.status not in ("under_review", "submitted"):
        raise HTTPException(status_code=400, detail=f"Không thể reject task ở trạng thái '{task.status}'")

    if not body.feedback or not body.feedback.strip():
        raise HTTPException(status_code=422, detail="Feedback bắt buộc khi reject")

    task.status = "rejected"
    task.feedback = body.feedback.strip()
    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)


# ───────────────────────────────────────────────
# POST /api/tasks/{task_id}/admin/override
# ───────────────────────────────────────────────
@router.post("/{task_id}/admin/override")
def admin_override(
    task_id: int,
    body: AdminOverride,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin override kết quả review."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status không hợp lệ: {body.status}")

    task.status = body.status
    if body.feedback:
        task.feedback = body.feedback
    elif body.status == "approved":
        task.feedback = None  # Xóa feedback khi admin phê duyệt cuối
    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)
