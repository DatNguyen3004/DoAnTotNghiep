import os
from pathlib import Path
from dotenv import load_dotenv

# Tìm .env: ưu tiên backend/.env, fallback lên thư mục cha (project root)
_here = Path(__file__).parent
_env_local  = _here / ".env"          # backend/.env
_env_parent = _here.parent / ".env"   # D:\NuLabel\.env

if _env_local.exists():
    load_dotenv(dotenv_path=_env_local, override=True)
elif _env_parent.exists():
    load_dotenv(dotenv_path=_env_parent, override=True)

# Database
DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "nulabel")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "12345678")

DATABASE_URL = (
    f"mssql+pymssql://{DB_USER}:{DB_PASSWORD}@{DB_SERVER}/{DB_NAME}"
)

# JWT
SECRET_KEY = os.getenv("SECRET_KEY", "nulabel-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 giờ

# Dataset - thư mục gốc chứa samples/, sweeps/, v1.0-mini/
NUSCENES_ROOT = os.getenv("NUSCENES_ROOT", r"D:\Dataset\v1.0-mini")
# Thư mục chứa các file JSON metadata
NUSCENES_META = os.path.join(NUSCENES_ROOT, "v1.0-mini")

# AI Model
YOLO_WEIGHTS = os.getenv("YOLO_WEIGHTS", "weights/yolov8n.pt")

# Email (Gmail SMTP)
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER", "datnguyen1abc@gmail.com")
SMTP_PASS = os.getenv("SMTP_PASS", "sphc fdsy habv ntpj")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000")

# OAuth - Google
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")

# OAuth - GitHub
GITHUB_CLIENT_ID     = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI  = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/api/auth/github/callback")
