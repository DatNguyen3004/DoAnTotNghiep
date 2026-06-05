from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, or_, and_
from typing import List, Optional

from database import get_db
from models.chat_message import ChatMessage
from models.user import User
from models.task import Task
from models.scene import Scene
from models.annotation import Annotation
from models.task_submission import TaskSubmission
from models.task_chat import TaskChat
from schemas.task import (
    TaskCreate, TaskOut, TaskUserInfo, TaskStatusUpdate,
    TaskSubmit, ReviewSubmit, ReviewReject, AdminOverride,
    TaskChatCreate, TaskChatOut,
)
from routers.auth import get_current_user, require_admin
from services.task_service import assign_reviewer
import json
import os
from models.frame import Frame
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

VALID_STATUSES = {"pending", "in_progress", "submitted", "under_review", "reviewed", "approved", "rejected"}


from models.project import Project

def get_task_precision_details(db_session: Session, t_id: int, s_id: int) -> dict:
    """Tính toán chi tiết độ tin cậy và số lượng đối tượng khớp/sót so với AI dự đoán."""
    import os
    import json
    
    # Lấy dự đoán từ cache nếu có
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

    # Nhóm final annotations theo frame_id và camera
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

    # Lấy snapshot của lần nộp đầu tiên
    first_sub = db_session.query(TaskSubmission).filter(
        TaskSubmission.task_id == t_id,
        TaskSubmission.action == "submitted"
    ).order_by(TaskSubmission.created_at.asc()).first()
    
    first_sub_list = []
    has_first_sub = False
    if first_sub and first_sub.annotations_snapshot:
        try:
            first_sub_list = json.loads(first_sub.annotations_snapshot)
            has_first_sub = True
        except Exception:
            pass

    # Nhóm first submission annotations theo frame_id và camera
    first_ann_groups = {}
    for ann in first_sub_list:
        key = f"{ann.get('frame_id')}_{ann.get('camera')}"
        if key not in first_ann_groups:
            first_ann_groups[key] = []
        first_ann_groups[key].append(ann)

    total_user_objs = 0
    total_matched_objs = 0
    total_missing_objs = 0
    total_ai_matched_objs = 0
    total_ai_missing_objs = 0

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

    frame_reliabilities = []

    for f in frames:
        frame_first_count = 0
        frame_ai_count = 0
        frame_final_count = 0
        frame_matched_count = 0

        for cam in CAMERA_COLUMN_MAP.keys():
            column = CAMERA_COLUMN_MAP[cam]
            if getattr(f, column, None):
                key = f"{f.id}_{cam}"
                
                # AI Predictions
                ai_list = all_ai_preds.get(key)
                if ai_list is None:
                    ai_list = get_ai_predictions_for_frame_cam(db_session, f.id, cam)
                frame_ai_count += len(ai_list)
                
                available_ai = [dict(p) for p in ai_list]
                
                # Final User annotations
                user_list = user_ann_groups.get(key, [])
                frame_final_count += len(user_list)
                total_user_objs += len(user_list)
                
                # Tính matched/missing so với AI
                matched_count = 0
                for user_ann in user_list:
                    best_match = None
                    best_iou = 0.85
                    best_idx = -1
                    for idx, ai_box in enumerate(available_ai):
                        if ai_box["category"] == user_ann["category"]:
                            iou_val = py_iou(user_ann, ai_box)
                            if iou_val >= best_iou:
                                best_iou = iou_val
                                best_match = ai_box
                                best_idx = idx
                    if best_match:
                        matched_count += 1
                        available_ai.pop(best_idx)
                        
                total_ai_matched_objs += matched_count
                total_ai_missing_objs += len(available_ai)

                # Lần nộp đầu tiên (first submission)
                first_list = first_ann_groups.get(key, []) if has_first_sub else user_list
                frame_first_count += len(first_list)

                # So khớp giữa lần nộp đầu tiên và lần nộp cuối cùng
                available_user = [dict(u) for u in user_list]
                cam_matched_first_final = 0
                for first_ann in first_list:
                    best_match = None
                    best_iou = 0.85
                    best_idx = -1
                    for idx, u_ann in enumerate(available_user):
                        if u_ann["category"] == first_ann["category"]:
                            iou_val = py_iou(first_ann, u_ann)
                            if iou_val >= best_iou:
                                best_iou = iou_val
                                best_match = u_ann
                                best_idx = idx
                    if best_match:
                        cam_matched_first_final += 1
                        available_user.pop(best_idx)
                
                total_matched_objs += cam_matched_first_final
                total_missing_objs += (len(first_list) - cam_matched_first_final) + (len(user_list) - cam_matched_first_final)
                
                frame_matched_count += cam_matched_first_final

        # Tính độ tin cậy của khung hình này
        if frame_first_count == 0:
            if frame_ai_count == 0:
                frame_rel = 100.0
            else:
                frame_rel = 0.0
        else:
            if frame_final_count == 0:
                frame_rel = 0.0
            else:
                frame_rel = min(round((frame_matched_count / frame_final_count) * 100), 100)
        
        frame_reliabilities.append(frame_rel)

    precision = round(sum(frame_reliabilities) / len(frame_reliabilities)) if frame_reliabilities else 100

    return {
        "precision": precision,
        "matched_objs": total_matched_objs,
        "missing_objs": total_missing_objs,
        "user_objs": total_user_objs,
        "ai_matched_objs": total_ai_matched_objs,
        "ai_missing_objs": total_ai_missing_objs,
    }

