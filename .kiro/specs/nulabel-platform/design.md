# Thiết kế Hệ thống NuLabel

## 1. Tổng quan kiến trúc

NuLabel là web platform gán nhãn dữ liệu xe tự hành đa cảm biến, sử dụng bộ dữ liệu nuScenes mini (4GB). Hệ thống theo kiến trúc client-server: Frontend HTML/CSS/Bootstrap giao tiếp với Backend FastAPI qua REST API, dữ liệu lưu trữ trong SQL Server, ảnh nuScenes đặt trực tiếp trên server.

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Browser)                        │
│   HTML + CSS thuần + Bootstrap                                   │
│   Admin/  ←→  User/  ←→  login.html                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP REST API (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI / Python)                   │
│   Auth  │  Projects  │  Datasets  │  Annotations  │  AI Infer   │
└────┬────┴─────┬──────┴─────┬──────┴───────┬────────┴─────┬──────┘
     │          │            │              │              │
     ▼          ▼            ▼              ▼              ▼
┌──────────┐         ┌──────────────┐              ┌─────────────┐
│SQL Server│         │ nuScenes     │              │  YOLOv8 +   │
│(metadata)│         │ Dataset      │              │  OpenCV     │
│          │         │ (disk/server)│              │  (inference)│
└──────────┘         └──────────────┘              └─────────────┘
```

## 2. Vai trò người dùng

| Vai trò | Quyền hạn |
|---------|-----------|
| **Admin** | Tạo project, tạo tài khoản user, gán task, xem tổng quan tất cả task, override kết quả review, export |
| **User (Labeler)** | Nhận task, gán nhãn, nộp bài, review bài của Labeler khác (kiểm duyệt chéo), xem lại bài đã nộp |

> **Lưu ý quan trọng**: Admin **không** tự gán nhãn và **không** trực tiếp review bài. Kiểm duyệt được thực hiện tự động giữa các Labeler (kiểm duyệt chéo). Admin chỉ xem tổng quan và override khi cần.

## 3. Cấu trúc dữ liệu nuScenes

### 3.1 Phân cấp dữ liệu

```
nuScenes mini dataset (trên server)
└── Scene (đoạn video ~20 giây, ~700 scene)
    └── Frame (keyframe, ~40 frame/scene)
        └── 6 Camera Images
            ├── CAM_FRONT
            ├── CAM_FRONT_LEFT
            ├── CAM_FRONT_RIGHT
            ├── CAM_BACK
            ├── CAM_BACK_LEFT
            └── CAM_BACK_RIGHT
```

### 3.2 Danh sách class (category)

| Class | Nhãn hiển thị | Icon |
|-------|--------------|------|
| `vehicle.car` | Xe con | fa-car |
| `vehicle.truck` | Xe tải | fa-truck |
| `vehicle.bus` | Xe buýt | fa-bus |
| `vehicle.motorcycle` | Xe máy | fa-motorcycle |
| `human.pedestrian` | Người đi bộ | fa-person-walking |
| `vehicle.bicycle` | Xe đạp | fa-bicycle |

### 3.3 Trạng thái Task (Luồng kiểm duyệt chéo)

```
[pending] ──Labeler mở──> [in_progress] ──Labeler nộp──> [submitted]
                                                               │
                                          Hệ thống tự giao review cho Labeler khác
                                                               │
                                                               ▼
                                                        [under_review]
                                                        /            \
                                              Reviewer Approve    Reviewer Reject + feedback
                                                    │                      │
                                                    ▼                      ▼
                                              [approved]             [rejected]
                                                                           │
                                                               Labeler sửa lại → [submitted] lại
