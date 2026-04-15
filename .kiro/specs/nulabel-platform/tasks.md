# Danh sách Task Triển khai NuLabel

## Task 1: Khởi tạo Backend (FastAPI + SQL Server)

- [ ] 1.1 Tạo cấu trúc thư mục backend: `main.py`, `config.py`, `database.py`, `models/`, `routers/`, `schemas/`, `services/`
- [ ] 1.2 Cấu hình kết nối SQL Server trong `config.py` và `database.py` (SQLAlchemy + pyodbc)
- [ ] 1.3 Tạo SQLAlchemy ORM models: `User`, `Project`, `ProjectMember`, `Scene`, `Frame`, `Task`, `Annotation`
- [ ] 1.4 Tạo script migration/init DB — tạo bảng và seed dữ liệu mẫu (2 admin, 3 user, 1 project). Bảng `tasks` phải có cột `reviewer_id` và trạng thái `under_review`.
- [ ] 1.5 Cấu hình FastAPI app trong `main.py`: CORS, router mount, startup event load YOLOv8 model

## Task 2: Backend — Authentication API

- [ ] 2.1 Tạo `routers/auth.py`: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (bỏ `POST /api/auth/register` — Admin tạo user qua `/api/users`)
- [ ] 2.2 Tạo `services/auth_service.py`: hash password (bcrypt), tạo/verify JWT token (python-jose)
- [ ] 2.3 Tạo dependency `get_current_user` để inject user từ JWT token vào mọi endpoint protected
- [ ] 2.4 Tạo dependency `require_admin` để bảo vệ các endpoint Admin-only (trả về HTTP 403 nếu role != admin)

## Task 3: Backend — Projects & Users API

- [ ] 3.1 Tạo `routers/projects.py`: CRUD project, thêm/xóa thành viên
- [ ] 3.2 `GET /api/projects` trả về đúng danh sách theo role (admin thấy tất cả, user chỉ thấy project được giao)
- [ ] 3.3 Tạo `routers/users.py`: `GET /api/users` (Admin only), `GET /api/users/{id}`, `POST /api/users` (Admin tạo user mới — nhận `username`, `full_name`, `password`, `role`)
- [ ] 3.4 Tạo Pydantic schemas cho project và user request/response

## Task 4: Backend — Dataset Import (nuScenes)

- [ ] 4.1 Tạo script `scripts/import_nuscenes.py` — đọc `v1.0-mini/scene.json`, `sample.json`, `sample_data.json` và import vào DB
- [ ] 4.2 Lưu đường dẫn tương đối đến file ảnh của 6 camera vào bảng `frames`
- [ ] 4.3 Tạo `routers/datasets.py`: `GET /api/projects/{id}/scenes`, `GET /api/scenes/{id}/frames`, `GET /api/frames/{id}/metadata`
- [ ] 4.4 Implement `GET /api/frames/{id}/image/{camera}` — đọc file ảnh từ disk, trả về `FileResponse` với auth guard

## Task 5: Backend — Tasks & Annotations API

- [ ] 5.1 Tạo `routers/tasks.py`: `GET /api/tasks` (hỗ trợ filter `?project_id`, `?status`, `?role=reviewer`), `GET /api/tasks/{id}`, `PUT /api/tasks/{id}/status`
- [ ] 5.2 Implement `POST /api/tasks/{id}/submit` — validate có ít nhất 1 annotation, cập nhật status = 'submitted', sau đó tự động gán reviewer (Labeler khác trong project, least-loaded), cập nhật `reviewer_id` và status = 'under_review'
- [ ] 5.3 Implement `POST /api/tasks/{id}/review/approve` (Labeler reviewer — chỉ reviewer của task đó mới gọi được), cập nhật status = 'approved'
- [ ] 5.4 Implement `POST /api/tasks/{id}/review/reject` (Labeler reviewer — feedback bắt buộc), cập nhật status = 'rejected'
- [ ] 5.5 Implement `POST /api/tasks/{id}/admin/override` (Admin only) — override status và feedback
- [ ] 5.6 Tạo `routers/annotations.py`: `GET /api/tasks/{id}/annotations`, `GET /api/tasks/{id}/annotations/{frame_id}`
- [ ] 5.7 Implement `POST /api/tasks/{id}/annotations` — upsert annotation theo frame (xóa cũ, insert mới)
- [ ] 5.8 Implement `DELETE /api/annotations/{id}`
- [ ] 5.9 Implement hàm `assign_reviewer(task_id, project_id, labeler_id)` trong `services/task_service.py` — tìm Labeler khác trong project có ít task `under_review` nhất

