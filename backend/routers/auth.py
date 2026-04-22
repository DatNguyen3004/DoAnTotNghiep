from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from jose import JWTError
import secrets
import httpx
from datetime import datetime, timedelta

from database import get_db
from models.user import User
from schemas.auth import LoginRequest, LoginResponse, UserOut
from services.auth_service import authenticate_user, create_access_token, decode_token, hash_password
from services.email_service import send_reset_email
from config import (
    FRONTEND_URL,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
    GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI,
)

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


# ── Register (public) ─────────────────────────────────────────────────────────
from pydantic import BaseModel as _BaseModel
from typing import Optional as _Optional

class RegisterRequest(_BaseModel):
    username: str
    password: str
    confirm_password: str
    email: str
    full_name: _Optional[str] = None
    gender: _Optional[str] = None
    birth_date: _Optional[str] = None
    phone: _Optional[str] = None
    address: _Optional[str] = None
    avatar_url: _Optional[str] = None

@router.post("/register", response_model=LoginResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if body.password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Mật khẩu nhập lại không khớp")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 6 ký tự")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Tên đăng nhập đã tồn tại")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email đã được sử dụng")

    user = User(
        username=body.username,
        email=body.email,
        full_name=body.full_name or None,
        password_hash=hash_password(body.password),
        role="admin",
        gender=body.gender or None,
        birth_date=body.birth_date or None,
        phone=body.phone or None,
        address=body.address or None,
        avatar_url=body.avatar_url or None,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))

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


# ── OAuth Google ─────────────────────────────────────────────────────────────

@router.get("/google/login")
def google_login():
    """Redirect người dùng đến trang đăng nhập Google."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth chưa được cấu hình")
    params = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
    )
    return RedirectResponse(url=params)


@router.get("/google/callback")
def google_callback(code: str, db: Session = Depends(get_db)):
    """Nhận authorization code từ Google, đổi lấy token và tạo/lấy user."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth chưa được cấu hình")

    # 1. Đổi code lấy access_token
    with httpx.Client() as client:
        token_res = client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
    if token_res.status_code != 200:
        raise HTTPException(status_code=400, detail="Không thể lấy token từ Google")
    token_data = token_res.json()
    google_access_token = token_data.get("access_token")

    # 2. Lấy thông tin user từ Google
    with httpx.Client() as client:
        user_res = client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
    if user_res.status_code != 200:
        raise HTTPException(status_code=400, detail="Không thể lấy thông tin người dùng từ Google")
    google_user = user_res.json()

    google_id    = google_user.get("id", "")
    google_email = google_user.get("email", "")
    google_name  = google_user.get("name", "")   # họ và tên → full_name
    avatar_url   = google_user.get("picture", "")

    # 3. Tìm hoặc tạo user
    user = db.query(User).filter(User.email == google_email).first()
    if not user:
        # Tạo username dạng admin01, admin02, ... tự tăng
        counter = 1
        while True:
            candidate = f"admin{counter:02d}"
            if not db.query(User).filter(User.username == candidate).first():
                break
            counter += 1

        user = User(
            username=candidate,
            email=google_email,
            full_name=google_name,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="admin",
            avatar_url=avatar_url,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Cập nhật avatar nếu chưa có
        if not user.avatar_url and avatar_url:
            user.avatar_url = avatar_url
            db.commit()

    # 4. Tạo JWT và redirect về frontend
    jwt_token = create_access_token({"sub": str(user.id), "role": user.role})
    redirect_url = (
        f"{FRONTEND_URL}/static/oauth-callback.html"
        f"?token={jwt_token}&role={user.role}"
    )
    return RedirectResponse(url=redirect_url)


# ── OAuth GitHub ─────────────────────────────────────────────────────────────

@router.get("/github/login")
def github_login():
    """Redirect người dùng đến trang đăng nhập GitHub."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth chưa được cấu hình")
    params = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={GITHUB_REDIRECT_URI}"
        "&scope=read:user%20user:email"
    )
    return RedirectResponse(url=params)


@router.get("/github/callback")
def github_callback(code: str, db: Session = Depends(get_db)):
    """Nhận authorization code từ GitHub, đổi lấy token và tạo/lấy user."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth chưa được cấu hình")

    # 1. Đổi code lấy access_token
    with httpx.Client() as client:
        token_res = client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
        )
    if token_res.status_code != 200:
        raise HTTPException(status_code=400, detail="Không thể lấy token từ GitHub")
    token_data = token_res.json()
    github_access_token = token_data.get("access_token")

    # 2. Lấy thông tin user từ GitHub
    with httpx.Client() as client:
        user_res = client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {github_access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
    if user_res.status_code != 200:
        raise HTTPException(status_code=400, detail="Không thể lấy thông tin người dùng từ GitHub")
    gh_user = user_res.json()

    gh_login     = gh_user.get("login", "")   # tên tài khoản GitHub → username
    gh_avatar    = gh_user.get("avatar_url", "")
    gh_email     = gh_user.get("email") or ""

    # Nếu email private, lấy từ /user/emails
    if not gh_email:
        with httpx.Client() as client:
            emails_res = client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Authorization": f"Bearer {github_access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
        if emails_res.status_code == 200:
            for e in emails_res.json():
                if e.get("primary") and e.get("verified"):
                    gh_email = e.get("email", "")
                    break

    # 3. Tìm hoặc tạo user
    # username = tên tài khoản GitHub, full_name = để trống
    user = db.query(User).filter(User.username == gh_login).first()
    if not user and gh_email:
        user = db.query(User).filter(User.email == gh_email).first()

    if not user:
        # Đảm bảo username không trùng
        base_username = gh_login
        username = base_username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}_{counter}"
            counter += 1

        user = User(
            username=username,
            email=gh_email if gh_email else None,
            full_name=None,          # để trống theo yêu cầu
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="admin",
            avatar_url=gh_avatar,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.avatar_url and gh_avatar:
            user.avatar_url = gh_avatar
            db.commit()

    # 4. Tạo JWT và redirect về frontend
    jwt_token = create_access_token({"sub": str(user.id), "role": user.role})
    redirect_url = (
        f"{FRONTEND_URL}/static/oauth-callback.html"
        f"?token={jwt_token}&role={user.role}"
    )
    return RedirectResponse(url=redirect_url)