```

| Trạng thái | Màu badge | Hành động (Labeler) | Hành động (Reviewer) |
|-----------|-----------|---------------------|----------------------|
| `pending` | Vàng | Mở gán nhãn | — |
| `in_progress` | Xanh dương nhạt | Tiếp tục gán nhãn | — |
| `submitted` | Xanh lá nhạt | Xem lại (read-only) | — |
| `under_review` | Cam | Xem lại (read-only) | Approve / Reject |
| `approved` | Xlại | — |
anh lá đậm | Xem lại (read-only) | — |
| `rejected` | Đỏ | Mở sửa 
**Quy tắc kiểm duyệt chéo**:
- Khi Labeler A nộp bài (`POST /api/tasks/{id}/submit`), hệ thống tự động tìm 1 Labeler khác trong project (không phải Labeler A) và gán làm reviewer
- Labeler được chọn làm reviewer theo chiến lược **least-loaded** (ít task review nhất hiện tại)
- Labeler B thấy task cần review trong dashboard (tab "Cần review")
- Labeler B mở canvas read-only → Approve hoặc Reject kèm feedback bắt buộc
- Admin xem tổng quan tất cả, có thể override nếu cần

---

## 4. Database Schema (SQL Server)

### 4.1 Bảng `users`

```sql
CREATE TABLE users (
    id          INT IDENTITY PRIMARY KEY,
    username    NVARCHAR(50)  NOT NULL UNIQUE,
    email       NVARCHAR(100) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    role        NVARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'user')),
    full_name   NVARCHAR(100),
    created_at  DATETIME2 DEFAULT GETDATE(),
    is_active   BIT DEFAULT 1
);
```

### 4.2 Bảng `projects`

```sql
CREATE TABLE projects (
    id          INT IDENTITY PRIMARY KEY,
    name        NVARCHAR(200) NOT NULL,
    description NVARCHAR(MAX),
    created_by  INT NOT NULL REFERENCES users(id),
    created_at  DATETIME2 DEFAULT GETDATE(),
    is_active   BIT DEFAULT 1
);

CREATE TABLE project_members (
    project_id  INT NOT NULL REFERENCES projects(id),
    user_id     INT NOT NULL REFERENCES users(id),
    joined_at   DATETIME2 DEFAULT GETDATE(),
    PRIMARY KEY (project_id, user_id)
);
```

### 4.3 Bảng `scenes` và `frames`

```sql
CREATE TABLE scenes (
    id          INT IDENTITY PRIMARY KEY,
    project_id  INT NOT NULL REFERENCES projects(id),
    scene_token NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(500),
    frame_count INT NOT NULL DEFAULT 0
);

CREATE TABLE frames (
    id          INT IDENTITY PRIMARY KEY,
    scene_id    INT NOT NULL REFERENCES scenes(id),
    frame_index INT NOT NULL,
    timestamp   BIGINT,
    -- Đường dẫn tương đối đến file ảnh trên server
    cam_front        NVARCHAR(500),
    cam_front_left   NVARCHAR(500),
    cam_front_right  NVARCHAR(500),
    cam_back         NVARCHAR(500),
    cam_back_left    NVARCHAR(500),
    cam_back_right   NVARCHAR(500),
    UNIQUE (scene_id, frame_index)
);
```

### 4.4 Bảng `tasks`

```sql
CREATE TABLE tasks (
    id          INT IDENTITY PRIMARY KEY,
    project_id  INT NOT NULL REFERENCES projects(id),
    scene_id    INT NOT NULL REFERENCES scenes(id),
    assigned_to INT NOT NULL REFERENCES users(id),   -- Labeler được giao gán nhãn
    reviewer_id INT REFERENCES users(id),            -- Labeler được giao review (khác assigned_to)
    status      NVARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','submitted','under_review','approved','rejected')),
    feedback    NVARCHAR(MAX),
    time_spent  INT DEFAULT 0,   -- giây
    created_at  DATETIME2 DEFAULT GETDATE(),
    updated_at  DATETIME2 DEFAULT GETDATE()
);
```

> **Lưu ý**: Cột `reviewer_id` lưu ID của Labeler được hệ thống tự động gán làm reviewer (khác `assigned_to`). Cột `reviewed_by` cũ đã được thay thế bằng `reviewer_id`. Admin không xuất hiện trong cột này.

### 4.5 Bảng `annotations`

```sql
CREATE TABLE annotations (
    id              INT IDENTITY PRIMARY KEY,
    task_id         INT NOT NULL REFERENCES tasks(id),
    frame_id        INT NOT NULL REFERENCES frames(id),
    camera          NVARCHAR(30) NOT NULL,
    category        NVARCHAR(50) NOT NULL,
    -- Tọa độ chuẩn hóa (0.0 - 1.0)
    bbox_x          FLOAT NOT NULL,
    bbox_y          FLOAT NOT NULL,
    bbox_w          FLOAT NOT NULL,
    bbox_h          FLOAT NOT NULL,
    confidence      FLOAT,           -- NULL = vẽ tay, 0-1 = AI
    is_ai_generated BIT DEFAULT 0,
    needs_review    BIT DEFAULT 0,
    created_at      DATETIME2 DEFAULT GETDATE(),
    updated_at      DATETIME2 DEFAULT GETDATE()
);
```

---

## 5. Backend API Endpoints (FastAPI)

### 5.1 Authentication

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/login` | Đăng nhập, trả về JWT token |
| POST | `/api/auth/logout` | Đăng xuất (invalidate token) |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại |

> **Lưu ý**: Đã bỏ `POST /api/auth/register` — User không tự đăng ký. Admin tạo tài khoản qua `POST /api/users`.

**Request login**:
```json
{ "username": "admin01", "password": "secret123" }
```

**Response login**:
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer",
  "user": { "id": 1, "username": "admin01", "role": "admin", "full_name": "Nguyễn Admin" }
}
```

### 5.2 Projects

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/projects` | Danh sách project của user hiện tại |
| POST | `/api/projects` | Tạo project mới (Admin only) |
| GET | `/api/projects/{id}` | Chi tiết project |
| PUT | `/api/projects/{id}` | Cập nhật project (Admin only) |
| GET | `/api/projects/{id}/members` | Danh sách thành viên |
| POST | `/api/projects/{id}/members` | Thêm thành viên |
| DELETE | `/api/projects/{id}/members/{user_id}` | Xóa thành viên |

### 5.3 Datasets / Scenes / Frames

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/projects/{id}/scenes` | Danh sách scene trong project |
| GET | `/api/scenes/{id}/frames` | Danh sách frame trong scene |
| GET | `/api/frames/{id}/image/{camera}` | Trả về file ảnh (binary) |
| GET | `/api/frames/{id}/metadata` | Metadata của frame |

**Lưu ý**: Endpoint `/api/frames/{id}/image/{camera}` đọc file ảnh từ disk và trả về `FileResponse`, không lưu ảnh trong database.

### 5.4 Users

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/users` | Danh sách tất cả user (Admin only) |
| GET | `/api/users/{id}` | Chi tiết user |
| POST | `/api/users` | Admin tạo tài khoản user mới (Admin only) |

**Request tạo user**:
```json
{
  "username": "labeler01",
  "full_name": "Nguyễn Văn A",
  "password": "secret123",
  "role": "user"
}
```

### 5.4 Tasks

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/tasks` | Danh sách task của user (filter theo project, status, role) |
| GET | `/api/tasks?role=reviewer` | Danh sách task mà user hiện tại là reviewer |
| GET | `/api/tasks/{id}` | Chi tiết task |
| PUT | `/api/tasks/{id}/status` | Cập nhật trạng thái task |
| POST | `/api/tasks/{id}/submit` | Nộp bài — tự động assign reviewer (Labeler khác trong project) |
| POST | `/api/tasks/{id}/review/approve` | Labeler reviewer approve |
| POST | `/api/tasks/{id}/review/reject` | Labeler reviewer reject + feedback bắt buộc |
| POST | `/api/tasks/{id}/admin/override` | Admin override kết quả review (Admin only) |

**Logic tự động assign reviewer** (trong `POST /api/tasks/{id}/submit`):
```python
# Tìm Labeler khác trong project, ít task review nhất (least-loaded)
def assign_reviewer(task_id: int, project_id: int, labeler_id: int) -> int:
    # Lấy tất cả member của project có role='user', trừ labeler_id
    # Đếm số task đang under_review của mỗi member
    # Chọn người có ít nhất → gán reviewer_id
    # Cập nhật task.status = 'under_review'
    pass
