import sys
import os
sys.path.append(os.getcwd())

from database import SessionLocal
from models.user import User
from services.auth_service import create_access_token

db = SessionLocal()
try:
    user = db.query(User).filter(User.username == "admin").first()
    if user:
        token = create_access_token({"sub": str(user.id), "role": user.role})
        print("ADMIN_TOKEN:", token)
    else:
        print("Admin user not found!")
finally:
    db.close()
