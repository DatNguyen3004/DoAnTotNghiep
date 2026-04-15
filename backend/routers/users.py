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
