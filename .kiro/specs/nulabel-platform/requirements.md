# Yêu cầu Hệ thống NuLabel

## Giới thiệu

NuLabel là hệ thống web gán nhãn dữ liệu xe tự hành đa cảm biến, hỗ trợ bộ dữ liệu nuScenes với 6 camera đồng bộ. Hệ thống áp dụng cơ chế Human-in-the-loop kết hợp AI Pre-labeling và Active Learning để tối ưu hóa quy trình gán nhãn.

---

## Yêu cầu chức năng

### REQ-01: Xác thực người dùng

**REQ-01.1** Hệ thống phải cho phép người dùng đăng nhập bằng username và password.

**REQ-01.2** Hệ thống phải phân biệt hai vai trò: Admin và User (Labeler).

**REQ-01.3** Sau khi đăng nhập, Admin được chuyển đến `Admin/ManagerProject.html`, User được chuyển đến `User/ManagerProject.html`.

**REQ-01.4** Hệ thống phải bảo vệ các trang yêu cầu đăng nhập — nếu chưa đăng nhập, tự động redirect về `login.html`.

**REQ-01.5** Hệ thống phải cho phép đăng xuất và xóa session.

**Correctness Properties**:
- P1: Không có trang nào trong Admin/ hoặc User/ có thể truy cập khi chưa đăng nhập
- P2: User không thể truy cập trang Admin/ và ngược lại

---

### REQ-02: Quản lý Dự án

**REQ-02.1** Admin phải có thể tạo dự án mới với tên, mô tả, và upload dataset.

**REQ-02.2** Cả Admin và User đều thấy danh sách dự án được giao.

**REQ-02.3** User không có quyền tạo dự án mới.

**REQ-02.4** Nhấn vào project card phải chuyển đến dashboard của project đó.

---

### REQ-03: Dashboard

**REQ-03.1** Dashboard Admin phải hiển thị 4 thống kê: tổng frame, frame hoàn thành, frame cần chú ý, thời gian trung bình.

**REQ-03.2** Dashboard User phải hiển thị danh sách dataset/task được giao với trạng thái và tiến độ.

**REQ-03.3** Mỗi row trong bảng phải có hành động phù hợp theo trạng thái:
- Chưa nộp / Đang làm → "Mở gán nhãn" (link đến Label.html)
- Chờ duyệt → "Xem lại" (link đến Label_Review.html, read-only)
- Lỗi/Cần sửa → "Sửa lại" (link đến Label.html)

---

### REQ-04: Label Workspace (Gán nhãn)

**REQ-04.1** Workspace phải hiển thị 6 camera thumbnails ở panel trái, click để chuyển camera đang xem.

**REQ-04.2** Canvas trung tâm phải hiển thị ảnh của camera đang chọn với overlay để vẽ bounding box.

**REQ-04.3** Người dùng phải có thể vẽ bounding box bằng cách click-drag trên canvas.

**REQ-04.4** Sau khi vẽ xong box, hệ thống phải hiện dialog/dropdown để chọn class (xe con, xe tải, xe buýt, xe máy, người đi bộ, xe đạp).

**REQ-04.5** Người dùng phải có thể chọn box đã vẽ bằng cách click vào nó.

**REQ-04.6** Người dùng phải có thể xóa box đang chọn bằng phím DEL hoặc nút trash.

**REQ-04.7** Hệ thống phải hỗ trợ navigate giữa các frame bằng nút mũi tên hoặc phím A/D.

**REQ-04.8** Timer phải đếm thời gian làm việc thực tế từ khi mở workspace.

**REQ-04.9** Nút "Lưu" phải lưu annotation hiện tại vào localStorage mà không submit.

**REQ-04.10** Nút "Nộp" phải lưu và chuyển trạng thái task sang "Chờ duyệt".

**Correctness Properties**:
- P3: Tọa độ bounding box phải được lưu dạng tỷ lệ (0.0-1.0) để độc lập với kích thước màn hình
- P4: Mỗi box phải có đúng một class được gán
- P5: Không thể nộp bài khi chưa có ít nhất 1 annotation

---

### REQ-05: AI Auto-labeling

**REQ-05.1** Nút "AI TỰ ĐỘNG GÁN NHÃN" phải tự động tạo bounding box gợi ý cho frame hiện tại.

**REQ-05.2** Mỗi box do AI tạo ra phải có confidence score (0.0 - 1.0).

**REQ-05.3** Box có confidence < threshold phải được hiển thị với viền đỏ và icon cảnh báo.

**REQ-05.4** Box có confidence >= threshold phải được hiển thị bình thường (viền teal).

**REQ-05.5** Người dùng phải có thể chỉnh sửa, xóa, hoặc giữ nguyên các box do AI tạo.

**REQ-05.6** Threshold mặc định là 0.85, có thể thay đổi trong Settings.

**Correctness Properties**:
- P6: Tất cả box có `confidence < threshold` phải có `needsReview = true`
- P7: Sau khi user chỉnh sửa box AI, `is_ai_generated` vẫn là `true` nhưng tọa độ được cập nhật

---

### REQ-06: Review / QA (Kiểm duyệt chéo)

**REQ-06.1** Trang Test.html phải có 2 tab: "Bài làm của tôi" và "Chờ phê duyệt".

**REQ-06.2** Tab "Chờ phê duyệt" phải hiển thị danh sách bài đã nộp của Labeler, chờ Admin review.

**REQ-06.3** Admin phải có thể mở bài để xem chi tiết (canvas read-only).

**REQ-06.4** Admin phải có thể Approve (Đúng) hoặc Reject (Sai) kèm comment.

**REQ-06.5** Khi Reject, trường feedback phải bắt buộc nhập trước khi submit.

**REQ-06.6** Sau khi Approve/Reject, task phải cập nhật trạng thái tương ứng.

**REQ-06.7** Labeler phải thấy feedback của reviewer trong tab "Bài làm của tôi".

**Correctness Properties**:
- P8: Canvas trong trang review phải là read-only — không cho phép vẽ thêm box
- P9: Không thể Reject mà không có feedback

---

### REQ-07: Quản lý người dùng

**REQ-07.1** Admin phải có thể xem danh sách user trong project.

**REQ-07.2** Admin phải có thể thêm cộng tác viên (Labeler) vào project.

**REQ-07.3** Admin phải có thể xóa user khỏi project.

**REQ-07.4** Admin phải có thể xem thông tin chi tiết của từng user (read-only).

---

### REQ-08: Cài đặt

**REQ-08.1** Người dùng phải có thể điều chỉnh AI Confidence Threshold bằng slider.

**REQ-08.2** Giá trị threshold phải được lưu vào localStorage và áp dụng ngay.

**REQ-08.3** Hệ thống phải hỗ trợ các phím tắt: A/D (frame nav), DEL (xóa box), Ctrl+Z (undo), Ctrl+S (lưu), ESC (hủy vẽ).

**REQ-08.4** Admin phải có thể export annotation của project thành file JSON chuẩn nuScenes.

---

## Yêu cầu phi chức năng

**NFR-01**: Giao diện phải responsive, hoạt động tốt ở độ phân giải 1280x720 trở lên.

**NFR-02**: Canvas vẽ bounding box phải phản hồi mượt mà, không lag khi vẽ.

**NFR-03**: Dữ liệu annotation phải được lưu tự động mỗi khi chuyển frame (auto-save).

**NFR-04**: Hệ thống phải hoạt động hoàn toàn offline (không cần internet sau khi load).

**NFR-05**: Code JavaScript phải được tổ chức thành các module riêng biệt (auth.js, canvas-engine.js, storage.js, ai-mock.js).