```

### 5.5 Annotations

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/tasks/{id}/annotations` | Lấy tất cả annotation của task |
| GET | `/api/tasks/{id}/annotations/{frame_id}` | Annotation theo frame |
| POST | `/api/tasks/{id}/annotations` | Lưu/cập nhật annotation (upsert) |
| DELETE | `/api/annotations/{id}` | Xóa một annotation |

**Request lưu annotation**:
```json
{
  "frame_id": 42,
  "annotations": [
    {
      "camera": "CAM_FRONT",
      "category": "vehicle.car",
      "bbox_x": 0.35, "bbox_y": 0.42,
      "bbox_w": 0.12, "bbox_h": 0.08,
      "confidence": null,
      "is_ai_generated": false,
      "needs_review": false
    }
  ]
}
```

### 5.6 AI Inference

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/ai/predict` | Chạy YOLOv8 inference trên một frame |
| GET | `/api/ai/status` | Kiểm tra model đã load chưa |

**Request predict**:
```json
{ "frame_id": 42, "camera": "CAM_FRONT", "threshold": 0.25 }
```

**Response predict**:
```json
{
  "frame_id": 42,
  "camera": "CAM_FRONT",
  "predictions": [
    {
      "category": "vehicle.car",
      "bbox_x": 0.35, "bbox_y": 0.42,
      "bbox_w": 0.12, "bbox_h": 0.08,
      "confidence": 0.91,
      "is_ai_generated": true,
      "needs_review": false
    },
    {
      "category": "human.pedestrian",
      "bbox_x": 0.72, "bbox_y": 0.55,
      "bbox_w": 0.04, "bbox_h": 0.09,
      "confidence": 0.63,
      "is_ai_generated": true,
      "needs_review": true
    }
  ],
  "inference_time_ms": 145
}
```

---

## 6. YOLOv8 Inference Pipeline

### 6.1 Kiến trúc pipeline

```
frame_id + camera
      │
      ▼
[FastAPI endpoint /api/ai/predict]
      │
      ▼
[Tra cứu DB] → lấy đường dẫn file ảnh từ bảng frames
      │
      ▼
[OpenCV: cv2.imread(image_path)]
      │
      ▼
[YOLOv8: model.predict(image, conf=threshold)]
      │
      ▼
[Parse results] → chuyển bbox pixel → tọa độ chuẩn hóa (0-1)
      │
      ▼
[Map class_id → nuScenes category]
      │
      ▼
[Đánh dấu needs_review nếu confidence < ai_threshold]
      │
      ▼
[Trả về JSON predictions]
```

### 6.2 Code inference (Python)

```python
from ultralytics import YOLO
import cv2

# Load model một lần khi khởi động server
model = YOLO("weights/yolov8n.pt")

# Map COCO class_id → nuScenes category
COCO_TO_NUSCENES = {
    2:  "vehicle.car",
    7:  "vehicle.truck",
    5:  "vehicle.bus",
    3:  "vehicle.motorcycle",
    0:  "human.pedestrian",
    1:  "vehicle.bicycle",
}

