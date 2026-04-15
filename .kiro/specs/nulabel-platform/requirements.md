# Yêu cầu Hệ thống NuLabel

## Giới thiệu

NuLabel là hệ thống web gán nhãn dữ liệu xe tự hành đa cảm biến, hỗ trợ bộ dữ liệu nuScenes mini với 6 camera đồng bộ. Hệ thống theo kiến trúc client-server: Frontend HTML/CSS/Bootstrap giao tiếp với Backend FastAPI qua REST API, dữ liệu lưu trong SQL Server, ảnh nuScenes đặt trên server, AI inference dùng YOLOv8 + OpenCV.

---

## Yêu cầu chức năng

### REQ-01: Xác thực người dùng

**REQ-01.1** Hệ thống phải cho phép người dùng đăng nhập bằng username và password qua API `POST /api/auth/login`.

**REQ-01.2** Backend phải trả về JWT token sau khi đăng nhập thành công; frontend lưu token vào `localStorage`.

**REQ-01.3** Hệ thống phải phân biệt hai vai trò: `admin` và `user` (Labeler).

**REQ-01.4** Sau khi đăng nhập, Admin được chuyển đến `Admin/ManagerProject.html`, User được chuyển đến `User/ManagerProject.html`.

**REQ-01.5** Mọi API endpoint (trừ login) phải yêu cầu JWT token hợp lệ trong header `Authorization: Bearer <token>`.

**REQ-01.6** Frontend phải kiểm tra JWT token khi load trang — nếu không có hoặc hết hạn, redirect về `login.html`.

**REQ-01.7** Hệ thống phải cho phép đăng xuất: xóa token khỏi localStorage, gọi `POST /api/auth/logout`.

**Correctness Properties**:
- P1: Mọi request đến API protected mà không có token hợp lệ phải nhận HTTP 401
- P2: User role `user` không thể gọi các endpoint Admin-only (phải nhận HTTP 403)
- P3: Token hết hạn phải bị từ chối (HTTP 401), không được chấp nhận

---

### REQ-02: Quản lý Dự án

**REQ-02.1** Admin phải có thể tạo dự án mới (tên, mô tả) qua `POST /api/projects`.

**REQ-02.2** Danh sách project hiển thị qua `GET /api/projects` — Admin thấy tất cả, User chỉ thấy project được giao.

**REQ-02.3** User không có quyền tạo project — nút "Tạo Dự án Mới" bị ẩn, API trả về HTTP 403 nếu cố gọi.

**REQ-02.4** Nhấn vào project card lưu `projectId` vào `sessionStorage` và chuyển đến dashboard.

**REQ-02.5** Admin phải có thể thêm/xóa thành viên khỏi project qua `POST/DELETE /api/projects/{id}/members`.

---

### REQ-03: Dashboard

**REQ-03.1** Dashboard Admin hiển thị thống kê project: tổng frame, frame hoàn thành, frame cần chú ý, thời gian trung bình — lấy từ API.

**REQ-03.2** Dashboard User hiển thị danh sách task được giao qua `GET /api/tasks?project_id={id}` và danh sách task cần review qua `GET /api/tasks?role=reviewer`.

**REQ-03.3** Mỗi row trong bảng hiển thị hành động phù hợp theo trạng thái task:
- `pending` / `in_progress` → "Mở gán nhãn" (Label.html)
- `submitted` / `under_review` / `approved` → "Xem lại" (Label_Review.html, read-only)
- `rejected` → "Sửa lại" (Label.html)

**REQ-03.4** Progress bar hiển thị số frame đã annotate / tổng frame của scene.

---

### REQ-04: Label Workspace (Gán nhãn)

**REQ-04.1** Workspace load ảnh từ API `GET /api/frames/{id}/image/{camera}` — không dùng đường dẫn local.

**REQ-04.2** Workspace hiển thị 6 camera thumbnails ở panel trái; click để chuyển camera đang xem.

**REQ-04.3** Canvas trung tâm hiển thị ảnh camera đang chọn với HTML5 Canvas overlay để vẽ bounding box.

**REQ-04.4** Người dùng phải có thể vẽ bounding box bằng click-drag trên canvas.

**REQ-04.5** Sau khi vẽ xong box, hệ thống hiện dialog/dropdown để chọn class (6 loại).

**REQ-04.6** Người dùng phải có thể chọn, chỉnh sửa, và xóa box (phím DEL hoặc nút trash).

**REQ-04.7** Hệ thống phải hỗ trợ navigate giữa các frame bằng nút mũi tên hoặc phím A/D.

**REQ-04.8** Timer đếm thời gian làm việc thực tế từ khi mở workspace.

**REQ-04.9** Nút "Lưu" gọi `POST /api/tasks/{id}/annotations` để lưu annotation mà không submit.

**REQ-04.10** Nút "Nộp" gọi `POST /api/tasks/{id}/submit` — validate có ít nhất 1 annotation trước khi gọi API. Sau khi nộp thành công, hệ thống tự động gán reviewer (Labeler khác trong project) và chuyển task sang trạng thái `under_review`.

**REQ-04.11** Hệ thống phải tự động lưu annotation khi chuyển frame (auto-save qua API).

**Correctness Properties**:
- P4: Tọa độ bounding box phải được lưu dạng tỷ lệ (0.0-1.0) trong DB, độc lập với kích thước màn hình
- P5: Mỗi box phải có đúng một category được gán — không cho phép lưu box không có category
- P6: Không thể gọi `POST /api/tasks/{id}/submit` khi task chưa có annotation nào

---

### REQ-05: AI Auto-labeling (YOLOv8)

