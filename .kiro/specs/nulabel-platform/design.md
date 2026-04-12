# Thiết kế Hệ thống NuLabel

## 1. Tổng quan kiến trúc

NuLabel là web platform gán nhãn dữ liệu xe tự hành đa cảm biến, xây dựng bằng HTML/CSS/JavaScript thuần (frontend-only). Dữ liệu được lưu trữ tạm thời trong `localStorage` cho prototype, hướng tới tích hợp backend REST API sau này.

```
┌─────────────────────────────────────────────────────┐
│                   NuLabel Frontend                   │
├──────────────┬──────────────────┬───────────────────┤
│  Auth Module │  Project Module  │  Label Module     │
│  login.html  │  ManagerProject  │  Label.html       │
│  signUp.html │  dashboard.html  │  Label_Review.html│
├──────────────┴──────────────────┴───────────────────┤
│              Review / QA Module                      │
│              Test.html / Test2.html                  │
├─────────────────────────────────────────────────────┤
│              Settings / User Module                  │
│              setting.html / Profile.html             │
└─────────────────────────────────────────────────────┘
```

## 2. Vai trò người dùng

| Vai trò | Quyền hạn |
|---------|-----------|
| **Admin** | Tạo project, quản lý user, gán nhãn, review/approve bài |
| **User (Labeler)** | Nhận task, gán nhãn, nộp bài, xem lại bài đã nộp |

## 3. Cấu trúc dữ liệu nuScenes

### 3.1 Phân cấp dữ liệu

```
Dataset
└── Scene (đoạn video ~20 giây)
    └── Frame (keyframe, ~40 frame/scene)
        └── 6 Camera Images
            ├── CAM_FRONT
            ├── CAM_FRONT_LEFT
            ├── CAM_FRONT_RIGHT
            ├── CAM_BACK
            ├── CAM_BACK_LEFT
            └── CAM_BACK_RIGHT
```

### 3.2 Annotation JSON Format

```json
{
  "scene_token": "n015-2018-07-24-11-22-45+0800",
  "frame_index": 0,
  "timestamp": 1532402927814384,
  "labeler_id": "user_001",
  "status": "submitted",
  "annotations": [
    {
      "instance_token": "obj_4291_a",
      "camera": "CAM_FRONT",
      "category": "vehicle.car",
      "bbox": { "x": 450, "y": 320, "width": 120, "height": 80 },
      "confidence": 0.92,
      "is_ai_generated": true,
      "needs_review": false,
      "reviewer_note": ""
    }
  ]
}
```

### 3.3 Danh sách class (category)

| Class | Nhãn hiển thị | Icon |
|-------|--------------|------|
| `vehicle.car` | Xe con | fa-car |
| `vehicle.truck` | Xe tải | fa-truck |
| `vehicle.bus` | Xe buýt | fa-bus |
| `vehicle.motorcycle` | Xe máy | fa-motorcycle |
| `human.pedestrian` | Người đi bộ | fa-person-walking |
| `vehicle.bicycle` | Xe đạp | fa-bicycle |

## 4. Trạng thái Task

```
[Chưa nộp] ──submit──> [Chờ duyệt] ──approve──> [Đạt]
                              │
                           reject
                              │
                              v
                         [Lỗi/Cần sửa] ──resubmit──> [Chờ duyệt]
```

| Trạng thái | Màu badge | Hành động có thể |
|-----------|-----------|-----------------|
| Chưa nộp | Vàng (warning) | Mở gán nhãn |
| Đang làm | Xanh dương nhạt | Tiếp tục gán nhãn |
| Chờ duyệt | Xanh lá (success) | Xem lại (read-only) |
| Đạt | Xanh lá đậm | Xem lại (read-only) |
| Lỗi/Cần sửa | Đỏ (error) | Mở sửa lại |

## 5. Thiết kế từng Module

### 5.1 Authentication Module

**Trang**: `login.html`, `signUp.html`

