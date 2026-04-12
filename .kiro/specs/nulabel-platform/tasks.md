# Danh sách Task Triển khai NuLabel

## Task 1: Tạo các module JavaScript dùng chung

- [ ] 1.1 Tạo `js/auth.js` — quản lý session (login, logout, auth guard, role check)
- [ ] 1.2 Tạo `js/storage.js` — helpers cho localStorage (getProject, saveAnnotation, getTask, updateTaskStatus)
- [ ] 1.3 Tạo `js/ai-mock.js` — mock AI labeling function trả về danh sách box với confidence score ngẫu nhiên
- [ ] 1.4 Tạo `js/canvas-engine.js` — AnnotationCanvas class với đầy đủ mouse events, vẽ box, chọn box, xóa box

## Task 2: Module Authentication

- [ ] 2.1 Bổ sung logic đăng nhập thật vào `login.html` — validate form, kiểm tra credentials, lưu session, redirect theo role
- [ ] 2.2 Bổ sung logic đăng ký vào `signUp.html` — validate form, lưu user mới vào localStorage
- [ ] 2.3 Thêm auth guard vào tất cả trang Admin/ và User/ — redirect về login nếu chưa đăng nhập
- [ ] 2.4 Thêm logic đăng xuất vào nút "Đăng xuất" trên ManagerProject.html

## Task 3: Module Project Management

- [ ] 3.1 Bổ sung logic tạo project vào modal "Tạo Dự án Mới" — lưu project vào localStorage, hiển thị card mới
- [ ] 3.2 Load danh sách project từ localStorage khi mở ManagerProject.html
- [ ] 3.3 Ẩn nút "Tạo Dự án Mới" với User role (chỉ Admin mới thấy)
- [ ] 3.4 Xử lý click vào project card — lưu projectId vào sessionStorage, chuyển đến dashboard

## Task 4: Module Dashboard

- [ ] 4.1 Load và hiển thị danh sách task/dataset từ localStorage theo projectId
- [ ] 4.2 Cập nhật stats cards với dữ liệu thật từ localStorage
- [ ] 4.3 Hiển thị đúng hành động theo trạng thái task (Mở gán nhãn / Xem lại / Sửa lại)
- [ ] 4.4 Cập nhật progress bar theo số frame đã gán nhãn / tổng frame
- [ ] 4.5 Bổ sung chức năng tìm kiếm dataset theo tên

## Task 5: Canvas Annotation Engine (Core)

- [ ] 5.1 Implement `AnnotationCanvas` class với HTML5 Canvas overlay trên `<img>`
- [ ] 5.2 Implement mousedown/mousemove/mouseup để vẽ bounding box
- [ ] 5.3 Implement tọa độ chuẩn hóa (0.0-1.0) khi lưu, convert sang pixel khi render
- [ ] 5.4 Implement click để chọn box, highlight box đang chọn
- [ ] 5.5 Implement xóa box bằng phím DEL và nút trash
- [ ] 5.6 Implement undo (Ctrl+Z) — lưu history stack
- [ ] 5.7 Implement zoom (scroll wheel) và pan (drag khi ở pan mode)
- [ ] 5.8 Implement render box với màu khác nhau: teal (bình thường), đỏ (cần review)
- [ ] 5.9 Implement read-only mode cho trang review (không cho vẽ thêm)

## Task 6: Label Workspace

- [ ] 6.1 Tích hợp `AnnotationCanvas` vào `Admin/Label.html` và `User/Label.html`
- [ ] 6.2 Implement click vào camera thumbnail để chuyển ảnh hiển thị trên canvas
- [ ] 6.3 Implement dialog/dropdown chọn class sau khi vẽ xong box
- [ ] 6.4 Cập nhật danh sách labels ở panel phải khi thêm/xóa box
- [ ] 6.5 Implement frame navigation (nút mũi tên, phím A/D)
- [ ] 6.6 Implement timer đếm giờ thật (setInterval, format HH:MM:SS)
- [ ] 6.7 Implement auto-save khi chuyển frame
- [ ] 6.8 Implement nút "Lưu" — lưu annotation vào localStorage
- [ ] 6.9 Implement nút "Nộp" — validate có ít nhất 1 annotation, cập nhật task status = 'submitted'
- [ ] 6.10 Implement Label_Review.html — load annotation read-only, không cho chỉnh sửa

## Task 7: AI Auto-labeling

- [ ] 7.1 Kết nối nút "AI TỰ ĐỘNG GÁN NHÃN" với `ai-mock.js`
- [ ] 7.2 Hiển thị loading state khi AI đang xử lý (spinner, disable button)
- [ ] 7.3 Render box AI với confidence score, phân biệt màu theo threshold
- [ ] 7.4 Hiển thị icon cảnh báo ⚑ trên box có confidence thấp
- [ ] 7.5 Hiển thị badge "cần review" trên label item trong danh sách

## Task 8: Review / QA Module

- [ ] 8.1 Implement tab switching trong `Test.html` (Bài làm của tôi / Chờ phê duyệt)
- [ ] 8.2 Load danh sách task theo tab từ localStorage
- [ ] 8.3 Implement nút "Kiểm tra ngay" — chuyển đến Test2.html với taskId
- [ ] 8.4 Tích hợp `AnnotationCanvas` read-only vào `Test2.html`
- [ ] 8.5 Implement nút "Đúng" (Approve) — cập nhật task status = 'approved'
- [ ] 8.6 Implement nút "Sai" (Reject) — validate feedback không rỗng, cập nhật status = 'rejected'
- [ ] 8.7 Hiển thị feedback của reviewer trong tab "Bài làm của tôi"

## Task 9: Quản lý người dùng

- [ ] 9.1 Load danh sách user từ localStorage vào bảng `ManagerUser.html`
- [ ] 9.2 Implement nút "Thêm cộng tác viên" — modal nhập email, thêm user vào project
- [ ] 9.3 Implement nút xóa user — confirm dialog, xóa khỏi project
- [ ] 9.4 Implement xem profile user (read-only mode qua `?mode=view`)

## Task 10: Settings

- [ ] 10.1 Lưu giá trị AI threshold vào localStorage khi kéo slider
- [ ] 10.2 Load giá trị threshold từ localStorage khi mở trang
- [ ] 10.3 Implement phím tắt toàn cục trong Label Workspace (A/D, DEL, Ctrl+Z, Ctrl+S, ESC)
- [ ] 10.4 Implement chức năng export JSON — tổng hợp annotation, tạo file .zip download

## Task 11: Hoàn thiện và kiểm thử

- [ ] 11.1 Kiểm tra toàn bộ luồng Admin: đăng nhập → tạo project → gán nhãn → review
- [ ] 11.2 Kiểm tra toàn bộ luồng User: đăng nhập → xem task → gán nhãn → nộp bài
- [ ] 11.3 Kiểm tra auth guard — thử truy cập trực tiếp URL khi chưa đăng nhập
- [ ] 11.4 Kiểm tra cross-role — User không truy cập được trang Admin
- [ ] 11.5 Kiểm tra annotation data — tọa độ box đúng khi resize cửa sổ
- [ ] 11.6 Kiểm tra AI threshold — box đỏ/xanh đúng theo giá trị threshold