def calculate_task_user_precision(db_session: Session, t_id: int, s_id: int) -> int:
    return get_task_precision_details(db_session, t_id, s_id)["precision"]

def _enrich_task(task: Task, db: Session) -> dict:
    """Enrich task with scene info, user info, and annotation count."""
    scene = db.query(Scene).filter(Scene.id == task.scene_id).first()
    project = db.query(Project).filter(Project.id == task.project_id).first()

    # Count distinct frames that have annotations
    annotated_frames = (
        db.query(sa_func.count(sa_func.distinct(Annotation.frame_id)))
        .filter(Annotation.task_id == task.id)
        .scalar()
    ) or 0

    assignee = db.query(User).filter(User.id == task.assigned_to).first()
    reviewer = db.query(User).filter(User.id == task.reviewer_id).first() if task.reviewer_id else None

    latest_sub = (
        db.query(TaskSubmission)
        .filter(TaskSubmission.task_id == task.id)
        .order_by(TaskSubmission.created_at.desc())
        .first()
    )
    admin_moderated = latest_sub is not None and latest_sub.action in ("admin_approved", "admin_rejected")

    precision = None
    matched_objs = None
    missing_objs = None
    user_objs = None
    ai_matched_objs = None
    ai_missing_objs = None

    if task.status in ('approved', 'rejected', 'reviewed'):
        try:
            details = get_task_precision_details(db, task.id, task.scene_id)
            precision = details["precision"]
            matched_objs = details["matched_objs"]
            missing_objs = details["missing_objs"]
            user_objs = details["user_objs"]
            ai_matched_objs = details["ai_matched_objs"]
            ai_missing_objs = details["ai_missing_objs"]
        except Exception as e:
            print(f"Error calculating precision for task {task.id}: {e}")

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
        project_name=project.name if project else None,
        scene_description=scene.description if scene else None,
        frame_count=scene.frame_count if scene else 0,
        annotated_frames=annotated_frames,
        assigned_user=TaskUserInfo.model_validate(assignee) if assignee else None,
        reviewer_user=TaskUserInfo.model_validate(reviewer) if reviewer else None,
        admin_moderated=admin_moderated,
        precision=precision,
        matched_objs=matched_objs,
        missing_objs=missing_objs,
        user_objs=user_objs,
        ai_matched_objs=ai_matched_objs,
        ai_missing_objs=ai_missing_objs,
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
    background_tasks: BackgroundTasks,
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
            detail="Không thể nộp vì nhiệm vụ chưa có đối tượng đã được gán nhãn",
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

    # Ghi lịch sử nộp bài
    # Check if there is already a submission for this task with action "submitted"
    existing_submission = db.query(TaskSubmission).filter(
        TaskSubmission.task_id == task_id,
        TaskSubmission.action == "submitted"
    ).first()

    snapshot_data = None
    if not existing_submission:
        # Save snapshot of all current annotations
        anns = db.query(Annotation).filter(Annotation.task_id == task_id).all()
        snapshot_list = []
        for ann in anns:
            snapshot_list.append({
                "frame_id": ann.frame_id,
                "camera": ann.camera,
                "category": ann.category,
                "bbox_x": ann.bbox_x,
                "bbox_y": ann.bbox_y,
                "bbox_w": ann.bbox_w,
                "bbox_h": ann.bbox_h,
                "confidence": ann.confidence,
                "is_ai_generated": ann.is_ai_generated,
                "ai_bbox_x": ann.ai_bbox_x,
                "ai_bbox_y": ann.ai_bbox_y,
                "ai_bbox_w": ann.ai_bbox_w,
                "ai_bbox_h": ann.ai_bbox_h,
                "track_id": ann.track_id,
                "custom_name": ann.custom_name,
                "needs_review": ann.needs_review,
            })
        import json
        snapshot_data = json.dumps(snapshot_list, ensure_ascii=False)

    db.add(TaskSubmission(
        task_id=task_id,
        action="submitted",
        actor_id=current_user.id,
        annotations_snapshot=snapshot_data,
    ))

    # Giữ feedback để reviewer biết frame nào cần kiểm tra lại lần 2
    db.commit()
    db.refresh(task)

    # Pre-cache AI predictions in background
    background_tasks.add_task(precache_ai_predictions, task_id)

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
    background_tasks: BackgroundTasks,
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

    # Ghi lịch sử phê duyệt
    db.add(TaskSubmission(
        task_id=task_id,
        action="approved",
        actor_id=current_user.id,
    ))

    db.commit()
    db.refresh(task)

    # Pre-cache AI predictions in background
    background_tasks.add_task(precache_ai_predictions, task_id)

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
    task.reject_count = (task.reject_count or 0) + 1

    # Ghi lịch sử từ chối
    db.add(TaskSubmission(
        task_id=task_id,
        action="rejected",
        actor_id=current_user.id,
        feedback=body.feedback.strip(),
    ))

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

    prev_status = task.status  # Lưu status cũ trước khi thay đổi

    task.status = body.status
    if body.feedback:
        task.feedback = body.feedback
    elif body.status == "approved":
        task.feedback = None  # Xóa feedback khi admin phê duyệt cuối

    # Nếu admin reject task đã được reviewer approve (reviewed) → reviewer kiểm thử sai
    # Tăng reviewer_wrong_count để phản ánh vào chất lượng kiểm thử
    if body.status == "rejected" and prev_status == "reviewed" and task.reviewer_id:
        task.reviewer_wrong_count = (task.reviewer_wrong_count or 0) + 1

    # Ghi lịch sử admin override
    db.add(TaskSubmission(
        task_id=task_id,
        action="admin_approved" if body.status == "approved" else f"admin_{body.status}",
        actor_id=current_user.id,
        feedback=body.feedback,
    ))

    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}/history