## Task 6: Backend — AI Inference (YOLOv8 + OpenCV)

- [ ] 6.1 Tạo `services/ai_service.py` — load YOLOv8 model một lần khi startup, implement `run_inference(image_path, conf_threshold, ai_threshold)`
- [ ] 6.2 Implement mapping COCO class_id → nuScenes category trong `ai_service.py`
- [ ] 6.3 Implement chuẩn hóa tọa độ bbox từ pixel sang tỷ lệ (0.0-1.0) trong inference pipeline
- [ ] 6.4 Tạo `routers/ai.py`: `POST /api/ai/predict`, `GET /api/ai/status`
- [ ] 6.5 Implement `GET /api/projects/{id}/export` — tổng hợp annotation, tạo file ZIP JSON chuẩn nuScenes

## Task 7: Frontend — JS Modules dùng chung

- [ ] 7.1 Tạo `js/api.js` — fetch wrapper với base URL, auto-attach JWT header, xử lý 401 redirect về login
- [ ] 7.2 Tạo `js/auth.js` — `saveSession()`, `requireAuth(role)`, `logout()`, `getCurrentUser()`
- [ ] 7.3 Tạo `js/canvas-engine.js` — `AnnotationCanvas` class: vẽ box, chọn box, xóa box, undo, zoom/pan, read-only mode
- [ ] 7.4 Tạo `js/utils.js` — helpers: format timer, generate ID, debounce, show/hide spinner

## Task 8: Frontend — Authentication

- [ ] 8.1 Bổ sung logic đăng nhập vào `login.html` — gọi `POST /api/auth/login`, lưu JWT, redirect theo role
- [ ] 8.2 Thêm `requireAuth('admin')` / `requireAuth('user')` vào đầu tất cả trang Admin/ và User/
- [ ] 8.3 Thêm logic đăng xuất vào nút "Đăng xuất" — gọi `logout()` từ `auth.js`

## Task 9: Frontend — Project Management

- [ ] 9.1 Load danh sách project từ `GET /api/projects` khi mở `ManagerProject.html`
- [ ] 9.2 Implement modal "Tạo Dự án Mới" — gọi `POST /api/projects`, refresh danh sách
- [ ] 9.3 Ẩn nút "Tạo Dự án Mới" với User role
- [ ] 9.4 Xử lý click vào project card — lưu `projectId` vào `sessionStorage`, chuyển đến dashboard

## Task 10: Frontend — Dashboard

- [ ] 10.1 Load danh sách task từ `GET /api/tasks?project_id={id}` khi mở dashboard
- [ ] 10.2 Hiển thị đúng hành động theo trạng thái task (Mở gán nhãn / Xem lại / Sửa lại)
- [ ] 10.3 Cập nhật stats cards với dữ liệu từ API
- [ ] 10.4 Cập nhật progress bar theo số frame đã annotate / tổng frame
- [ ] 10.5 Thêm tab/section "Cần review" vào `User/dashboard.html` — load từ `GET /api/tasks?role=reviewer`, hiển thị badge số lượng task cần review

## Task 11: Frontend — Label Workspace

- [ ] 11.1 Load danh sách frame của scene từ `GET /api/scenes/{id}/frames`
- [ ] 11.2 Load ảnh camera từ `GET /api/frames/{id}/image/{camera}` dùng blob URL
- [ ] 11.3 Tích hợp `AnnotationCanvas` vào `User/Label.html` (bỏ `Admin/Label.html` — Admin không gán nhãn)
- [ ] 11.4 Implement click vào camera thumbnail để chuyển ảnh trên canvas
- [ ] 11.5 Load annotation hiện có từ `GET /api/tasks/{id}/annotations/{frame_id}` khi mở frame
- [ ] 11.6 Implement dialog/dropdown chọn class sau khi vẽ xong box
- [ ] 11.7 Implement frame navigation (nút mũi tên, phím A/D) với auto-save trước khi chuyển
- [ ] 11.8 Implement timer đếm giờ thật (setInterval, format HH:MM:SS)
- [ ] 11.9 Implement nút "Lưu" — gọi `POST /api/tasks/{id}/annotations`
- [ ] 11.10 Implement nút "Nộp" — validate có annotation, gọi `POST /api/tasks/{id}/submit`, hiển thị thông báo "Bài đã nộp, đang chờ kiểm duyệt"
- [ ] 11.11 Implement `User/Label_Review.html` — load annotation read-only từ API, không cho chỉnh sửa