**REQ-05.1** Nút "AI TỰ ĐỘNG GÁN NHÃN" gọi `POST /api/ai/predict` với `frame_id` và `camera` hiện tại.

**REQ-05.2** Backend chạy YOLOv8 inference trên ảnh thật từ nuScenes dataset, trả về danh sách bounding box với confidence score.

**REQ-05.3** Box có `confidence < ai_review_threshold` phải được hiển thị viền đỏ + icon cảnh báo ⚑.

**REQ-05.4** Box có `confidence >= ai_review_threshold` hiển thị viền teal bình thường.

**REQ-05.5** Người dùng phải có thể chỉnh sửa, xóa, hoặc giữ nguyên các box do AI tạo.

**REQ-05.6** `ai_review_threshold` mặc định 0.85, cấu hình trong Settings, lưu `localStorage`.

**Correctness Properties**:
- P7: Tất cả box trả về từ `/api/ai/predict` có `confidence < threshold` phải có `needs_review = true`
- P8: Sau khi user chỉnh sửa box AI, `is_ai_generated` vẫn là `true` nhưng tọa độ được cập nhật trong DB

---

### REQ-06: Kiểm duyệt chéo (Labeler review Labeler)

**REQ-06.1** Sau khi Labeler A nộp bài, hệ thống tự động tìm 1 Labeler khác trong project (không phải Labeler A) và tạo review task cho họ — task chuyển sang trạng thái `under_review`.

**REQ-06.2** Hệ thống chọn reviewer theo chiến lược least-loaded: Labeler có ít task `under_review` nhất hiện tại.

**REQ-06.3** Trang `User/Test.html` có 2 tab: "Bài làm của tôi" và "Cần review của tôi".

**REQ-06.4** Tab "Cần review của tôi" load danh sách task mà user hiện tại là reviewer qua `GET /api/tasks?role=reviewer`.

**REQ-06.5** Labeler reviewer mở bài để xem canvas read-only — load annotation từ `GET /api/tasks/{id}/annotations`.

**REQ-06.6** Labeler reviewer Approve qua `POST /api/tasks/{id}/review/approve` hoặc Reject qua `POST /api/tasks/{id}/review/reject`.

**REQ-06.7** Khi Reject, trường feedback bắt buộc nhập — API từ chối nếu `feedback` rỗng.

**REQ-06.8** Labeler A thấy kết quả review (approved/rejected) và feedback trong tab "Bài làm của tôi".

**REQ-06.9** Admin xem tổng quan tất cả task (kể cả đang `under_review`) qua `Admin/Test.html` — không review trực tiếp.

**REQ-06.10** Admin có thể override kết quả review nếu cần qua `POST /api/tasks/{id}/admin/override`.

**Correctness Properties**:
- P9: Canvas trong trang review phải là read-only — không cho phép vẽ thêm box
- P10: `POST /api/tasks/{id}/review/reject` phải trả về HTTP 422 nếu `feedback` rỗng hoặc null
- P11: `reviewer_id` phải khác `assigned_to` — không được tự review bài của mình
- P12: Nếu project chỉ có 1 Labeler, hệ thống phải báo lỗi và không thể submit (hoặc Admin phải review thay)

---

### REQ-07: Quản lý người dùng

**REQ-07.1** Admin xem danh sách user qua `GET /api/users`.

**REQ-07.2** Admin tạo tài khoản user mới qua `POST /api/users` với form: `username`, `full_name`, `password`, `role=user` — hiển thị trong modal/form tại `ManagerUser.html`.

**REQ-07.3** User không tự đăng ký được — không có trang `signUp.html`, endpoint `POST /api/auth/register` không tồn tại.

**REQ-07.4** Admin thêm cộng tác viên vào project qua `POST /api/projects/{id}/members`.

**REQ-07.5** Admin xóa user khỏi project qua `DELETE /api/projects/{id}/members/{user_id}`.

**REQ-07.6** Admin xem profile chi tiết user (read-only).

---

### REQ-08: Cài đặt

**REQ-08.1** Người dùng điều chỉnh AI Confidence Threshold (conf) bằng slider — lưu `localStorage['ai_threshold']`.

**REQ-08.2** Người dùng điều chỉnh AI Review Threshold bằng slider — lưu `localStorage['ai_review_threshold']`, mặc định 0.85.

**REQ-08.3** Hệ thống hỗ trợ phím tắt trong Label Workspace: A/D (frame nav), DEL (xóa box), Ctrl+Z (undo), Ctrl+S (lưu), ESC (hủy vẽ).

**REQ-08.4** Admin export annotation của project thành file ZIP JSON chuẩn nuScenes qua `GET /api/projects/{id}/export`.

---

## Yêu cầu phi chức năng

**NFR-01**: Giao diện responsive, hoạt động tốt ở độ phân giải 1280x720 trở lên.

**NFR-02**: Canvas vẽ bounding box phản hồi mượt mà, không lag khi vẽ.

**NFR-03**: YOLOv8 inference phải hoàn thành trong vòng 5 giây cho một frame/camera.

**NFR-04**: Backend FastAPI phải trả về response trong vòng 500ms cho các API không liên quan đến AI.

**NFR-05**: Dữ liệu annotation được lưu vào SQL Server — không mất dữ liệu khi reload trang.

**NFR-06**: Code JavaScript frontend tổ chức thành module: `auth.js`, `api.js`, `canvas-engine.js`, `utils.js`.

**NFR-07**: Backend Python tổ chức theo cấu trúc: `routers/`, `models/`, `schemas/`, `services/`.
