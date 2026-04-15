"""
Script khởi tạo database: tạo bảng và seed dữ liệu mẫu.
Chạy: python scripts/init_db.py (từ thư mục backend/)
"""
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, Base, SessionLocal
from models.user import User
from services.auth_service import hash_password

# Import tất cả models để Base biết cần tạo bảng nào
import models.user    # noqa
import models.project # noqa
import models.scene   # noqa
import models.frame   # noqa

def init():
    print("Tạo bảng...")
    Base.metadata.create_all(bind=engine)
    print("Bảng đã tạo.")

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Dữ liệu đã tồn tại, bỏ qua seed.")
            return

        print("Seed dữ liệu mẫu...")
        users = [
            User(username="admin", full_name="Quản trị viên", email="admin@nulabel.vn", password_hash=hash_password("admin123"), role="admin"),
            User(username="labeler01", full_name="Labeler A",  email="labeler01@nulabel.vn", password_hash=hash_password("user123"), role="user"),
            User(username="labeler02", full_name="Labeler B",  email="labeler02@nulabel.vn", password_hash=hash_password("user123"), role="user"),
        ]
        db.add_all(users)
        db.flush()  # lấy id trước khi commit

        # Seed 1 project mẫu
        from models.project import Project, ProjectMember
        project = Project(name="nuScenes Detection 2024", description="Dự án gán nhãn xe tự hành trên bộ dữ liệu nuScenes mini.", created_by=users[0].id)
        db.add(project)
        db.flush()

        # Thêm tất cả labeler vào project
        for u in users[2:]:
            db.add(ProjectMember(project_id=project.id, user_id=u.id))

        db.commit()
        print("Seed xong! Tài khoản mẫu:")
        print("  Admin:   admin01 / admin123")
        print("  Labeler: labeler01 / user123")
    finally:
        db.close()

if __name__ == "__main__":
    init()
