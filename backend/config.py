import os

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
