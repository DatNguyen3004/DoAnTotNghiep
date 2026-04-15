"""Thêm project mẫu vào DB. Chạy từ thư mục backend/"""
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models.user import User
from models.project import Project, ProjectMember

db = SessionLocal()
try:
    if db.query(Project).count() > 0:
        print("Đã có project, bỏ qua.")
    else:
        admin = db.query(User).filter(User.role == "admin").first()
        labelers = db.query(User).filter(User.role == "user").all()

        project = Project(
            name="nuScenes Detection 2024",
            description="Dự án gán nhãn xe tự hành trên bộ dữ liệu nuScenes mini.",
            created_by=admin.id
        )
        db.add(project)
        db.flush()

        for u in labelers:
            db.add(ProjectMember(project_id=project.id, user_id=u.id))

        db.commit()
        print(f"Đã tạo project: {project.name} (id={project.id})")
finally:
    db.close()
