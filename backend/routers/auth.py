from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError
import secrets
from datetime import datetime, timedelta

from database import get_db
from models.user import User
from schemas.auth import LoginRequest, LoginResponse, UserOut
from services.auth_service import authenticate_user, create_access_token, decode_token, hash_password
from services.email_service import send_reset_email
from config import FRONTEND_URL

router = APIRouter()
bearer = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id: int = int(payload.get("sub"))
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token không hợp lệ")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ hoặc đã hết hạn")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Người dùng không tồn tại")
    return user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền thực hiện thao tác này")
    return current_user

@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))

@router.post("/logout")
def logout():
    return {"message": "Đăng xuất thành công"}

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

# ── Forgot Password ──────────────────────────────────────────────────────────
from pydantic import BaseModel

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    # Luôn trả về 200 để không lộ email có tồn tại không
    if not user:
        return {"message": "Nếu email tồn tại, link đặt lại mật khẩu đã được gửi"}

    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_expires = datetime.utcnow() + timedelta(minutes=30)
    db.commit()

    reset_link = f"{FRONTEND_URL}/static/reset-password.html?token={token}"
    try:
        send_reset_email(user.email, reset_link, user.username)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể gửi email: {str(e)}")

    return {"message": "Nếu email tồn tại, link đặt lại mật khẩu đã được gửi"}

@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == body.token).first()
    if not user or not user.reset_expires:
        raise HTTPException(status_code=400, detail="Token không hợp lệ")
    if datetime.utcnow() > user.reset_expires:
        raise HTTPException(status_code=400, detail="Token đã hết hạn")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu phải có ít nhất 6 ký tự")

    user.password_hash = hash_password(body.new_password)
    user.reset_token = None
    user.reset_expires = None
    db.commit()
    return {"message": "Đặt lại mật khẩu thành công"}