**Luồng đăng nhập**:
1. User nhập username + password
2. Kiểm tra credentials (localStorage hoặc hardcode cho prototype)
3. Lưu session: `{ userId, role, name }` vào `sessionStorage`
4. Redirect theo role: Admin → `Admin/ManagerProject.html`, User → `User/ManagerProject.html`

**Validation**:
- Username: không rỗng, 3-50 ký tự
- Password: không rỗng, tối thiểu 6 ký tự
- Hiển thị lỗi inline dưới input

### 5.2 Project Management Module

**Trang**: `Admin/ManagerProject.html`, `User/ManagerProject.html`

**Sự khác biệt Admin vs User**:
- Admin: có nút "Tạo Dự án Mới", thấy tất cả project
- User: không có nút tạo, chỉ thấy project được giao

**Dữ liệu project** (localStorage):
```json
{
  "id": "proj_001",
  "name": "Thiết kế Nhận diện NuLabel",
  "description": "...",
  "created_at": "2024-05-12",
  "dataset_count": 156,
  "members": ["admin", "user_001", "user_002"]
}
```

### 5.3 Dashboard Module

**Trang**: `Admin/dashboard.html`, `User/dashboard.html`

**Stats cards** (Admin):
- Tổng số frame trong project
- Số frame đã hoàn thành
- Số frame cần chú ý (lỗi/confidence thấp)
- Thời gian hoàn thành trung bình

**Stats cards** (User):
- Task được giao
- Task đã hoàn thành
- Task đang chờ duyệt
- Task bị reject

**Bảng dataset**: hiển thị danh sách scene/folder với trạng thái, tiến độ, hành động

### 5.4 Label Workspace Module (Core Feature)

**Trang**: `Admin/Label.html`, `User/Label.html`

#### Layout 3 cột:

```
┌──────────┬─────────────────────────┬──────────┐
│ CAMS     │                         │ TOOLS    │
│ PANEL    │    CANVAS (ảnh + bbox)  │ PANEL    │
│ (220px)  │                         │ (320px)  │
│          │                         │          │
│ 6 camera │   HTML5 Canvas overlay  │ Toolbar  │
│ thumbs   │   trên thẻ <img>        │ Labels   │
│          │                         │ Footer   │
└──────────┴─────────────────────────┴──────────┘
```

#### Canvas Implementation:

```javascript
// Cấu trúc dữ liệu box
const box = {
  id: generateId(),
  camera: 'CAM_FRONT',
  frameIndex: currentFrame,
  x: startX,      // tọa độ tương đối (0-1)
  y: startY,
  width: w,
  height: h,
  category: 'vehicle.car',
  confidence: null,  // null = vẽ tay, 0-1 = AI
  isAiGenerated: false,
  needsReview: false
}

// Mouse events
canvas.addEventListener('mousedown', startDrawing)
canvas.addEventListener('mousemove', drawPreview)
canvas.addEventListener('mouseup', finishDrawing)
```

#### Tọa độ chuẩn hóa:
- Lưu tọa độ dạng tỷ lệ (0.0 - 1.0) để độc lập với kích thước hiển thị
- Khi render: `pixelX = relativeX * canvas.width`

#### AI Auto-labeling Flow:
1. User nhấn "AI TỰ ĐỘNG GÁN NHÃN"
2. Hiển thị loading spinner
3. AI trả về danh sách box với confidence score
4. Box có `confidence >= threshold` → viền teal bình thường
5. Box có `confidence < threshold` → viền đỏ + icon `⚑` cảnh báo
6. User review, chỉnh sửa, xóa box sai, thêm box bị bỏ sót

#### Active Learning (cờ đỏ):
- Threshold mặc định: 0.85 (cấu hình trong Settings)
- Box cần review: `needsReview = true`, viền màu `#DC2626`
- Badge đỏ trên label item trong danh sách

