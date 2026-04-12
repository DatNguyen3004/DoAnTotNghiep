# TÓM TẮT ĐỀ CƯƠNG ĐỒ ÁN TỐT NGHIỆP
## TRƯỜNG ĐẠI HỌC THỦY LỢI KHOA CÔNG NGHỆ THÔNG TIN

### I. THÔNG TIN CHUNG

*   **Tên đề tài:** Xây dựng hệ thống chuẩn hóa dữ liệu xe tự hành đa cảm biến với hỗ trợ gán nhãn bán tự động - NuLabel
*   **Sinh viên thực hiện:** Nguyễn Tiến Đạt
*   **Mã sinh viên:** 2251172269
*   **Lớp:** 64KTPM4
*   **Số điện thoại:** 0848283838
*   **Email:** 2251172269@e.tlu.edu.vn
*   **Giáo viên hướng dẫn:** ThS. Kiều Tuấn Dũng (Email: dungkt@tlu.edu.vn)

---

### II. TÓM TẮT ĐỀ TÀI

#### 1. Bối cảnh và Thực trạng
*   Trong kỷ nguyên AI, xe tự lái yêu cầu một lượng dữ liệu khổng lồ đã được chuẩn hóa để "nuôi" các thuật toán nhận diện.
*   Dữ liệu xe tự lái (như bộ dữ liệu nuScenes) rất phức tạp, bao gồm hệ thống đa cảm biến với 6 hướng camera đồng bộ theo chuỗi thời gian.
*   Các công cụ gán nhãn hiện nay thường quá chung chung, chưa tối ưu cho đặc thù đa góc nhìn hoặc quá phức tạp để tiếp cận.

#### 2. Vấn đề và Hệ quả
*   **Nút thắt cổ chai:** Chi phí nhân công và thời gian gán nhãn thủ công quá lớn.
*   **Rủi ro chất lượng:** Sai số từ con người khi xử lý hàng ngàn khung hình liên tục tạo ra dữ liệu "rác", đe dọa an toàn khi vận hành AI thực tế.

#### 3. Giải pháp: Phần mềm NuLabel
*   NuLabel là giải pháp Web hiện đại sử dụng công nghệ hỗ trợ để tự động đưa ra các gợi ý ban đầu (auto-draft).
*   Người dùng đóng vai trò "giám khảo" để kiểm tra và tinh chỉnh kết quả.
*   Hệ thống cho phép xử lý đồng bộ nhiều góc nhìn camera cùng lúc, giúp việc gán nhãn chính xác và nhanh chóng hơn.

---

### III. CÁC MỤC TIÊU CHÍNH

1.  **Phát triển nền tảng lõi (Core Platform):** Xây dựng Web app xử lý hình ảnh đa góc nhìn (Multi-view), đồng bộ hóa 360 độ từ 6 camera.
2.  **Cơ chế Human-in-the-loop & AI Pre-labeling:** Tích hợp AI để sinh bản nháp, tối ưu hóa thời gian và công sức của người dùng.
3.  **Học chủ động (Active Learning):** Phân tích độ tin cậy (Confidence scoring) để ưu tiên con người xử lý các khung hình khó hoặc có độ nhiễu cao.
4.  **Kiểm soát chất lượng (QA/QC):** Thiết lập quy trình gán nhãn chéo (Cross-check) và Dashboard theo dõi năng suất (TAT).
5.  **Chuẩn hóa đầu ra:** Đảm bảo dữ liệu xuất bản tuân thủ nghiêm ngặt định dạng metadata của tiêu chuẩn quốc tế nuScenes.

---

### IV. KẾT QUẢ DỰ KIẾN

*   **Sản phẩm phần mềm:** Hệ thống NuLabel Web Platform ổn định với đầy đủ các module gán nhãn, quản trị Workspace và Dashboard phân tích.
*   **Tập dữ liệu minh chứng:** Xuất bản thành công 50~100 scenes thử nghiệm định dạng JSON/Metadata chuẩn nuScenes.
*   **Báo cáo luận văn:** Tài liệu chi tiết về kiến trúc phần mềm, phương pháp Human-in-the-loop và các đánh giá thực nghiệm (Benchmark).
*   **Giá trị thực tiễn:** Chứng minh việc giảm vòng đời xử lý dữ liệu và khả năng chuyển giao mã nguồn cho các đơn vị nghiên cứu AI.

---

### V. TIẾN ĐỘ THỰC HIỆN

| Thời gian | Nội dung công việc | Kết quả dự kiến đạt được |
| :--- | :--- | :--- |
| 03/2026 | Nhận nhiệm vụ, nghiên cứu đề tài và xây dựng đề cương. | Tìm hiểu cấu trúc dữ liệu đa camera; Xác định chức năng chính; Hoàn thiện đề cương chi tiết. |
| 04/2026 | Phác thảo giao diện làm việc đồng bộ 6 camera; Thiết kế CSDL và kiến trúc hệ thống; Triển khai module nạp dữ liệu. | Bản vẽ Figma hoàn chỉnh; Thiết lập CSDL; Các chức năng nền tảng hoạt động ổn định. |
| 05/2026 – 06/2026 | Xây dựng tính năng gán nhãn thông minh; Kiểm thử, sửa lỗi; Hoàn thiện báo cáo và tài liệu. | Phần mềm hoàn chỉnh; Hoàn thiện báo cáo đồ án; Sẵn sàng bảo vệ trước hội đồng. |
