import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database import SessionLocal
from models.user import User

def test():
    print("Testing DB connection...")
    try:
        db = SessionLocal()
        users = db.query(User).all()
        print(f"Connection successful! Found {len(users)} users.")
        for u in users:
            print(f"User: {u.username}, Role: {u.role}")
    except Exception as e:
        print("Error details:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test()