def run_inference(image_path: str, conf_threshold: float = 0.25, ai_threshold: float = 0.85):
    image = cv2.imread(image_path)
    h, w = image.shape[:2]

    results = model.predict(image, conf=conf_threshold, verbose=False)[0]
    predictions = []

    for box in results.boxes:
        class_id = int(box.cls[0])
        category = COCO_TO_NUSCENES.get(class_id)
        if category is None:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        confidence = float(box.conf[0])

        predictions.append({
            "category":       category,
            "bbox_x":         x1 / w,
            "bbox_y":         y1 / h,
            "bbox_w":         (x2 - x1) / w,
            "bbox_h":         (y2 - y1) / h,
            "confidence":     round(confidence, 4),
            "is_ai_generated": True,
            "needs_review":   confidence < ai_threshold,
        })

    return predictions
```

### 6.3 Cấu trúc thư mục backend

```
backend/
├── main.py                  # FastAPI app, CORS, router mount
├── config.py                # Cấu hình DB, đường dẫn dataset, secret key
├── database.py              # SQLAlchemy engine + session
├── models/                  # SQLAlchemy ORM models
│   ├── user.py
│   ├── project.py
│   ├── scene.py
│   ├── frame.py
│   ├── task.py
│   └── annotation.py
├── routers/                 # FastAPI routers
│   ├── auth.py
│   ├── projects.py
│   ├── datasets.py
│   ├── tasks.py
│   ├── annotations.py
│   └── ai.py
├── schemas/                 # Pydantic request/response schemas
│   ├── auth.py
│   ├── project.py
│   ├── annotation.py
│   └── ai.py
├── services/
│   ├── auth_service.py      # JWT, password hashing
│   └── ai_service.py        # YOLOv8 inference logic
└── weights/
    └── yolov8n.pt           # Model weights
```

---

## 7. Thiết kế Frontend

### 7.1 Cấu trúc file đề xuất

```
/
├── login.html
├── js/
│   ├── auth.js          # JWT token management, auth guard, role check
│   ├── api.js           # Axios/fetch wrapper, base URL, auth header
│   ├── canvas-engine.js # AnnotationCanvas class
│   └── utils.js         # Helpers dùng chung
├── Admin/
│   ├── dashboard.html
│   ├── Label_Review.html    # Xem tổng quan annotation (read-only)
│   ├── ManagerProject.html
│   ├── ManagerUser.html     # Quản lý user + form tạo user mới
│   ├── Profile.html
│   ├── setting.html
│   ├── Test.html            # Tổng quan tất cả task (không review trực tiếp)
│   └── Test2.html
└── User/
    ├── dashboard.html       # Tab "Task của tôi" + Tab "Cần review"
    ├── Label.html
    ├── Label_Review.html
    ├── ManagerProject.html
    ├── Profile.html
    ├── setting.html
    ├── Test.html            # Tab "Bài làm của tôi" + Tab "Cần review của tôi"
    └── Test2.html
```

> **Lưu ý**: Đã bỏ `signUp.html` — User không tự đăng ký. Đã bỏ `Admin/Label.html` — Admin không gán nhãn trực tiếp.

### 7.2 API Client (`js/api.js`)

```javascript
const BASE_URL = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('access_token');
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...options.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/login.html';
    return;
  }
  if (!res.ok) throw await res.json();
  return res.json();
}

const api = {
  get:    (path)         => apiFetch(path),
  post:   (path, body)   => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)   => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path)         => apiFetch(path, { method: 'DELETE' }),
};
```

### 7.3 Auth Module (`js/auth.js`)

```javascript
// Lưu token sau khi đăng nhập thành công
function saveSession(token, user) {
  localStorage.setItem('access_token', token);
  localStorage.setItem('current_user', JSON.stringify(user));
}

// Auth guard: gọi ở đầu mỗi trang protected
function requireAuth(requiredRole = null) {
  const token = localStorage.getItem('access_token');
  if (!token) { window.location.href = '/login.html'; return; }

  const user = JSON.parse(localStorage.getItem('current_user') || '{}');
  if (requiredRole && user.role !== requiredRole) {
    window.location.href = '/login.html';
  }
  return user;
}