# ───────────────────────────────────────────────
@router.get("/{task_id}/history")
def get_task_history(
    task_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Admin xem lịch sử nộp bài / từ chối / phê duyệt của một task.
    Trả về danh sách các sự kiện theo thứ tự thời gian.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    submissions = (
        db.query(TaskSubmission)
        .filter(TaskSubmission.task_id == task_id)
        .order_by(TaskSubmission.created_at.asc())
        .all()
    )

    result = []
    for s in submissions:
        actor = db.query(User).filter(User.id == s.actor_id).first() if s.actor_id else None
        result.append({
            "id": s.id,
            "action": s.action,
            "actor_id": s.actor_id,
            "actor_username": actor.username if actor else None,
            "actor_full_name": actor.full_name if actor else None,
            "feedback": s.feedback,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return result


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}/similarity-stats
# ───────────────────────────────────────────────
@router.get("/{task_id}/similarity-stats")
def get_task_ai_similarity_stats(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Tính toán % tương đồng giữa AI và người dùng cho một task cụ thể theo cơ chế đối sánh chặt chẽ."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
        
    # Lấy tất cả các annotation hiện có của task trong DB
    user_annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    if not user_annotations:
        return {"total_ai_labels_kept": 0, "average_iou": 0.0, "similarity_percent": None}

    # Đường dẫn file cache dự đoán AI cho task này
    cache_dir = os.path.join("static", "cache", "predictions")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"task_{task_id}.json")

    # Nạp hoặc khởi tạo cache AI
    all_ai_preds = {}
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                all_ai_preds = json.load(f)
        except Exception as e:
            all_ai_preds = {}

    # Nếu chưa có cache, chạy YOLOv8 để sinh cache
    if not all_ai_preds:
        # Lấy tất cả frame của scene tương ứng với task
        frames = db.query(Frame).filter(Frame.scene_id == task.scene_id).order_by(Frame.frame_index.asc()).all()
        for f in frames:
            for cam in CAMERA_COLUMN_MAP.keys():
                column = CAMERA_COLUMN_MAP[cam]
                if getattr(f, column, None):
                    preds = get_ai_predictions_for_frame_cam(db, f.id, cam)
                    key = f"{f.id}_{cam}"
                    all_ai_preds[key] = preds
        
        # Lưu vào cache
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(all_ai_preds, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving AI prediction cache: {e}")

    # Nhóm annotation của người dùng theo frame_id và camera
    user_ann_groups = {}
    for ann in user_annotations:
        key = f"{ann.frame_id}_{ann.camera}"
        if key not in user_ann_groups:
            user_ann_groups[key] = []
        user_ann_groups[key].append(ann)

    # IoU helper
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

    total_objects = 0
    total_iou = 0.0

    # Lấy tất cả frame_id và camera có trong cache AI hoặc trong user annotations
    all_keys = set(all_ai_preds.keys()).union(user_ann_groups.keys())

    for key in all_keys:
        ai_list = all_ai_preds.get(key, [])
        user_list = user_ann_groups.get(key, [])

        if not ai_list and not user_list:
            continue

        available_ai = [dict(p) for p in ai_list]
        matched_user_ids = set()

        for user_ann in user_list:
            user_box = {
                "bbox_x": user_ann.bbox_x,
                "bbox_y": user_ann.bbox_y,
                "bbox_w": user_ann.bbox_w,
                "bbox_h": user_ann.bbox_h
            }
            
            best_match = None
            best_iou = 0.1
            best_idx = -1
            
            for idx, ai_box in enumerate(available_ai):
                if ai_box["category"] == user_ann.category:
                    iou_val = py_iou(user_box, ai_box)
                    if iou_val > best_iou:
                        best_iou = iou_val
                        best_match = ai_box
                        best_idx = idx

            if best_match:
                total_iou += best_iou
                total_objects += 1
                available_ai.pop(best_idx)
                matched_user_ids.add(user_ann.id)

        # AI box bị bỏ sót -> 0% IoU, tính là 1 đối tượng bị phạt điểm
        for ai_box in available_ai:
            total_iou += 0.0
            total_objects += 1

        # User box vẽ dư (AI không phát hiện) -> 0% IoU, tính là 1 đối tượng bị phạt điểm
        for user_ann in user_list:
            if user_ann.id not in matched_user_ids:
                total_iou += 0.0
                total_objects += 1

    if total_objects == 0:
        return {"total_ai_labels_kept": 0, "average_iou": 0.0, "similarity_percent": None}

    avg_iou = total_iou / total_objects
    return {
        "total_ai_labels_kept": len(user_annotations),
        "average_iou": round(avg_iou, 4),
        "similarity_percent": round(avg_iou * 100, 2)
    }


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}/chats
# ───────────────────────────────────────────────
@router.get("/{task_id}/chats", response_model=List[TaskChatOut])
def get_task_chats(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get all chat messages for a specific task.
    Allowed: Admin, Assignee (labeler), or Reviewer.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if current_user.role != "admin" and current_user.id != task.assigned_to and current_user.id != task.reviewer_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem cuộc trò chuyện của task này")

    chats = (
        db.query(TaskChat)
        .filter(TaskChat.task_id == task_id)
        .order_by(TaskChat.created_at.asc())
        .all()
    )

    result = []
    for c in chats:
        sender = db.query(User).filter(User.id == c.sender_id).first()
        result.append(TaskChatOut(
            id=c.id,
            task_id=c.task_id,
            sender_id=c.sender_id,
            sender_username=sender.username if sender else "Unknown",
            sender_full_name=sender.full_name if sender else None,
            sender_role=sender.role if sender else "user",
            sender_avatar_url=sender.avatar_url if sender else None,
            message=c.message,
            created_at=c.created_at,
        ))
    return result


# ───────────────────────────────────────────────
# POST /api/tasks/{task_id}/chats
# ───────────────────────────────────────────────
@router.post("/{task_id}/chats", response_model=TaskChatOut)
def post_task_chat(
    task_id: int,
    body: TaskChatCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a chat message for a specific task.
    Allowed: Admin, Assignee (labeler), or Reviewer.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if current_user.role != "admin" and current_user.id != task.assigned_to and current_user.id != task.reviewer_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền gửi tin nhắn trong task này")

    if not body.message.strip():
        raise HTTPException(status_code=422, detail="Tin nhắn không được để trống")

    chat = TaskChat(
        task_id=task_id,
        sender_id=current_user.id,
        message=body.message.strip(),
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)

    return TaskChatOut(
        id=chat.id,
        task_id=chat.task_id,
        sender_id=chat.sender_id,
        sender_username=current_user.username,
        sender_full_name=current_user.full_name,
        sender_role=current_user.role,
        sender_avatar_url=current_user.avatar_url,
        message=chat.message,
        created_at=chat.created_at,
    )


def precache_ai_predictions(task_id: int):
    """Pre-cache AI predictions in a background thread so the admin page loads instantly."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return
        
        cache_dir = os.path.join("static", "cache", "predictions")
        os.makedirs(cache_dir, exist_ok=True)
        cache_path = os.path.join(cache_dir, f"task_{task_id}.json")
        
        if os.path.exists(cache_path):
            return
            
        frames = db.query(Frame).filter(Frame.scene_id == task.scene_id).order_by(Frame.frame_index.asc()).all()
        
        all_ai_preds = {}
        for f in frames:
            for cam in CAMERA_COLUMN_MAP.keys():
                column = CAMERA_COLUMN_MAP[cam]
                if getattr(f, column, None):
                    preds = get_ai_predictions_for_frame_cam(db, f.id, cam)
                    key = f"{f.id}_{cam}"
                    all_ai_preds[key] = preds
                    
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(all_ai_preds, f, ensure_ascii=False, indent=2)
            
    except Exception as e:
        print(f"Error pre-caching AI predictions for task {task_id}: {e}")
    finally:
        db.close()


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}/evaluation-details
# ───────────────────────────────────────────────
@router.get("/{task_id}/evaluation-details")
def get_task_evaluation_details(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed frame-by-frame comparison between AI predictions and user edits.
    Only accessible by Admin.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Chỉ admin mới có quyền truy cập trang đánh giá chất lượng")
        
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
        
    labeler = db.query(User).filter(User.id == task.assigned_to).first()
    reviewer = db.query(User).filter(User.id == task.reviewer_id).first()
    scene = db.query(Scene).filter(Scene.id == task.scene_id).first()
    
    frames = db.query(Frame).filter(Frame.scene_id == task.scene_id).order_by(Frame.frame_index.asc()).all()
    user_annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    
    user_ann_groups = {}
    for ann in user_annotations:
        key = f"{ann.frame_id}_{ann.camera}"
        if key not in user_ann_groups:
            user_ann_groups[key] = []
        user_ann_groups[key].append({
            "id": ann.id,
            "category": ann.category,
            "bbox_x": ann.bbox_x,
            "bbox_y": ann.bbox_y,
            "bbox_w": ann.bbox_w,
            "bbox_h": ann.bbox_h,
            "track_id": ann.track_id,
            "custom_name": ann.custom_name,
            "is_ai_generated": ann.is_ai_generated,
        })
        
    # Fetch first submission snapshot
    first_sub = db.query(TaskSubmission).filter(
        TaskSubmission.task_id == task_id,
        TaskSubmission.action == "submitted"
    ).order_by(TaskSubmission.created_at.asc()).first()
    
    first_sub_ann_groups = {}
    has_first_sub = False
    if first_sub and first_sub.annotations_snapshot:
        has_first_sub = True
        try:
            first_sub_list = json.loads(first_sub.annotations_snapshot)
            for ann in first_sub_list:
                key = f"{ann['frame_id']}_{ann['camera']}"
                if key not in first_sub_ann_groups:
                    first_sub_ann_groups[key] = []
                # Ensure it has 'id' for comparison matching
                if 'id' not in ann:
                    ann['id'] = f"fs_{ann['frame_id']}_{ann['camera']}_{len(first_sub_ann_groups[key])}"
                first_sub_ann_groups[key].append(ann)
        except Exception as e:
            print(f"Error parsing first submission snapshot: {e}")
            has_first_sub = False

    cache_dir = os.path.join("static", "cache", "predictions")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"task_{task_id}.json")
    
    all_ai_preds = {}
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                all_ai_preds = json.load(f)
        except Exception:
            all_ai_preds = {}
            
    if not all_ai_preds:
        for f in frames:
            for cam in CAMERA_COLUMN_MAP.keys():
                column = CAMERA_COLUMN_MAP[cam]
                if getattr(f, column, None):
                    preds = get_ai_predictions_for_frame_cam(db, f.id, cam)
                    key = f"{f.id}_{cam}"
                    all_ai_preds[key] = preds
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(all_ai_preds, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving AI prediction cache: {e}")

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

    frames_data = []
    for f in frames:
        cams_with_images = []
        cams_comparison = {}
        
        for cam in CAMERA_COLUMN_MAP.keys():
            column = CAMERA_COLUMN_MAP[cam]
            if getattr(f, column, None):
                cams_with_images.append(cam)
                
                key = f"{f.id}_{cam}"
                ai_list = all_ai_preds.get(key, [])
                user_list = user_ann_groups.get(key, [])
                
                available_ai = [dict(p) for p in ai_list]
                matched = []
                missing = []
                extra = []
                matched_user_ids = set()
                
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
                        effective_iou = 1.0 if best_iou >= 0.85 else best_iou
                        matched.append({
                            "user_box": user_ann,
                            "ai_box": best_match,
                            "iou": round(effective_iou, 4)
                        })
                        available_ai.pop(best_idx)
                        matched_user_ids.add(user_ann["id"])
                
                for ai_box in available_ai:
                    missing.append(ai_box)
                    
                for user_ann in user_list:
                    if user_ann["id"] not in matched_user_ids:
                        extra.append(user_ann)
                        
                real_matched_count = sum(1 for m in matched if m["iou"] >= 0.85)
                ai_count = len(ai_list)
                user_count = len(user_list)
                
                if ai_count == 0 and user_count == 0:
                    cam_iou = 1.0
                elif ai_count >= 1 and user_count == 0:
                    cam_iou = 0.0
                elif user_count >= 1:
                    cam_iou = real_matched_count / user_count
                else:
                    cam_iou = 0.0
                
                # First submission comparison
                first_user_list = first_sub_ann_groups.get(key, []) if has_first_sub else user_list
                available_first = [dict(p) for p in first_user_list]
                first_matched = []
                first_missing = []
                first_extra = []
                first_matched_user_ids = set()
                
                for user_ann in user_list:
                    best_match = None
                    best_iou = 0.1
                    best_idx = -1
                    
                    for idx, first_box in enumerate(available_first):
                        if first_box["category"] == user_ann["category"]:
                            iou_val = py_iou(user_ann, first_box)
                            if iou_val > best_iou:
                                best_iou = iou_val
                                best_match = first_box
                                best_idx = idx
                                
                    if best_match:
                        first_matched.append({
                            "user_box": user_ann,
                            "first_box": best_match,
                            "iou": round(best_iou, 4)
                        })
                        available_first.pop(best_idx)
                        first_matched_user_ids.add(user_ann["id"])
                        
                for first_box in available_first:
                    first_extra.append(first_box)
                    
                for user_ann in user_list:
                    if user_ann["id"] not in first_matched_user_ids:
                        first_missing.append(user_ann)
                
                cams_comparison[cam] = {
                    "ai_boxes": ai_list,
                    "user_boxes": user_list,
                    "matched": matched,
                    "missing": missing,
                    "extra": extra,
                    "similarity": round(cam_iou * 100, 2),
                    "first_submission": {
                        "has_snapshot": has_first_sub,
                        "extra": first_extra,
                        "missing": first_missing,
                        "matched": first_matched
                    }
                }
                
        frames_data.append({
            "id": f.id,
            "frame_index": f.frame_index,
            "cameras": cams_with_images,
            "comparison": cams_comparison
        })
        
    return {
        "task_id": task.id,
        "scene_name": scene.name or scene.scene_token if scene else None,
        "scene_description": scene.description if scene else None,
        "status": task.status,
        "feedback": task.feedback,
        "time_spent": task.time_spent,
        "labeler": {
            "id": labeler.id if labeler else None,
            "username": labeler.username if labeler else None,
            "full_name": labeler.full_name if labeler else None,
        } if labeler else None,
        "reviewer": {
            "id": reviewer.id if reviewer else None,
            "username": reviewer.username if reviewer else None,
            "full_name": reviewer.full_name if reviewer else None,
        } if reviewer else None,
        "frames": frames_data
    }


# ───────────────────────────────────────────────
# GET /api/tasks/{task_id}/peer-chats
# ───────────────────────────────────────────────
@router.get("/{task_id}/peer-chats")
def get_task_peer_chats(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get direct chat messages exchanged between the task's labeler and reviewer.
    Only accessible by Admin.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Chỉ admin mới có quyền xem cuộc trò chuyện này")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    if not task.assigned_to or not task.reviewer_id:
        return []

    # Get private messages between labeler and reviewer
    query = (
        db.query(ChatMessage)
        .filter(
            or_(
                and_(ChatMessage.sender_id == task.assigned_to, ChatMessage.recipient_id == task.reviewer_id),
                and_(ChatMessage.sender_id == task.reviewer_id, ChatMessage.recipient_id == task.assigned_to)
            )
        )
    )

    if task.admin_chat_cleared_at is not None:
        query = query.filter(ChatMessage.created_at > task.admin_chat_cleared_at)

    chats = query.order_by(ChatMessage.created_at.asc()).all()

    result = []
    for c in chats:
        sender = db.query(User).filter(User.id == c.sender_id).first()
        result.append({
            "id": c.id,
            "sender_id": c.sender_id,
            "sender_username": sender.username if sender else "Unknown",
            "sender_full_name": sender.full_name if sender else None,
            "sender_role": sender.role if sender else "user",
            "message": c.message,
            "image_url": c.image_url,
            "created_at": c.created_at,
        })
    return result


# ───────────────────────────────────────────────
# DELETE /api/tasks/{task_id}/peer-chats
# ───────────────────────────────────────────────
@router.delete("/{task_id}/peer-chats")
def clear_task_peer_chats(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Clear (hide) direct chat messages for the Admin on this task.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Chỉ admin mới có quyền xóa cuộc trò chuyện này")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    from datetime import datetime
    task.admin_chat_cleared_at = datetime.now()
    db.commit()
    return {"detail": "Đã xóa cuộc trò chuyện ở phía admin thành công"}