#### Frame Navigation:
- Toolbar: nút `◀ ▶` để chuyển frame
- Phím tắt: `A` (prev), `D` (next)
- Progress bar cập nhật theo frame hiện tại
- Tự động lưu khi chuyển frame

#### Timer:
- Bắt đầu đếm khi mở workspace
- Format: `HH:MM:SS`
- Lưu thời gian làm việc vào annotation data

### 5.5 Review/QA Module

**Trang**: `Admin/Test.html`, `Admin/Test2.html`

**Tab "Bài làm của tôi"** (Admin xem bài mình đã gán nhãn):
- Danh sách task với trạng thái, feedback từ reviewer khác

**Tab "Chờ phê duyệt"** (Admin review bài của Labeler):
- Danh sách bài đã nộp, chờ review
- Nút "Kiểm tra ngay" → mở `Test2.html` (Label_Approve)

**Trang phê duyệt** (`Test2.html`):
- Canvas read-only: hiển thị box đã gán nhãn, không cho vẽ thêm
- Panel phải: danh sách labels, textarea feedback
- Nút "Đúng" (Approve) / "Sai" (Reject)
- Khi Reject: bắt buộc nhập feedback trước khi submit

### 5.6 Settings Module

**Trang**: `Admin/setting.html`, `User/setting.html`

**Cấu hình AI**:
- Confidence Threshold: slider 0.01 - 1.0, mặc định 0.85
- Lưu vào `localStorage['ai_threshold']`

**Phím tắt** (có thể tùy chỉnh sau):
- `A/D`: prev/next frame
- `ESC`: hủy đang vẽ
- `DEL`: xóa box đang chọn
- `Ctrl+Z`: undo
- `Ctrl+S`: lưu
- `Space`: toggle pan mode

**Export**:
- Xuất tất cả annotation của project thành file `.zip`
- Mỗi scene là 1 file JSON chuẩn nuScenes

## 6. Luồng dữ liệu tổng thể

```
[Login] → sessionStorage{userId, role}
    ↓
[ManagerProject] → localStorage{projects[]}
    ↓
[Dashboard] → localStorage{tasks[], annotations{}}
    ↓
[Label Workspace]
    ├── Load: localStorage{annotations[sceneId][frameIndex]}
    ├── AI Call: mock function → trả về boxes[]
    ├── Save: localStorage{annotations[sceneId][frameIndex]}
    └── Submit: task.status = 'submitted'
    ↓
[Review/QA]
    ├── Load: task.status === 'submitted'
    ├── Approve: task.status = 'approved'
    └── Reject: task.status = 'rejected', task.feedback = '...'
```

## 7. Shared Components (tái sử dụng)

### 7.1 Sidebar Component
- Dùng chung CSS class, khác nhau ở nav items theo role
- Toggle collapse/expand với localStorage persistence

### 7.2 Canvas Annotation Engine
- File riêng: `js/canvas-engine.js`
- Export: `AnnotationCanvas` class
- Dùng chung cho Label.html và Test2.html (read-only mode)

### 7.3 Auth Guard
- File: `js/auth.js`
- Kiểm tra `sessionStorage` khi load trang
- Redirect về login nếu chưa đăng nhập

## 8. Cấu trúc file đề xuất

```
/
├── login.html
├── signUp.html
├── js/
│   ├── auth.js          (auth guard, session management)
│   ├── canvas-engine.js (annotation canvas logic)
│   ├── storage.js       (localStorage helpers)
│   └── ai-mock.js       (mock AI labeling function)
├── Admin/
│   ├── dashboard.html
│   ├── Label.html
│   ├── Label_Review.html
│   ├── ManagerProject.html
│   ├── ManagerUser.html
│   ├── Profile.html
│   ├── setting.html
│   ├── Test.html
│   └── Test2.html
└── User/
    ├── dashboard.html
    ├── Label.html
    ├── Label_Review.html
    ├── ManagerProject.html
    ├── Profile.html
    ├── setting.html
    ├── Test.html
    └── Test2.html
```
