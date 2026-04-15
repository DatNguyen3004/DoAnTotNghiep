"""
Task service — business logic for task assignment and reviewer selection.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.task import Task
from models.project import ProjectMember
from models.user import User


def assign_reviewer(db: Session, task_id: int, project_id: int, labeler_id: int) -> int | None:
    """
    Tìm Labeler khác trong project có ít task under_review nhất (least-loaded).
    Trả về reviewer_id hoặc None nếu không tìm thấy.
    """
    # Lấy tất cả member role='user' trong project, trừ labeler hiện tại
    members = (
        db.query(ProjectMember.user_id)
        .join(User, User.id == ProjectMember.user_id)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id != labeler_id,
            User.role == "user",
            User.is_active == True,
        )
        .all()
    )

    if not members:
        return None

    member_ids = [m.user_id for m in members]

    # Đếm số task đang under_review của mỗi member (là reviewer)
    review_counts = (
        db.query(
            Task.reviewer_id,
            func.count(Task.id).label("cnt"),
        )
        .filter(
            Task.reviewer_id.in_(member_ids),
            Task.status == "under_review",
        )
        .group_by(Task.reviewer_id)
        .all()
    )

    count_map = {r.reviewer_id: r.cnt for r in review_counts}

    # Chọn member có ít review nhất
    best_id = min(member_ids, key=lambda uid: count_map.get(uid, 0))
    return best_id
