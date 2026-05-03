from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import os, shutil, uuid

from database import get_db
from models.project import Project, ProjectMember
from models.scene import Scene
from models.frame import Frame  # noqa - cần load để SQLAlchemy resolve relationship
from models.user import User
from schemas.project import ProjectCreate, ProjectOut, MemberAdd
from routers.auth import get_current_user, require_admin

router = APIRouter()

UPLOAD_DIR = "static/uploads/covers"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def _to_out(project: Project, db: Session) -> dict:
    scene_count = db.query(Scene).filter(Scene.project_id == project.id).count()
    d = ProjectOut.model_validate(project).model_dump()
    d['scene_count'] = scene_count
    return d

def create_scenes_from_folder(db: Session, project_id: int, folder_path: str):
    """Tự động tạo các nhiệm vụ chưa phân công từ folder mặc định"""
    if not os.path.isdir(folder_path):
        return
    
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    image_files = sorted([f for f in os.listdir(folder_path) if os.path.splitext(f)[1].lower() in image_extensions])
    
    if not image_files:
        return
    
    # Chia nhiệm vụ (mỗi scene 40 ảnh), mặc định KHÔNG gán user (unassigned)
    batch_size = 40
    for batch_idx, i in enumerate(range(0, len(image_files), batch_size)):
        if batch_idx >= 10: break # Lấy 10 nhiệm vụ mẫu
        batch_files = image_files[i:i + batch_size]
        
        scene = Scene(
            project_id=project_id,
            scene_token=f"scene-{uuid.uuid4().hex[:8]}",
            name=f"Nhiệm vụ {batch_idx + 1}",
            description=f"Dữ liệu nuScenes mặc định",
            frame_count=len(batch_files),
            assigned_to=None, # Đảm bảo chưa được phân công
            status="pending"
        )
        db.add(scene)
        db.flush()
        
        for frame_idx, filename in enumerate(batch_files):
            frame = Frame(
                scene_id=scene.id,
                frame_index=frame_idx,
                cam_front=os.path.join(folder_path, filename)
            )
            db.add(frame)
    db.commit()

@router.get("", response_model=List[ProjectOut])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Chỉ admin gốc (username="admin") mới thấy tất cả
    if current_user.username == "admin":
        projects = db.query(Project).filter(Project.is_active == True).all()
    else:
        # Các người dùng khác chỉ thấy dự án họ tham gia HOẶC họ tự tạo
        memberships = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
        project_ids = [m.project_id for m in memberships]
        projects = db.query(Project).filter(
            (Project.id.in_(project_ids)) | (Project.created_by == current_user.id), 
            Project.is_active == True
        ).all()
    return [_to_out(p, db) for p in projects]

@router.post("", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    # Đường dẫn bộ dữ liệu nuScenes mặc định (trỏ vào camera trước)
    default_dataset_path = r"D:\Dataset\v1.0-mini\samples\CAM_FRONT"
    
    try:
        project = Project(
            name=body.name, 
            description=body.description, 
            created_by=current_user.id
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # Thử nạp dữ liệu từ folder mặc định
        try:
            create_scenes_from_folder(db, project.id, default_dataset_path)
        except Exception as e:
            print(f"Lỗi khi nạp dữ liệu: {e}")
            
        return project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi tạo dự án: {str(e)}")

@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return project

@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    body: ProjectCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    project.name = body.name
    project.description = body.description
    db.commit()
    db.refresh(project)
    return project

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    project.is_active = False  # soft delete
    db.commit()
    return {"message": "Đã xóa dự án"}


@router.post("/{project_id}/cover")
async def upload_cover(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận JPG, PNG, WEBP")
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    project.cover_image = f"/uploads/covers/{filename}"
    db.commit()
    return {"cover_image": project.cover_image}


@router.get("/{project_id}/members")
def list_members(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    memberships = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    result = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            result.append({
                "id": user.id,
                "username": user.username,
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
                "task_count": 0,
                "completed": 0,
            })
    return result

@router.post("/{project_id}/members")
def add_member(
    project_id: int,
    body: MemberAdd,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    existing = db.query(ProjectMember).filter_by(project_id=project_id, user_id=body.user_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Người dùng đã là thành viên")
    db.add(ProjectMember(project_id=project_id, user_id=body.user_id))
    db.commit()
    return {"message": "Đã thêm thành viên"}

@router.delete("/{project_id}/members/{user_id}")
def remove_member(
    project_id: int,
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    member = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")
    db.delete(member)
    db.commit()
    return {"message": "Đã xóa thành viên"}