## Task 12: Frontend — AI Auto-labeling

- [ ] 12.1 Kết nối nút "AI TỰ ĐỘNG GÁN NHÃN" với `POST /api/ai/predict`
- [ ] 12.2 Hiển thị loading spinner khi AI đang xử lý, disable button
- [ ] 12.3 Render box AI với màu theo threshold: teal (confidence >= threshold), đỏ (confidence < threshold)
- [ ] 12.4 Hiển thị icon cảnh báo ⚑ trên box có `needs_review = true`
- [ ] 12.5 Hiển thị badge "cần review" trên label item trong danh sách panel phải

## Task 13: Frontend — Kiểm duyệt chéo (Labeler review)

- [ ] 13.1 Implement 2 tab trong `User/Test.html`: "Bài làm của tôi" và "Cần review của tôi"
- [ ] 13.2 Tab "Bài làm của tôi": load từ `GET /api/tasks?project_id={id}`, hiển thị trạng thái và feedback nếu bị reject
- [ ] 13.3 Tab "Cần review của tôi": load từ `GET /api/tasks?role=reviewer`, hiển thị badge số lượng
- [ ] 13.4 Implement nút "Kiểm tra ngay" — chuyển đến `User/Test2.html` với `taskId` trên URL
- [ ] 13.5 Tích hợp `AnnotationCanvas` read-only vào `User/Test2.html`, load annotation từ API
- [ ] 13.6 Implement nút "Approve" — gọi `POST /api/tasks/{id}/review/approve`
- [ ] 13.7 Implement nút "Reject" — validate feedback không rỗng, gọi `POST /api/tasks/{id}/review/reject`
- [ ] 13.8 Implement `Admin/Test.html` — chỉ xem tổng quan tất cả task (không có nút Approve/Reject trực tiếp), có nút "Override" cho Admin
- [ ] 13.9 Hiển thị feedback của reviewer trong tab "Bài làm của tôi" khi task bị rejected

## Task 14: Frontend — Quản lý người dùng & Settings

- [ ] 14.1 Load danh sách user từ `GET /api/users` vào bảng `ManagerUser.html`
- [ ] 14.2 Implement form/modal "Tạo user mới" trong `ManagerUser.html` — nhập `username`, `full_name`, `password`, `role=user`, gọi `POST /api/users`
- [ ] 14.3 Implement nút "Thêm vào project" — modal, gọi `POST /api/projects/{id}/members`
- [ ] 14.4 Implement nút xóa user khỏi project — confirm dialog, gọi `DELETE /api/projects/{id}/members/{user_id}`
- [ ] 14.5 Implement slider AI threshold trong `setting.html` — lưu vào `localStorage`, áp dụng ngay
- [ ] 14.6 Implement phím tắt toàn cục trong Label Workspace (A/D, DEL, Ctrl+Z, Ctrl+S, ESC)
- [ ] 14.7 Implement nút Export — gọi `GET /api/projects/{id}/export`, tải file ZIP

## Task 15: Kiểm thử & Hoàn thiện

- [ ] 15.1 Kiểm tra toàn bộ luồng Admin: đăng nhập → tạo project → tạo user → import dataset → gán task → xem tổng quan
- [ ] 15.2 Kiểm tra toàn bộ luồng User (Labeler): đăng nhập → xem task → gán nhãn → AI predict → nộp bài
- [ ] 15.3 Kiểm tra luồng kiểm duyệt chéo: Labeler A nộp → hệ thống gán Labeler B → B review → A nhận kết quả
- [ ] 15.4 Kiểm tra auth guard — truy cập trực tiếp URL khi chưa đăng nhập phải redirect về login
- [ ] 15.5 Kiểm tra cross-role — User không gọi được API Admin-only (phải nhận HTTP 403)
- [ ] 15.6 Kiểm tra reviewer constraint — `reviewer_id` không được trùng `assigned_to`
- [ ] 15.7 Kiểm tra annotation data — tọa độ box đúng khi resize cửa sổ (tọa độ chuẩn hóa)
- [ ] 15.8 Kiểm tra YOLOv8 inference — box đỏ/xanh đúng theo giá trị threshold
- [ ] 15.9 Kiểm tra export ZIP — file JSON đúng chuẩn nuScenes format
