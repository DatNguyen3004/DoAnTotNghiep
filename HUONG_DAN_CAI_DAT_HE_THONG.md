# Hướng dẫn cài đặt hệ thống NuLabel

Tài liệu này hướng dẫn cài đặt và chạy hệ thống NuLabel trên máy cá nhân. Hệ thống gồm backend FastAPI, frontend tĩnh được phục vụ bởi FastAPI, cơ sở dữ liệu Microsoft SQL Server, mô hình YOLOv8 và dữ liệu nuScenes.

## 1. Yêu cầu môi trường

Máy cài đặt cần có các thành phần sau:

- Windows 10/11.
- Python 3.10 hoặc 3.11.
- Git.
- Microsoft SQL Server và SQL Server Management Studio.
- Trình duyệt web hiện đại như Chrome hoặc Edge.
- Kết nối Internet để tải thư viện Python, mô hình YOLO và bộ dữ liệu nuScenes.

## 2. Lấy source code

Truy cập vào thư mục "02. Source Code và Bộ dữ liệu" trên Google Drive và tải về 2 file nén Source Code và bộ dữ liệu nuScenes.

Cấu trúc chính của project:

NuLabel/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   ├── routers/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   ├── scripts/
│   ├── static/
│   └── weights/
└── ...

## 3. Tạo môi trường Python

Từ thư mục gốc của project, tạo và kích hoạt môi trường ảo:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Chuyển vào thư mục backend và cài thư viện:

```powershell
cd backend
pip install -r requirements.txt
pip install pymssql
```

Lệnh `pip install pymssql` là cần thiết vì chuỗi kết nối hiện tại trong `backend/config.py` dùng dạng `mssql+pymssql`.

Nếu cài đặt gặp lỗi liên quan đến PyTorch/Ultralytics, có thể cài lại Ultralytics:

```powershell
pip install ultralytics==8.2.0
```

## 4. Cấu hình biến môi trường

Trong thư mục `backend/`, sao chép file mẫu:

```powershell
copy .env.example .env
```

Mở file `backend/.env` và cấu hình tối thiểu:

```env
DB_SERVER=localhost
DB_NAME=nulabel
DB_USER=sa
DB_PASSWORD=mat_khau_sql_server

SECRET_KEY=change-this-to-a-random-secret

SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
FRONTEND_URL=http://localhost:8000

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:8000/api/auth/github/callback
```

Các cấu hình Google, GitHub và SMTP có thể để trống nếu chỉ chạy thử các chức năng chính. Không đưa file `.env` thật lên Git.

## 5. Cài đặt SQL Server

Tạo database tên `nulabel` trong SQL Server. Có thể tạo bằng SQL Server Management Studio:

```sql
CREATE DATABASE nulabel;
```

Hoặc chạy script có sẵn từ thư mục `backend/`:

```powershell
python scripts/create_db.py
```

Lưu ý: script `create_db.py` đang dùng tài khoản `sa` và mật khẩu mặc định trong file script. Nếu mật khẩu SQL Server khác, cần chỉnh lại script hoặc tạo database trực tiếp bằng SQL Server Management Studio.

Sau khi database tồn tại, khởi tạo bảng và dữ liệu mẫu:

```powershell
python scripts/init_db.py
```

Tài khoản mẫu sau khi seed:

Admin:   admin / admin123
User:    labeler01 / user123
User:    labeler02 / user123

Nếu code hiện tại có thêm các bảng hoặc cột mới, chạy các migration sau từ thư mục `backend/`:

```powershell
python scripts/migrate_reset_password.py
python scripts/migrate_add_is_deleted.py
python scripts/add_reject_count.py
python scripts/migrate_add_task_submissions.py
python scripts/migrate_add_task_chats.py
python scripts/migrate_add_chat_messages.py
python scripts/migrate_chat_features.py
python scripts/migrate_chat_del_conv.py
python scripts/migrate_chat_group_clear.py
```

Nếu migration báo cột hoặc bảng đã tồn tại thì có thể bỏ qua.

## 6. Chuẩn bị dữ liệu nuScenes

Sau khi tải file zip bộ dữ liệu nuScenes về, giải nén file đó ra, cấu trúc thư mục sẽ có dạng:

D:\Dataset-image\v1.0-mini\
├── samples/
├── sweeps/
└── v1.0-mini/
    ├── scene.json
    ├── sample.json
    ├── sample_data.json
    ├── calibrated_sensor.json
    ├── sensor.json
    └── ...

Điểm quan trọng là thư mục được chọn phải có cấu trúc:

<NUSCENES_ROOT>/
├── samples/
├── sweeps/
└── v1.0-mini/
    ├── scene.json
    ├── sample.json
    ├── sample_data.json
    └── ...

Trong `backend/config.py` vẫn có đường dẫn mặc định dùng khi chưa cấu hình trên giao diện. Tuy nhiên, khi cài trên máy mới, không nên phụ thuộc vào đường dẫn mặc định này vì mỗi máy có thể lưu dataset ở vị trí khác nhau.

Nếu cần import dữ liệu bằng script trong môi trường phát triển, có thể cấu hình đúng đường dẫn trước rồi chạy:

```powershell
python scripts/import_nuscenes.py --project_id 1
```

Nếu muốn tạo task mẫu cho các scene đã import:

```powershell
python scripts/seed_tasks.py
```

## 7. Kiểm tra mô hình YOLOv8

Mô hình YOLO được lưu trong:

```text
backend/weights/
```

Project hiện có các file:

```text
yolov8n.pt (phiên bản nano)
yolov8m.pt (phiên bản medium)
```

Trong `services/ai_service.py`, hệ thống đang ưu tiên dùng:

```text
weights/yolov8m.pt
```

Nếu thiếu file weight, có thể tải tự động thông qua Ultralytics bằng cách chạy một lần script hoặc khởi động server khi có Internet. Tuy nhiên, nên đặt sẵn file `.pt` trong `backend/weights/` để tránh lỗi khi chạy offline.

## 8. Chạy hệ thống

Từ thư mục gốc của project, kích hoạt môi trường ảo nếu chưa kích hoạt:

```powershell
.\.venv\Scripts\Activate.ps1
```

Sau đó chuyển vào thư mục `backend/` và chạy server:

```powershell
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Mở trình duyệt và truy cập:

```text
http://localhost:8000
```

Đường dẫn `/` sẽ chuyển đến trang đăng nhập:

```text
http://localhost:8000/login.html
```

Đăng nhập bằng tài khoản mẫu:

```text
admin / admin123
```

Sau khi chạy hệ thống và đăng nhập bằng tài khoản quản trị viên, vào mục **Cài đặt hệ thống** để chọn hoặc cập nhật đường dẫn nguồn dữ liệu nuScenes. Hệ thống sẽ ghi nhận đường dẫn này vào cấu hình và sử dụng khi tạo dự án mới từ nguồn nuScenes.

Quy trình:

1. Giải nén dữ liệu nuScenes vào một thư mục trên máy.
2. Chạy hệ thống và đăng nhập bằng tài khoản quản trị viên.
3.Vào **Cài đặt hệ thống**.
4. Nhập đường dẫn thư mục gốc của nuScenes (ví dụ: D:\Download\v1.0-mini)
Lưu ý: trong nuScenes có thư mục khác cũng có tên v1.0-mini nằm trong thư mục v1.0-mini ở ngoài, ta sẽ lấy đường dẫn thư mục ngoài.
5. Lưu cấu hình.
6. Quay lại phần quản lý dự án và tạo dự án mới từ nguồn dữ liệu nuScenes.

## 9. Quy trình kiểm tra sau cài đặt

Sau khi đăng nhập, kiểm tra lần lượt:

1. Tạo dự án mới từ nguồn dữ liệu nuScenes.
2. Kiểm tra dữ liệu scene/frame/camera đã được nạp vào dự án.
3. Phân công nhiệm vụ cho người gán nhãn.
4. Mở giao diện gán nhãn và kiểm tra ảnh camera có hiển thị không.
5. Bấm chức năng AI tự động gán nhãn để kiểm tra YOLOv8.
6. Lưu nhãn, nộp nhiệm vụ và kiểm duyệt.
7. Vào phần đánh giá chất lượng để kiểm tra đối sánh IoU.
8. Thử chức năng xuất dữ liệu dự án.

Nếu ảnh không hiển thị, nguyên nhân thường là chưa chọn đúng nguồn dữ liệu trong **Cài đặt hệ thống** hoặc dữ liệu nuScenes chưa được giải nén đúng cấu trúc.

## 10. Lỗi thường gặp

### Không kết nối được SQL Server

Kiểm tra:

- SQL Server đang chạy.
- Database `nulabel` đã tồn tại.
- Tài khoản `sa` được bật.
- `DB_SERVER`, `DB_USER`, `DB_PASSWORD` trong `.env` đúng.
- Đã cài `pymssql`.

### Lỗi thiếu module `pymssql`

Chạy:

```powershell
pip install pymssql
```

### Ảnh nuScenes không hiển thị

Kiểm tra cấu trúc thư mục:

```text
NUSCENES_ROOT/
├── samples/
├── sweeps/
└── v1.0-mini/
```

### YOLO không chạy hoặc load model lỗi

Kiểm tra:

- File weight tồn tại trong `backend/weights/`.
- Đã cài `ultralytics`.
- Python version tương thích.
- Nếu dùng GPU, driver NVIDIA và CUDA phải phù hợp với PyTorch.

### Không gửi được email

Nếu dùng Gmail, cần tạo App Password thay vì dùng mật khẩu tài khoản thường. Cập nhật:

```env
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
```

Nếu không dùng tính năng quên mật khẩu/email, có thể bỏ qua trong môi trường chạy thử.

## 11. Ghi chú triển khai

- Không commit file `.env`, dữ liệu upload, file weight lớn hoặc dữ liệu nuScenes lên repository.
- Dữ liệu nuScenes có dung lượng lớn, nên lưu ngoài thư mục source code.
- Khi chuyển sang máy khác, cần cấu hình lại nguồn dữ liệu trong **Cài đặt hệ thống**, kiểm tra SQL Server và file weight.