function logout() {
  api.post('/auth/logout').finally(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
    window.location.href = '/login.html';
  });
}
```

### 7.4 Label Workspace Module

#### Layout 3 cột

```
┌──────────┬─────────────────────────┬──────────┐
│ CAMS     │                         │ TOOLS    │
│ PANEL    │    CANVAS (ảnh + bbox)  │ PANEL    │
│ (220px)  │                         │ (320px)  │
│          │                         │          │
│ 6 camera │   HTML5 Canvas overlay  │ Toolbar  │
│ thumbs   │   trên thẻ <img>        │ Labels   │
│          │   (ảnh load từ API)     │ Footer   │
└──────────┴─────────────────────────┴──────────┘
```

#### Load ảnh từ API

```javascript
// Thay vì dùng đường dẫn local, gọi API để lấy ảnh
async function loadFrameImage(frameId, camera) {
  const url = `${BASE_URL}/frames/${frameId}/image/${camera}`;
  const token = getToken();
  // Dùng blob URL để hiển thị ảnh cần auth header
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
```

#### Canvas Implementation

```javascript
// Cấu trúc dữ liệu box (giống cũ, tọa độ chuẩn hóa)
const box = {
  id: generateId(),
  camera: 'CAM_FRONT',
  frameId: currentFrameId,
  bbox_x: 0.35, bbox_y: 0.42,
  bbox_w: 0.12, bbox_h: 0.08,
  category: 'vehicle.car',
  confidence: null,       // null = vẽ tay
  is_ai_generated: false,
  needs_review: false,
};
```

#### AI Auto-labeling Flow (gọi API thật)

```javascript
async function runAILabeling(frameId, camera) {
  const threshold = parseFloat(localStorage.getItem('ai_threshold') || '0.25');
  const aiThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');

  showLoadingSpinner();
  try {
    const result = await api.post('/ai/predict', { frame_id: frameId, camera, threshold });
    renderAIPredictions(result.predictions, aiThreshold);
  } finally {
    hideLoadingSpinner();
  }
}
```

#### Auto-save khi chuyển frame

```javascript
async function navigateFrame(direction) {
  await saveCurrentAnnotations();   // gọi POST /api/tasks/{id}/annotations
  currentFrameIndex += direction;
  await loadFrame(currentFrameIndex);
}

async function saveCurrentAnnotations() {
  const payload = {
    frame_id: currentFrameId,
    annotations: annotationCanvas.getBoxes(),
  };
  await api.post(`/tasks/${currentTaskId}/annotations`, payload);
}
```

### 7.5 Luồng dữ liệu tổng thể

```
[Login] → POST /api/auth/login → lưu JWT vào localStorage
    │
    ▼
[ManagerProject] → GET /api/projects → hiển thị danh sách
    │
    ▼
[Dashboard] → GET /api/tasks?project_id=X → hiển thị task list
           → GET /api/tasks?role=reviewer → hiển thị task cần review
    │
    ▼
[Label Workspace]
    ├── Load frame: GET /api/frames/{id}/image/{camera}
    ├── Load annotations: GET /api/tasks/{id}/annotations/{frame_id}
    ├── AI predict: POST /api/ai/predict
    ├── Auto-save: POST /api/tasks/{id}/annotations
    └── Submit: POST /api/tasks/{id}/submit
              └── [Hệ thống tự assign reviewer → status: under_review]
    │
    ▼
[Review Workspace — Labeler B]
    ├── Load: GET /api/tasks?role=reviewer
    ├── Xem canvas read-only: GET /api/tasks/{id}/annotations
    ├── Approve: POST /api/tasks/{id}/review/approve
    └── Reject: POST /api/tasks/{id}/review/reject  { feedback: "..." }
    │
    ▼
[Admin — Tổng quan]
    ├── Xem tất cả task: GET /api/tasks (Admin thấy toàn bộ)
    └── Override: POST /api/tasks/{id}/admin/override
```

---

## 8. Thiết kế từng Module

### 8.1 Authentication Module

**Trang**: `login.html`

**Luồng đăng nhập**:
1. User nhập username + password
2. POST `/api/auth/login` → nhận JWT token + user info
3. Lưu token vào `localStorage['access_token']`
4. Redirect theo role: Admin → `Admin/ManagerProject.html`, User → `User/ManagerProject.html`

> **Lưu ý**: Đã bỏ `signUp.html`. Admin tạo tài khoản user mới qua `ManagerUser.html`.

**Validation phía client**:
- Username: không rỗng, 3-50 ký tự
- Password: không rỗng, tối thiểu 6 ký tự
- Hiển thị lỗi inline dưới input

### 8.2 Project Management Module

**Trang**: `Admin/ManagerProject.html`, `User/ManagerProject.html`

- Admin: có nút "Tạo Dự án Mới" → POST `/api/projects`
- User: không có nút tạo, chỉ thấy project được giao
- Load danh sách: GET `/api/projects`
- Click vào card → lưu `projectId` vào `sessionStorage`, chuyển đến dashboard

### 8.3 Dashboard Module

**Trang**: `Admin/dashboard.html`, `User/dashboard.html`

- Load task list: GET `/api/tasks?project_id={id}`
- **User dashboard**: có 2 tab — "Task của tôi" và "Cần review" (task được giao review)
  - Tab "Cần review": GET `/api/tasks?role=reviewer`
- Stats cards tính từ dữ liệu API trả về
- Hành động theo trạng thái task (pending/in_progress → Label.html, submitted/under_review/approved → Label_Review.html, rejected → Label.html)

### 8.4 Review/QA Module (Kiểm duyệt chéo)

**Trang**: `User/Test.html`, `User/Test2.html` (Labeler review), `Admin/Test.html` (Admin xem tổng quan)

**Labeler reviewer** (`User/Test.html` — tab "Cần review của tôi"):
- Load: GET `/api/tasks?role=reviewer`
- Mở bài: canvas read-only, load annotation từ API
- Approve: POST `/api/tasks/{id}/review/approve`
- Reject: POST `/api/tasks/{id}/review/reject` với `{ feedback: "..." }` (bắt buộc)

**Admin** (`Admin/Test.html`):
- Chỉ xem tổng quan tất cả task, không review trực tiếp
- Override nếu cần: POST `/api/tasks/{id}/admin/override`

### 8.5 Quản lý người dùng Module

**Trang**: `Admin/ManagerUser.html`

- Load danh sách user: GET `/api/users`
- **Form/modal tạo user mới**: nhập `username`, `full_name`, `password`, `role=user` → POST `/api/users`
- Thêm user vào project: POST `/api/projects/{id}/members`
- Xóa user khỏi project: DELETE `/api/projects/{id}/members/{user_id}`

### 8.6 Settings Module

**Trang**: `Admin/setting.html`, `User/setting.html`

- AI Confidence Threshold (conf): slider 0.01-1.0, lưu `localStorage['ai_threshold']`
- AI Review Threshold: slider 0.01-1.0, lưu `localStorage['ai_review_threshold']`, mặc định 0.85
- Export: GET `/api/projects/{id}/export` → tải file ZIP JSON chuẩn nuScenes

---

## 9. Shared Components

### 9.1 Canvas Annotation Engine (`js/canvas-engine.js`)

- `AnnotationCanvas` class dùng chung cho Label.html và Test2.html
- Tham số `readOnly: true` để tắt vẽ trong trang review
- Tọa độ lưu dạng chuẩn hóa (0.0-1.0), render sang pixel khi vẽ

### 9.2 Sidebar Component

- CSS class dùng chung, nav items khác nhau theo role
- Toggle collapse/expand, trạng thái lưu `localStorage['sidebar_collapsed']`

### 9.3 Auth Guard

- Gọi `requireAuth('admin')` hoặc `requireAuth('user')` ở đầu mỗi trang
- Kiểm tra JWT token trong localStorage, redirect về login nếu không có
