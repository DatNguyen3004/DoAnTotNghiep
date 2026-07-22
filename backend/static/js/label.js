// ==============================================================================
// CẤU HÌNH & XÁC THỰC CƠ BẢN
// ==============================================================================
const BASE_URL = '/api';

// Hàm lấy token JWT từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// KIỂM TRA QUYỀN TRUY CẬP (Auth guard)
// Đọc thông tin người dùng từ localStorage. Nếu không phải User, chuyển hướng về login.html
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}

// Lấy taskId từ URL params
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');
if (!taskId) window.location.href = 'dashboard.html';

// ==============================================================================
// ĐỊNH NGHĨA CÁC LỚP ĐỐI TƯỢNG (CLASSES) & CAMERA TRÊN XE TỰ HÀNH (nuScenes)
// ==============================================================================
const CLASSES = [
    { id: 'vehicle.car', name: 'Xe con', icon: 'fa-car', color: '#3B82F6' },
    { id: 'vehicle.truck', name: 'Xe tải', icon: 'fa-truck', color: '#F59E0B' },
    { id: 'vehicle.bus', name: 'Xe buýt', icon: 'fa-bus', color: '#8B5CF6' },
    { id: 'vehicle.motorcycle', name: 'Xe máy', icon: 'fa-motorcycle', color: '#EC4899' },
    { id: 'vehicle.bicycle', name: 'Xe đạp', icon: 'fa-bicycle', color: '#F97316' },
    { id: 'human.pedestrian', name: 'Người đi bộ', icon: 'fa-person-walking', color: '#10B981' },
];
const CLASS_MAP = {};
CLASSES.forEach(c => CLASS_MAP[c.id] = c);

// Danh sách camera mặc định xung quanh xe tự hành
let CAMERAS = ['CAM_FRONT', 'CAM_FRONT_LEFT', 'CAM_FRONT_RIGHT', 'CAM_BACK', 'CAM_BACK_LEFT', 'CAM_BACK_RIGHT'];

const CAM_LABELS = {
    CAM_FRONT: 'Cam trước',
    CAM_FRONT_LEFT: 'Cam trái trước',
    CAM_FRONT_RIGHT: 'Cam phải trước',
    CAM_BACK: 'Cam sau',
    CAM_BACK_LEFT: 'Cam trái sau',
    CAM_BACK_RIGHT: 'Cam phải sau',
};

// ==============================================================================
// KHỞI TẠO TRẠNG THÁI GIAO DIỆN (STATE)
// ==============================================================================
let task = null;
let frames = [];
let currentFrameIdx = 0;
let currentCamera = 'CAM_FRONT';
let selectedClass = CLASSES[0].id;
let selectedAnnId = null;
let currentTool = 'pointer'; // mặc định là con trỏ chuột chọn đối tượng
let collapsedCategories = {};

// Cấu trúc dữ liệu lưu nhãn: annotations[frameId][camera] = [{id, category, bbox_x, bbox_y, bbox_w, bbox_h, confidence, is_ai_generated}]
let annotations = {};

// Tập hợp lưu ID các nhãn vừa được người dùng kiểm duyệt trong phiên (session) hiện tại
const sessionReviewedIds = new Set();
const hiddenCategories = new Set();

// Ẩn/Hiện nhóm lớp đối tượng ở Sidebar
function toggleCategoryHide(catId) {
    if (hiddenCategories.has(catId)) {
        hiddenCategories.delete(catId);
    } else {
        hiddenCategories.add(catId);
    }
    redrawWithHandles();
    renderLabelList();
}

// Trạng thái vẽ hộp giới hạn (Bounding Box)
let isDrawing = false;
let drawStart = null;
let drawRect = null;

// Biến điều khiển vẽ khung canvas lên ảnh camera (được tạo động)
let annCanvas = null, drawCanvas = null;
let annCtx = null, drawCtx = null;
let imgDisplayW = 1, imgDisplayH = 1;
let imgNaturalW = 1, imgNaturalH = 1;

// Bộ đếm thời gian gán nhãn (Timer)
let timerSeconds = 0;
let timerInterval = null;

// ==============================================================================
// KHỞI TẠO BẢN GÁN NHÃN (INIT)
// ==============================================================================
async function init() {
    startTimer();
    await loadTask();
    setupDropdownItems();
}

// Bắt đầu đếm thời gian thực hiện gán nhãn
function startTimer() {
    // Khôi phục thời gian đã lưu cho task này
    const saved = parseInt(localStorage.getItem(`timer_${taskId}`) || '0');
    timerSeconds = saved;

    // Hiển thị ngay lên màn hình
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timerSeconds++;
        localStorage.setItem(`timer_${taskId}`, timerSeconds);
        updateTimerDisplay();
    }, 1000);
}

// Định dạng và hiển thị thời gian gán nhãn (hh:mm:ss)
function updateTimerDisplay() {
    const h = String(Math.floor(timerSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(timerSeconds % 60).padStart(2, '0');
    const el = document.querySelector('.timer-pill');
    if (el) el.innerHTML = `<i class="fa-regular fa-clock"></i> ${h}:${m}:${s}`;
}

// Tạm dừng bộ đếm và lưu lại thời gian khi người gán nhãn rời trang
window.addEventListener('beforeunload', () => {
    clearInterval(timerInterval);
    localStorage.setItem(`timer_${taskId}`, timerSeconds);
});

// ==============================================================================
// TẢI DỮ LIỆU NHIỆM VỤ VÀ THÀNH VIÊN
// ==============================================================================
async function loadTask() {
    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        task = await res.json();

        // Cập nhật ảnh đại diện người dùng
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl && avatarEl.tagName === 'DIV' && !currentUser.avatar_url) {
            const initials = (currentUser.username || 'NL').substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }

        await loadFrames(task.scene_id);

        // Nếu nhiệm vụ đang bị từ chối (status = rejected), vô hiệu hóa nút Nộp bài để bắt buộc sửa từng frame qua FrameList
        const returnTo = new URLSearchParams(window.location.search).get('returnTo');
        const framelistActive = localStorage.getItem(`framelist_mode_${taskId}`) === 'fix';
        if (task.status === 'rejected' || framelistActive) {
            const submitBtn = document.getElementById('btnNop') || document.querySelector('.btn-phe-duyet');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.title = 'Vui lòng sửa từng khung hình qua danh sách khung hình rồi nộp lại';
                submitBtn.style.opacity = '0.5';
                submitBtn.style.cursor = 'not-allowed';
                submitBtn.style.pointerEvents = 'none';
            }
        }

        // Tự động chuyển đổi trạng thái sang "in_progress" (đang làm) nếu trạng thái cũ là "pending" (chờ làm)
        if (task.status === 'pending') {
            await fetch(`${BASE_URL}/tasks/${taskId}/status`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'in_progress' })
            }).catch(() => { });
        }
    } catch (e) {
        showToast('Không thể tải nhiệm vụ', 'error');
    }
}

// Tải toàn bộ khung hình của phân đoạn
async function loadFrames(sceneId) {
    try {
        const res = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        frames = await res.json();
        if (!frames.length) { showToast('Nhiệm vụ không có khung hình', 'error'); return; }

        await loadAllAnnotations();
        initTrackCounters();

        // Tự động phát hiện các góc camera sẵn có trong frame đầu tiên
        const firstFrame = frames[0];
        const ALL_CAM_FIELDS = {
            'CAM_FRONT': 'cam_front',
            'CAM_FRONT_LEFT': 'cam_front_left',
            'CAM_FRONT_RIGHT': 'cam_front_right',
            'CAM_BACK': 'cam_back',
            'CAM_BACK_LEFT': 'cam_back_left',
            'CAM_BACK_RIGHT': 'cam_back_right'
        };
        const detectedCams = [];
        Object.entries(ALL_CAM_FIELDS).forEach(([camKey, fieldName]) => {
            if (firstFrame && firstFrame[fieldName]) {
                detectedCams.push(camKey);
            }
        });
        if (detectedCams.length > 0) {
            CAMERAS = detectedCams;
        }

        window._isSingleCam = CAMERAS.length === 1;
        console.log('[Camera dynamic detect]', {
            isSingleCam: window._isSingleCam,
            availableCameras: CAMERAS
        });

        if (window._isSingleCam) {
            const panelHeader = document.querySelector('.panel-header');
            if (panelHeader) panelHeader.textContent = 'KHUNG HÌNH';
        }

        // Thiết lập camera mặc định là camera đầu tiên nếu cam hiện tại không nằm trong danh sách phát hiện
        if (CAMERAS.length > 0 && !CAMERAS.includes(currentCamera)) {
            currentCamera = CAMERAS[0];
        }

        // Khôi phục khung hình đã làm việc gần nhất
        const urlFrame = parseInt(new URLSearchParams(window.location.search).get('frame') || '-1');
        const savedFrame = parseInt(localStorage.getItem(`lastFrame_${taskId}`) || '0');
        const startFrame = urlFrame >= 0
            ? Math.min(urlFrame, frames.length - 1)
            : Math.min(Math.max(0, savedFrame), frames.length - 1);
        await goToFrame(startFrame);
    } catch (e) {
        showToast('Không thể tải khung hình', 'error');
    }
}

// Tải toàn bộ nhãn dán (annotations) của nhiệm vụ
async function loadAllAnnotations() {
    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/annotations`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        data.forEach(ann => {
            const fid = ann.frame_id;
            const cam = ann.camera;
            if (!annotations[fid]) annotations[fid] = {};
            if (!annotations[fid][cam]) annotations[fid][cam] = [];
            annotations[fid][cam].push({
                id: String(ann.id || genId()),
                category: ann.category,
                bbox_x: ann.bbox_x, bbox_y: ann.bbox_y,
                bbox_w: ann.bbox_w, bbox_h: ann.bbox_h,
                confidence: ann.confidence,
                is_ai_generated: ann.is_ai_generated || false,
                ai_bbox_x: ann.ai_bbox_x !== undefined ? ann.ai_bbox_x : null,
                ai_bbox_y: ann.ai_bbox_y !== undefined ? ann.ai_bbox_y : null,
                ai_bbox_w: ann.ai_bbox_w !== undefined ? ann.ai_bbox_w : null,
                ai_bbox_h: ann.ai_bbox_h !== undefined ? ann.ai_bbox_h : null,
                needs_review: ann.needs_review || false,
                hidden: false,
                track_id: ann.track_id || null,
                custom_name: ann.custom_name || null,
            });
        });
    } catch (e) { /* silent */ }
}

// ==============================================================================
// ĐIỀU HƯỚNG KHUNG HÌNH (FRAME NAVIGATION)
// ==============================================================================
async function goToFrame(idx) {
    if (idx < 0 || idx >= frames.length) return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('frame', idx);
        window.history.replaceState(null, '', url.toString());
    } catch (e) { }
    const prevIdx = currentFrameIdx;

    // Tự động lưu khung hình cũ nếu có thay đổi chưa lưu trước khi sang trang
    if (unsaved && prevIdx >= 0 && prevIdx < frames.length) {
        if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
        const saveBtn = document.querySelector('.btn-submit');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
            saveBtn.style.background = '#F59E0B';
        }
        await saveCurrentFrame(false);
        unsaved = false;
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Lưu';
            saveBtn.style.background = '';
        }
    }

    currentFrameIdx = idx;
    sessionReviewedIds.clear(); // Reset các nhãn đã xem khi sang khung hình khác
    updatePageNumber();

    renderCamList(frames[idx]);
    await loadImage(frames[idx], currentCamera);
    prefetchNextFrame(idx + 1);
}

// Cập nhật số trang hiển thị trên màn hình
function updatePageNumber() {
    const el = document.querySelector('.page-number');
    if (el) el.textContent = currentFrameIdx + 1;
}

// Nút bấm phân trang
document.querySelector('.fa-angles-left')?.addEventListener('click', () => goToFrame(0));
document.querySelector('.fa-angle-left')?.addEventListener('click', () => goToFrame(currentFrameIdx - 1));
document.querySelector('.fa-angle-right')?.addEventListener('click', () => goToFrame(currentFrameIdx + 1));
document.querySelector('.fa-angles-right')?.addEventListener('click', () => goToFrame(frames.length - 1));

// Phím tắt điều hướng và công cụ vẽ nhanh
document.addEventListener('keydown', e => {
    // Tránh phím tắt kích hoạt khi đang gõ văn bản
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // 1. PHÓNG TO / THU NHỎ (Ctrl + ArrowUp/Down)
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (e.key === 'ArrowUp') zoomIn();
        else zoomOut();
        return;
    }

    // 2. CHUYỂN NHANH CAMERA XUNG QUANH (Phím W/S hoặc ArrowUp/ArrowDown)
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = CAMERAS.indexOf(currentCamera);
        const nextIdx = (idx - 1 + CAMERAS.length) % CAMERAS.length;
        switchCamera(CAMERAS[nextIdx]);
        return;
    }
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = CAMERAS.indexOf(currentCamera);
        const nextIdx = (idx + 1) % CAMERAS.length;
        switchCamera(CAMERAS[nextIdx]);
        return;
    }

    // 3. DI CHUYỂN KHUNG HÌNH (ArrowRight/Left hoặc D/A)
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') goToFrame(currentFrameIdx + 1);
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') goToFrame(currentFrameIdx - 1);
    if (e.key === 'Home') goToFrame(0);
    if (e.key === 'End') goToFrame(frames.length - 1);

    // 4. CHỌN CAMERA QUA SỐ (1-6)
    if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        switchCamera(CAMERAS[parseInt(e.key) - 1]);
    }

    // 5. CHỌN NHÃN GÁN NHANH QUA PHÍM (r, t, y, u, i, o)
    const categoryKeys = {
        'r': 'vehicle.car',
        't': 'vehicle.truck',
        'y': 'vehicle.bus',
        'u': 'vehicle.motorcycle',
        'i': 'human.pedestrian',
        'o': 'vehicle.bicycle'
    };
    const pressedKey = e.key.toLowerCase();
    if (categoryKeys[pressedKey] !== undefined) {
        e.preventDefault();
        selectClassById(categoryKeys[pressedKey]);
        return;
    }

    // 6. CHỌN CÔNG CỤ NHANH
    if (e.key === 'v' || e.key === 'V') setActiveTool('pointer'); // Phím V: Con trỏ chuột
    if (e.key === 'b' || e.key === 'B') setActiveTool('box');     // Phím B: Vẽ Bounding Box
    if (e.key === 'h' || e.key === 'H') setActiveTool('pan');     // Phím H: Kéo thả màn hình
    if (e.key === 'e' || e.key === 'E') setActiveTool('resize');  // Phím E: Co giãn hộp giới hạn
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); runAI(); } // Phím P: Chạy AI dự đoán
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected(); // Phím Delete/Backspace: Xóa nhãn
    if (e.key === 'Escape') { selectedAnnId = null; redrawAnnotations(); renderLabelList(); } // Phím ESC: Bỏ chọn

    // 7. ZOOM
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-' || e.key === '_') zoomOut();
    if (e.key === '0') {
        zoomLevel = 100;
        panOffset = { x: 0, y: 0 };
        const _c = document.querySelector('.canvas-container');
        if (_c) _c.style.transform = '';
        applyZoom();
    }
});

// Lăn chuột kết hợp phím Ctrl để thu phóng
window.addEventListener('wheel', e => {
    if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
    }
}, { passive: false });

// ==============================================================================
// XỬ LÝ CHUYỂN ĐỔI CAMERA & ĐẢI PHIM (FILM STRIP)
// ==============================================================================
function renderCamList(frame) {
    if (window._isSingleCam) {
        renderFrameStrip(frame);
        return;
    }
    const list = document.getElementById('camList');
    if (!list) return;
    list.innerHTML = CAMERAS.map((cam, i) => {
        const count = getFrameAnns(frame.id, cam).length;
        return `
        <div class="cam-row">
            <div class="cam-item ${cam === currentCamera ? 'active' : ''}" onclick="switchCamera('${cam}')">
                <img id="thumb_${cam}" src="" alt="${cam}" class="hidden">
                <div id="nodata_${cam}" style="display:none;position:absolute;inset:0;background:#E2E8F0;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none">
                    <i class="fa-solid fa-camera-slash" style="font-size:28px;color:#000"></i>
                    <div style="font-size:12px;font-weight:700;color:#000;text-align:center;line-height:1.3">Không có<br>dữ liệu</div>
                </div>
                <div class="cam-label">${CAM_LABELS[cam]}</div>
                ${count > 0 ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px">${count}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    CAMERAS.forEach(cam => loadThumb(frame, cam));
}

// Hiển thị dải phim (các khung hình lân cận) khi nhiệm vụ chỉ có 1 camera duy nhất
function renderFrameStrip(currentFrame) {
    const list = document.getElementById('camList');
    if (!list) return;

    // Hiển thị tối đa 6 khung hình xung quanh khung hình hiện tại
    const STRIP_COUNT = 6;
    const half = Math.floor(STRIP_COUNT / 2);
    let startIdx = Math.max(0, currentFrameIdx - half);
    let endIdx = Math.min(frames.length - 1, startIdx + STRIP_COUNT - 1);
    startIdx = Math.max(0, endIdx - STRIP_COUNT + 1);

    list.innerHTML = frames.slice(startIdx, endIdx + 1).map((f, i) => {
        const idx = startIdx + i;
        const isActive = f.id === currentFrame.id;
        const count = getFrameAnns(f.id, 'CAM_FRONT').length;
        return `
        <div class="cam-row">
            <div class="cam-item ${isActive ? 'active' : ''}" onclick="goToFrame(${idx})">
                <img id="strip_thumb_${f.id}" src="" alt="frame${idx}" class="hidden">
                <div id="strip_nodata_${f.id}" style="display:none;position:absolute;inset:0;background:#E2E8F0;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none">
                    <i class="fa-solid fa-image" style="font-size:20px;color:#94A3B8"></i>
                </div>
                <div class="cam-label" style="font-size:9px">#${idx + 1}</div>
                ${count > 0 ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px">${count}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Nạp các hình ảnh thu nhỏ cho dải phim lân cận
    frames.slice(startIdx, endIdx + 1).forEach(f => loadStripThumb(f));
}

// Nạp ảnh dải phim thu nhỏ của camera chính
async function loadStripThumb(frame) {
    const img = document.getElementById(`strip_thumb_${frame.id}`);
    if (!img) return;
    const nodata = document.getElementById(`strip_nodata_${frame.id}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/thumb/CAM_FRONT?width=200`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok || res.headers.get('X-No-Data') === '1') {
            img.classList.add('hidden');
            if (nodata) nodata.style.display = 'flex';
            return;
        }
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
        img.classList.remove('hidden');
        if (nodata) nodata.style.display = 'none';
    } catch (e) {
        img.classList.add('hidden');
        if (nodata) nodata.style.display = 'flex';
    }
}

// Nạp ảnh nhỏ cho danh sách lựa chọn camera
async function loadThumb(frame, cam) {
    const img = document.getElementById(`thumb_${cam}`);
    if (!img) return;
    const nodata = document.getElementById(`nodata_${cam}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/thumb/${cam}?width=200`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok || res.headers.get('X-No-Data') === '1') {
            img.classList.add('hidden');
            if (nodata) nodata.style.display = 'flex';
            return;
        }
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
        img.classList.remove('hidden');
        if (nodata) nodata.style.display = 'none';
    } catch (e) {
        img.classList.add('hidden');
        if (nodata) nodata.style.display = 'flex';
    }
}

// Tải trước (prefetch) hình ảnh camera ở khung hình kế tiếp giúp giảm thời gian chờ
function prefetchNextFrame(currentIdx) {
    const idxList = [currentIdx + 1, currentIdx + 2, currentIdx + 3, currentIdx - 1];
    idxList.forEach(idx => {
        if (idx < 0 || idx >= frames.length) return;
        const f = frames[idx];
        const key = _getCacheKey(f.id, currentCamera);
        if (_imgCache.has(key)) return;
        fetch(`${BASE_URL}/frames/${f.id}/image/${currentCamera}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        }).then(res => res.blob()).then(blob => {
            const url = URL.createObjectURL(blob);
            _cacheSet(key, url);
        }).catch(() => { });
    });
}

// Xử lý chuyển đổi góc camera xem
async function switchCamera(cam) {
    if (!cam || !CAMERAS.includes(cam) || cam === currentCamera) return;

    // Tự động lưu tiến độ camera cũ trước khi chuyển
    if (unsaved) {
        if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
        const saveBtn = document.querySelector('.btn-submit');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
            saveBtn.style.background = '#F59E0B';
        }
        await saveCurrentFrame(false);
        unsaved = false;
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Lưu';
            saveBtn.style.background = '';
        }
    }

    currentCamera = cam;
    renderCamList(frames[currentFrameIdx]);
    await loadImage(frames[currentFrameIdx], cam);
}

// Cache ảnh cục bộ trong trình duyệt
const _imgCache = new Map();
const _IMG_CACHE_MAX = 20;

function _getCacheKey(frameId, cam) { return `${frameId}_${cam}`; }

function _cacheSet(key, url) {
    if (_imgCache.size >= _IMG_CACHE_MAX) {
        const firstKey = _imgCache.keys().next().value;
        URL.revokeObjectURL(_imgCache.get(firstKey));
        _imgCache.delete(firstKey);
    }
    _imgCache.set(key, url);
}

// ==============================================================================
// TẢI ẢNH CHÍNH & THIẾT LẬP KHUNG VẼ CANVAS
// ==============================================================================
async function loadImage(frame, cam) {
    const container = document.querySelector('.canvas-container');
    let mainImg = document.getElementById('mainImage');
    if (!mainImg) return;

    // Dọn dẹp thông báo lỗi (nếu có) từ lần thử trước
    const oldPlaceholder = document.getElementById('mainNoData');
    if (oldPlaceholder) oldPlaceholder.remove();

    mainImg.style.display = 'block';
    selectedAnnId = null;

    // Reset lại độ trượt góc nhìn khi đổi sang khung hình mới
    panOffset = { x: 0, y: 0 };
    if (container) container.style.transform = '';

    const cacheKey = _getCacheKey(frame.id, cam);

    try {
        let src;
        if (_imgCache.has(cacheKey)) {
            src = _imgCache.get(cacheKey);
        } else {
            const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            src = URL.createObjectURL(blob);
            _cacheSet(cacheKey, src);
        }

        await new Promise((resolve, reject) => {
            mainImg.onload = resolve;
            mainImg.onerror = reject;
            mainImg.src = src;
        });

        // Chờ hiệu ứng vẽ tiếp theo từ trình duyệt để setup Canvas đồng bộ
        requestAnimationFrame(() => {
            setupCanvas(container, mainImg);
            redrawAnnotations();
            renderLabelList();
            renderAttentionList();
        });
    } catch (e) {
        // Hiển thị biểu tượng cảnh báo "Không có dữ liệu camera"
        mainImg.style.display = 'none';
        if (container) {
            const placeholder = document.createElement('div');
            placeholder.id = 'mainNoData';
            placeholder.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#E2E8F0;pointer-events:none';
            placeholder.innerHTML = `
                <i class="fa-solid fa-camera-slash" style="font-size:64px;color:#000"></i>
                <div style="font-size:22px;font-weight:700;color:#000">Không có dữ liệu</div>
            `;
            container.appendChild(placeholder);
        }
    }
}

// Tạo các lớp Canvas vẽ đè lên hình ảnh góc camera
function setupCanvas(container, img) {
    container.querySelectorAll('canvas').forEach(c => c.remove());

    imgDisplayW = img.offsetWidth || img.naturalWidth;
    imgDisplayH = img.offsetHeight || img.naturalHeight;
    imgNaturalW = img.naturalWidth || imgDisplayW;
    imgNaturalH = img.naturalHeight || imgDisplayH;

    // Canvas hiển thị hộp giới hạn (Chỉ hiển thị, không bắt sự kiện click)
    annCanvas = document.createElement('canvas');
    annCanvas.width = imgDisplayW;
    annCanvas.height = imgDisplayH;
    annCanvas.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;`;
    annCtx = annCanvas.getContext('2d');

    // Canvas bắt sự kiện vẽ/tác động từ chuột của người gán nhãn
    drawCanvas = document.createElement('canvas');
    drawCanvas.width = imgDisplayW;
    drawCanvas.height = imgDisplayH;
    drawCanvas.style.cssText = `position:absolute;top:0;left:0;cursor:${currentTool === 'box' ? 'crosshair' : 'default'};`;
    drawCtx = drawCanvas.getContext('2d');

    container.appendChild(annCanvas);
    container.appendChild(drawCanvas);

    // Cài đặt hình dáng con trỏ tương ứng với công cụ đang chọn
    if (currentTool === 'box') drawCanvas.style.cursor = 'crosshair';
    else if (currentTool === 'pan') drawCanvas.style.cursor = 'grab';
    else drawCanvas.style.cursor = 'default';

    // Ràng buộc các bộ bắt sự kiện chuột
    drawCanvas.addEventListener('mousedown', onMouseDown);
    drawCanvas.addEventListener('mousemove', onMouseMove);
    drawCanvas.addEventListener('mouseup', onMouseUp);
    drawCanvas.addEventListener('mouseleave', onMouseLeave);
}

// Cân đối lại khung canvas vẽ đè khi thay đổi kích thước cửa sổ trình duyệt
window.addEventListener('resize', () => {
    const container = document.querySelector('.canvas-container');
    const img = container?.querySelector('img');
    if (img && annCanvas) {
        imgDisplayW = img.offsetWidth;
        imgDisplayH = img.offsetHeight;
        annCanvas.width = imgDisplayW;
        annCanvas.height = imgDisplayH;
        if (drawCanvas) { drawCanvas.width = imgDisplayW; drawCanvas.height = imgDisplayH; }
        redrawAnnotations();
    }
});

// ==============================================================================
// XỬ LÝ CÁC SỰ KIỆN CHUỘT TRÊN HỘP GIỚI HẠN (DRAGGING, DRAWING)
// ==============================================================================
let isDragging = false;
let dragStart = null;
let dragAnn = null;

function onMouseDown(e) {
    if (currentTool === 'resize') {
        const pos = getPos(e);
        const anns = currentAnns();
        for (let i = anns.length - 1; i >= 0; i--) {
            const h = hitHandle(pos.x, pos.y, anns[i]);
            if (h) {
                resizeHandle = h;
                resizeAnn = anns[i];
                resizeStart = { ...pos, origAnn: { ...anns[i] } };
                selectedAnnId = anns[i].id;
                return;
            }
        }
        selectAt(pos.x, pos.y);
        return;
    }
    if (currentTool === 'pointer') {
        const pos = getPos(e);
        const anns = currentAnns();
        const reviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');
        const attentionMode = window._currentResultTab === 'attention';

        for (let i = anns.length - 1; i >= 0; i--) {
            const a = anns[i];
            if (attentionMode) {
                const flagged = a.needs_review === true;
                if (!flagged) continue;
            }
            const x = a.bbox_x * imgDisplayW, y = a.bbox_y * imgDisplayH;
            const w = a.bbox_w * imgDisplayW, h = a.bbox_h * imgDisplayH;
            if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
                selectedAnnId = a.id;
                isDragging = true;
                dragStart = { ...pos };
                dragAnn = { ...a };
                drawCanvas.style.cursor = 'grabbing';
                redrawAnnotations();
                renderLabelList();
                return;
            }
        }
        selectedAnnId = null;
        redrawAnnotations();
        renderLabelList();
        return;
    }
    if (currentTool !== 'box') return;
    isDrawing = true;
    drawStart = getPos(e);
}

function onMouseMove(e) {
    if (currentTool === 'resize' && resizeHandle && resizeAnn) {
        const pos = getPos(e);
        const dx = (pos.x - resizeStart.x) / imgDisplayW;
        const dy = (pos.y - resizeStart.y) / imgDisplayH;
        const o = resizeStart.origAnn;
        let { bbox_x: x, bbox_y: y, bbox_w: w, bbox_h: h } = o;

        if (resizeHandle.includes('l')) { x = Math.min(o.bbox_x + o.bbox_w - 0.01, o.bbox_x + dx); w = o.bbox_w - dx; }
        if (resizeHandle.includes('r')) { w = Math.max(0.01, o.bbox_w + dx); }
        if (resizeHandle.includes('t')) { y = Math.min(o.bbox_y + o.bbox_h - 0.01, o.bbox_y + dy); h = o.bbox_h - dy; }
        if (resizeHandle.includes('b')) { h = Math.max(0.01, o.bbox_h + dy); }

        resizeAnn.bbox_x = Math.max(0, x);
        resizeAnn.bbox_y = Math.max(0, y);
        resizeAnn.bbox_w = Math.min(1 - resizeAnn.bbox_x, Math.max(0.01, w));
        resizeAnn.bbox_h = Math.min(1 - resizeAnn.bbox_y, Math.max(0.01, h));

        redrawWithHandles();
        return;
    }
    if (currentTool === 'pointer' && isDragging && dragAnn) {
        const pos = getPos(e);
        const dx = (pos.x - dragStart.x) / imgDisplayW;
        const dy = (pos.y - dragStart.y) / imgDisplayH;
        const frame = frames[currentFrameIdx];
        const anns = currentAnns();
        const ann = anns.find(a => a.id === selectedAnnId);
        if (ann) {
            ann.bbox_x = Math.max(0, Math.min(1 - dragAnn.bbox_w, dragAnn.bbox_x + dx));
            ann.bbox_y = Math.max(0, Math.min(1 - dragAnn.bbox_h, dragAnn.bbox_y + dy));
            redrawAnnotations();
        }
        return;
    }
    if (!isDrawing) return;
    const pos = getPos(e);
    drawRect = {
        x: Math.min(drawStart.x, pos.x),
        y: Math.min(drawStart.y, pos.y),
        w: Math.abs(pos.x - drawStart.x),
        h: Math.abs(pos.y - drawStart.y)
    };
    renderDrawing();
}

function onMouseUp(e) {
    if (currentTool === 'resize' && resizeHandle) {
        if (resizeAnn) {
            resizeAnn.needs_review = false;
            sessionReviewedIds.add(resizeAnn.id);
        }
        resizeHandle = null;
        resizeAnn = null;
        resizeStart = null;
        markUnsaved();
        redrawAnnotations();
        renderLabelList();
        renderAttentionList();
        return;
    }
    if (currentTool === 'pointer' && isDragging) {
        const movedAnn = currentAnns().find(a => a.id === selectedAnnId);
        if (movedAnn) {
            movedAnn.needs_review = false;
            sessionReviewedIds.add(movedAnn.id);
        }
        isDragging = false;
        dragAnn = null;
        drawCanvas.style.cursor = 'default';
        markUnsaved();
        redrawAnnotations();
        renderLabelList();
        renderAttentionList();
        return;
    }
    if (!isDrawing) return;
    isDrawing = false;
    if (!drawRect || drawRect.w < 8 || drawRect.h < 8) {
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        return;
    }
    const frame = frames[currentFrameIdx];
    const anns = currentAnns();
    let maxId = 0;
    anns.forEach(a => {
        if (a.category === selectedClass && a.track_id && a.track_id > maxId) {
            maxId = a.track_id;
        }
    });
    const nextTrackId = maxId + 1;

    const ann = {
        id: genId(),
        category: selectedClass,
        track_id: nextTrackId,
        bbox_x: Math.max(0, drawRect.x / imgDisplayW),
        bbox_y: Math.max(0, drawRect.y / imgDisplayH),
        bbox_w: Math.min(1 - drawRect.x / imgDisplayW, drawRect.w / imgDisplayW),
        bbox_h: Math.min(1 - drawRect.y / imgDisplayH, drawRect.h / imgDisplayH),
        confidence: null,
        is_ai_generated: false,
        needs_review: false,
        hidden: false,
    };
    anns.push(ann);
    setFrameAnns(frame.id, currentCamera, anns);
    selectedAnnId = ann.id;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
}

function onMouseLeave() {
    if (isDrawing) {
        isDrawing = false;
        if (drawCtx) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
}

// Lấy toạ độ chuột tương ứng với tỷ lệ thẻ canvas
function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// Vẽ tạm khung viền nét đứt khi Labeler đang kéo thả giữ chuột để tạo hộp mới
function renderDrawing() {
    if (!drawCtx) return;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    if (!drawRect) return;
    const cls = CLASS_MAP[selectedClass];
    const color = cls ? cls.color : '#14B8A6';
    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = 2;
    drawCtx.setLineDash([5, 4]);
    drawCtx.strokeRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h);
    drawCtx.fillStyle = color + '22';
    drawCtx.fillRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h);
    drawCtx.setLineDash([]);
}

// Vẽ đè các bounding boxes hoàn thiện lên Canvas hiển thị chính
function redrawAnnotations() {
    if (!annCtx) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);

    const reviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');
    const attentionMode = window._currentResultTab === 'attention';

    currentAnns().forEach(ann => {
        if (ann.hidden || hiddenCategories.has(ann.category)) return;

        const needsFlag = ann.needs_review === true;

        // Nếu đang ở tab "Cần chú ý": chỉ hiển thị nhãn có cờ đỏ hoặc nhãn vừa review trong session
        if (attentionMode && !needsFlag && !sessionReviewedIds.has(ann.id)) return;

        const cls = CLASS_MAP[ann.category];
        const baseColor = cls ? cls.color : '#14B8A6';
        // Nhãn cần xem xét (needs_review = true) -> dùng viền đỏ; ngược lại dùng màu lớp chuẩn
        const color = needsFlag ? '#EF4444' : baseColor;

        const x = ann.bbox_x * imgDisplayW;
        const y = ann.bbox_y * imgDisplayH;
        const w = ann.bbox_w * imgDisplayW;
        const h = ann.bbox_h * imgDisplayH;
        const sel = ann.id === selectedAnnId;

        const hasSelection = selectedAnnId !== null;
        if (hasSelection && !sel) {
            annCtx.globalAlpha = 0.25;
        } else {
            annCtx.globalAlpha = 1.0;
        }

        annCtx.strokeStyle = color;
        annCtx.lineWidth = sel ? 3.5 : 1.5;
        annCtx.strokeRect(x, y, w, h);

        annCtx.fillStyle = color;
        const prevAlpha = annCtx.globalAlpha;
        annCtx.globalAlpha = sel ? 0.25 : (hasSelection ? 0.03 : 0.12);
        annCtx.fillRect(x, y, w, h);
        annCtx.globalAlpha = prevAlpha;

        // Vẽ cờ đỏ biểu thị nhãn cần xem xét do độ tin cậy thấp từ AI
        if (needsFlag) {
            annCtx.fillStyle = '#EF4444';
            annCtx.beginPath();
            annCtx.moveTo(x + w - 2, y + 2);
            annCtx.lineTo(x + w - 14, y + 2);
            annCtx.lineTo(x + w - 14, y + 10);
            annCtx.lineTo(x + w - 8, y + 7);
            annCtx.lineTo(x + w - 2, y + 10);
            annCtx.closePath();
            annCtx.fill();
        }
        annCtx.globalAlpha = 1.0;
    });
}

// Click chọn một hộp giới hạn từ toạ độ màn hình
function selectAt(px, py) {
    const anns = currentAnns();
    const reviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');
    const attentionMode = window._currentResultTab === 'attention';

    for (let i = anns.length - 1; i >= 0; i--) {
        const a = anns[i];
        if (attentionMode) {
            const flagged = a.needs_review === true;
            if (!flagged) continue;
        }
        const x = a.bbox_x * imgDisplayW, y = a.bbox_y * imgDisplayH;
        const w = a.bbox_w * imgDisplayW, h = a.bbox_h * imgDisplayH;
        if (px >= x && px <= x + w && py >= y && py <= y + h) {
            selectedAnnId = a.id;
            redrawAnnotations();
            renderLabelList();
            return;
        }
    }
    selectedAnnId = null;
    redrawAnnotations();
    renderLabelList();
}

// Xóa hộp giới hạn đang được tích chọn
function deleteSelected() {
    if (!selectedAnnId) return;
    const frame = frames[currentFrameIdx];

    setFrameAnns(frame.id, currentCamera, currentAnns().filter(a => a.id !== selectedAnnId));
    selectedAnnId = null;

    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
}

// ==============================================================================
// THIẾT LẬP CÁC PHÍM/NÚT ĐIỀU KHIỂN CÔNG CỤ (TOOL SETUP)
// ==============================================================================
function selectClassById(classId) {
    const found = CLASSES.find(c => c.id === classId);
    if (found) {
        selectedClass = found.id;
        showToast(`Nhãn: ${found.name}`, 'custom', found.color);

        // Đổi màu viền nút vẽ hộp (btn-box) tương ứng với màu lớp đã chọn
        const btnBox = document.getElementById('btn-box');
        if (btnBox) {
            btnBox.style.color = found.color;
            btnBox.style.borderColor = found.color;
        }
    }
    document.getElementById('box-dropdown')?.classList.remove('show');
    setActiveTool('box');
}

function setupDropdownItems() {
    // Click chọn lớp từ Dropdown list
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', e => {
            e.stopPropagation();
            const label = item.getAttribute('data-label');
            const found = CLASSES.find(c => c.name === label);
            if (found) {
                selectClassById(found.id);
            }
        });
    });

    // Công cụ con trỏ Pointer
    document.querySelector('.tool-btn[title="Pointer"]')?.addEventListener('click', () => setActiveTool('pointer'));

    // Công cụ nhân bản Clone
    document.getElementById('btn-clone')?.addEventListener('click', () => setActiveTool('clone'));

    // Công cụ co giãn hộp Resize
    document.getElementById('btn-resize')?.addEventListener('click', () => setActiveTool('resize'));

    // Công cụ kéo thả màn hình Pan
    document.querySelector('.tool-btn[title="Pan"]')?.addEventListener('click', () => setActiveTool('pan'));

    // Nút kích hoạt AI tự động gán nhãn
    document.querySelector('.btn-ai-auto')?.addEventListener('click', runAI);

    // Nút Lưu tiến trình thủ công
    document.querySelector('.btn-submit')?.addEventListener('click', () => saveAnnotations(true));

    // Nút Nộp bài chuyển kiểm duyệt
    document.querySelector('.btn-phe-duyet')?.addEventListener('click', submitTask);

    // Mặc định công cụ con trỏ được kích hoạt lúc ban đầu
    setActiveTool('pointer');
}

// Thay đổi công cụ vẽ hiện hành
function setActiveTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

    if (tool === 'box') {
        document.getElementById('btn-box')?.classList.add('active');
        if (drawCanvas) drawCanvas.style.cursor = 'crosshair';
        disablePan();
    } else if (tool === 'pan') {
        document.querySelector('.tool-btn[title="Pan"]')?.classList.add('active');
        if (drawCanvas) drawCanvas.style.cursor = 'grab';
        enablePan();
    } else if (tool === 'clone') {
        document.getElementById('btn-clone')?.classList.add('active');
        if (drawCanvas) drawCanvas.style.cursor = 'copy';
        disablePan();
        cloneSelected();
    } else if (tool === 'resize') {
        document.getElementById('btn-resize')?.classList.add('active');
        if (drawCanvas) drawCanvas.style.cursor = 'default';
        disablePan();
    } else {
        // Con trỏ pointer
        document.querySelector('.tool-btn[title="Pointer"]')?.classList.add('active');
        if (drawCanvas) drawCanvas.style.cursor = 'default';
        disablePan();
    }
}

// ==============================================================================
// CÁC HÀM TIỆN ÍCH DỮ LIỆU NHÃN (ANNOTATIONS HELPERS)
// ==============================================================================
function genId() { return 'a' + Math.random().toString(36).substr(2, 8); }
function getFrameAnns(fid, cam) { return annotations[fid]?.[cam] || []; }
function setFrameAnns(fid, cam, anns) {
    if (!annotations[fid]) annotations[fid] = {};
    annotations[fid][cam] = anns;
}
function currentAnns() {
    const f = frames[currentFrameIdx];
    return f ? getFrameAnns(f.id, currentCamera) : [];
}

// ==============================================================================
// VẼ DANH SÁCH NHÃN (SIDEBAR LABEL LIST)
// ==============================================================================
function toggleCategoryCollapse(category) {
    collapsedCategories[category] = !collapsedCategories[category];
    renderLabelList();
}

// Kết xuất danh sách nhãn ở Sidebar bên phải
function renderLabelList() {
    const list = document.getElementById('labelList');
    const badge = document.getElementById('labelsBadge');
    const anns = currentAnns();

    if (badge) badge.textContent = `${anns.length} NHÃN`;

    if (!list) return;
    if (!anns.length) {
        list.innerHTML = '<div style="color:#94A3B8;font-size:13px;padding:8px 0">Chưa có nhãn nào.</div>';
        return;
    }

    // Phân nhóm nhãn theo mã lớp tương ứng
    const grouped = {};
    CLASSES.forEach(c => grouped[c.id] = []);
    anns.forEach(ann => {
        if (!grouped[ann.category]) {
            grouped[ann.category] = [];
        }
        grouped[ann.category].push(ann);
    });

    let html = '';
    CLASSES.forEach(cls => {
        const groupAnns = grouped[cls.id] || [];
        if (groupAnns.length === 0) return;

        const isCollapsed = collapsedCategories[cls.id] || false;
        const isCatHidden = hiddenCategories.has(cls.id);

        // Vẽ header của nhóm đối tượng
        html += `
        <div class="category-group-header" onclick="toggleCategoryCollapse('${cls.id}')" 
             style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin:8px 0 4px 0;cursor:pointer;background:#F1F5F9;border-radius:8px;user-select:none;transition:background 0.2s">
            <div style="display:flex;align-items:center;gap:8px">
                <i class="fa-solid ${cls.icon}" style="color:${cls.color};font-size:13px"></i>
                <span style="font-weight:700;font-size:13px;color:#1E293B">${cls.name}</span>
                <span style="background:${cls.color}15;color:${cls.color};font-size:11px;font-weight:700;padding:1px 6px;border-radius:10px">${groupAnns.length}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px" onclick="event.stopPropagation()">
                <i class="${isCatHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}" 
                   style="color:#64748B;cursor:pointer;font-size:13px" 
                   title="${isCatHidden ? 'Hiện nhóm nhãn' : 'Ẩn nhóm nhãn'}"
                   onclick="toggleCategoryHide('${cls.id}');event.stopPropagation()"></i>
                <i class="fa-solid fa-chevron-down" style="font-size:11px;color:#64748B;transition:transform 0.2s;${isCollapsed ? 'transform:rotate(-90deg)' : ''}" onclick="toggleCategoryCollapse('${cls.id}');event.stopPropagation()"></i>
            </div>
        </div>
        <div class="category-group-content" style="${isCollapsed ? 'display:none' : ''}">
        `;

        // Vẽ từng nhãn đơn lẻ thuộc nhóm
        html += groupAnns.map((ann) => {
            const color = cls.color;
            const trackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';
            const label = ann.custom_name ? `${trackNum} - ${ann.custom_name}` : `${trackNum}`;

            const aiMark = ann.is_ai_generated ? ` <span style="font-size:10px;color:#9333EA">AI</span>` : '';
            const needsFlag = ann.needs_review === true;
            const flagMark = needsFlag ? ' <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px" title="Độ tin cậy thấp, cần kiểm tra"></i>' : '';
            const sel = ann.id === selectedAnnId;
            const hidden = ann.hidden || isCatHidden;
            return `
            <div class="label-item ${sel ? 'active' : ''}" onclick="selectAnn('${ann.id}')">
                <div class="label-info">
                    <div class="label-dot" style="background:${color};opacity:${hidden ? 0.3 : 1}"></div>
                    <div class="label-text">
                        <span class="label-name" style="opacity:${hidden ? 0.4 : 1};cursor:pointer${needsFlag ? ';border-left:3px solid #EF4444;padding-left:6px' : ''}"
                               ondblclick="renameAnn('${ann.id}');event.stopPropagation()"
                               title="Nhấp đúp để đổi tên">${label}${aiMark}${flagMark}</span>
                        <div class="label-actions">
                            <i class="${hidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}" 
                               title="${hidden ? 'Hiện nhãn' : 'Ẩn nhãn'}" 
                               onclick="toggleAnnVisibility('${ann.id}');event.stopPropagation()"></i>
                            <i class="fa-solid fa-tag" title="Đổi loại"
                               onclick="changeAnnCategory('${ann.id}');event.stopPropagation()"
                               style="color:#0891B2"></i>
                            <i class="fa-regular fa-trash-can" title="Xóa" onclick="deleteAnn('${ann.id}');event.stopPropagation()"></i>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        html += `</div>`; // Đóng category-group-content
    });

    list.innerHTML = html;

    // Cập nhật danh sách cần chú ý (Attention list) đồng thời
    renderAttentionList();
}

function selectAnn(id) {
    selectedAnnId = id;
    redrawAnnotations();
    renderLabelList();
    setTimeout(() => {
        const el = document.querySelector(`.label-item.active`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

let pendingAnn = null;

// Hộp thoại đổi lớp đối tượng (Category) nhanh cho nhãn gán
function changeAnnCategory(id) {
    const anns = currentAnns();
    const ann = anns.find(a => a.id === id);
    if (!ann) return;
    const cls = CLASS_MAP[ann.category];
    const currentName = cls ? cls.name : ann.category;

    document.getElementById('changeCatDesc').textContent = `Đổi loại của "${currentName}"`;
    const opts = document.getElementById('changeCatOptions');
    opts.innerHTML = CLASSES.filter(c => c.id !== ann.category).map(c => `
        <button onclick="confirmChangeCategory('${id}','${c.id}')"
            style="width:100%;height:36px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:600;color:#1E293B;cursor:pointer;text-align:left;padding:0 14px;display:flex;align-items:center;gap:8px"
            onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background='#F8FAFC'">
            <span style="width:10px;height:10px;border-radius:50%;background:${c.color};flex-shrink:0"></span>
            ${c.name}
        </button>`).join('');
    document.getElementById('changeCatModal').style.display = 'flex';
}

function confirmChangeCategory(annId, newCategory) {
    const frame = frames[currentFrameIdx];
    const anns = currentAnns();
    const ann = anns.find(a => a.id === annId);
    if (!ann) return;

    document.getElementById('changeCatModal').style.display = 'none';

    ann.category = newCategory;
    ann.track_id = null; // reset track_id để tự sinh mới khi lưu

    setFrameAnns(frame.id, currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
    markUnsaved();
    showToast('Đã đổi loại đối tượng', 'success');
}

// Ẩn/Hiện một bounding box cụ thể
function toggleAnnVisibility(id) {
    const frame = frames[currentFrameIdx];
    const anns = currentAnns();
    const ann = anns.find(a => a.id === id);
    if (ann) ann.hidden = !ann.hidden;
    setFrameAnns(frame.id, currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
}

function deleteAnn(id) {
    const frame = frames[currentFrameIdx];

    setFrameAnns(frame.id, currentCamera, currentAnns().filter(a => a.id !== id));
    if (selectedAnnId === id) selectedAnnId = null;

    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
}

function updateCamBadge() {
    renderCamList(frames[currentFrameIdx]);
}

// ==============================================================================
// ĐỒNG BỘ & LƯU TIẾN ĐỘ TỰ ĐỘNG (AUTO-SAVE)
// ==============================================================================
let unsaved = false;
let autoSaveTimeout = null;
const modifiedFrameIds = new Set();

function markUnsaved(frameId) {
    const fid = frameId !== undefined ? frameId : (frames[currentFrameIdx]?.id);
    if (fid) {
        modifiedFrameIds.add(fid);
    }
    unsaved = true;

    // Tự động lưu sau 1.5 giây nếu người dùng dừng thao tác
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);

    const saveBtn = document.querySelector('.btn-submit');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tự động lưu...';
        saveBtn.style.background = '#F59E0B'; // Màu cam cảnh báo tiến độ chưa lưu
    }

    autoSaveTimeout = setTimeout(async () => {
        if (unsaved) {
            await saveCurrentFrame(false);
            unsaved = false;
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Đã lưu';
                saveBtn.style.background = '#10B981'; // Màu xanh báo lưu thành công
                setTimeout(() => {
                    if (!unsaved) {
                        saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Lưu';
                        saveBtn.style.background = ''; // khôi phục style mặc định
                    }
                }, 1500);
            }
        }
    }, 1500);
}

// Lưu tiến độ của khung hình hiện hành lên backend
async function saveCurrentFrame(showMsg) {
    const fids = Array.from(modifiedFrameIds);
    modifiedFrameIds.clear();

    if (fids.length === 0) {
        const frame = frames[currentFrameIdx];
        if (frame) fids.push(frame.id);
    }

    let hasError = false;
    for (const fid of fids) {
        const frame = frames.find(f => f.id === parseInt(fid));
        if (!frame) continue;
        const allAnns = [];
        CAMERAS.forEach(cam => {
            getFrameAnns(frame.id, cam).forEach(ann => {
                allAnns.push({
                    camera: cam,
                    category: ann.category,
                    bbox_x: ann.bbox_x, bbox_y: ann.bbox_y,
                    bbox_w: ann.bbox_w, bbox_h: ann.bbox_h,
                    confidence: ann.confidence,
                    is_ai_generated: ann.is_ai_generated || false,
                    ai_bbox_x: ann.ai_bbox_x !== undefined ? ann.ai_bbox_x : null,
                    ai_bbox_y: ann.ai_bbox_y !== undefined ? ann.ai_bbox_y : null,
                    ai_bbox_w: ann.ai_bbox_w !== undefined ? ann.ai_bbox_w : null,
                    ai_bbox_h: ann.ai_bbox_h !== undefined ? ann.ai_bbox_h : null,
                    needs_review: ann.needs_review || false,
                    track_id: ann.track_id || null,
                    custom_name: ann.custom_name || null,
                });
            });
        });
        try {
            await fetch(`${BASE_URL}/tasks/${taskId}/annotations`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ frame_id: frame.id, annotations: allAnns })
            });
        } catch (e) {
            hasError = true;
            modifiedFrameIds.add(fid); // Trả lại hàng đợi để thực hiện lưu lại sau
        }
    }
    if (showMsg) {
        if (hasError) showToast('Lỗi lưu tiến trình', 'error');
        else showToast('Đã lưu tiến trình', 'success');
    }
}

// Lưu toàn bộ tất cả nhãn đã gán trên các khung hình
async function saveAnnotations(showMsg = true) {
    modifiedFrameIds.clear();
    const frameIds = Object.keys(annotations);
    for (const fid of frameIds) {
        const frame = frames.find(f => f.id === parseInt(fid));
        if (!frame) continue;
        const allAnns = [];
        CAMERAS.forEach(cam => {
            getFrameAnns(frame.id, cam).forEach(ann => {
                allAnns.push({
                    camera: cam,
                    category: ann.category,
                    bbox_x: ann.bbox_x, bbox_y: ann.bbox_y,
                    bbox_w: ann.bbox_w, bbox_h: ann.bbox_h,
                    confidence: ann.confidence,
                    is_ai_generated: ann.is_ai_generated || false,
                    ai_bbox_x: ann.ai_bbox_x !== undefined ? ann.ai_bbox_x : null,
                    ai_bbox_y: ann.ai_bbox_y !== undefined ? ann.ai_bbox_y : null,
                    ai_bbox_w: ann.ai_bbox_w !== undefined ? ann.ai_bbox_w : null,
                    ai_bbox_h: ann.ai_bbox_h !== undefined ? ann.ai_bbox_h : null,
                    needs_review: ann.needs_review || false,
                    track_id: ann.track_id || null,
                    custom_name: getTrackName(ann.category, ann.track_id) || ann.custom_name || null,
                });
            });
        });
        try {
            await fetch(`${BASE_URL}/tasks/${taskId}/annotations`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ frame_id: frame.id, annotations: allAnns })
            });
        } catch (e) { /* silent */ }
    }
    unsaved = false;
    localStorage.setItem(`lastFrame_${taskId}`, currentFrameIdx);

    // Đồng bộ nếu chuyển đến từ FrameList
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo === 'FrameList') {
        const frameNum = currentFrameIdx + 1;
        localStorage.setItem(`framelist_saved_${taskId}_${frameNum}`, 'true');
    }
    if (showMsg) showToast('Đã lưu tất cả nhãn', 'success');
}

// ==============================================================================
// GỬI NHIỆM VỤ ĐÃ GÁN NHÃN (SUBMIT TASK)
// ==============================================================================
async function submitTask() {
    if (task && task.status === 'rejected') {
        showToast('Vui lòng sửa từng khung hình qua danh sách khung hình rồi nộp lại', 'info');
        return;
    }

    // Đếm tổng số nhãn đã gán trên toàn bộ nhiệm vụ
    let totalAnns = 0;
    Object.values(annotations).forEach(fa => Object.values(fa).forEach(ca => totalAnns += ca.length));

    if (totalAnns === 0) {
        showToast('Không thể nộp vì nhiệm vụ chưa có đối tượng nào đã được gán nhãn', 'error');
        return;
    }

    showConfirm('Nộp bài? Bài sẽ được giao cho người kiểm tra.', async () => {
        await saveAnnotations(false);

        const btn = document.getElementById('btnNop') || document.querySelector('.btn-phe-duyet');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang nộp...'; }

        try {
            const res = await fetch(`${BASE_URL}/tasks/${taskId}/submit`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ time_spent: timerSeconds })
            });
            if (res.ok) {
                clearInterval(timerInterval);
                localStorage.removeItem(`timer_${taskId}`);
                showToast('Nộp bài thành công!', 'success');
                setTimeout(() => window.location.href = 'dashboard.html', 1800);
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi nộp bài', 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Nộp'; }
            }
        } catch (e) {
            showToast('Lỗi kết nối', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Nộp'; }
        }
    }, { title: 'Nộp bài', confirmText: 'Nộp', type: 'info' });
}

// ==============================================================================
// TỰ ĐỘNG PHÁT HIỆN ĐỐI TƯỢNG QUA AI (AI ASSISTANCE)
// ==============================================================================
async function runAI() {
    const frame = frames[currentFrameIdx];
    if (!frame) return;
    const btn = document.querySelector('.btn-ai-auto');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang phân tích...</span>'; }

    const threshold = parseFloat(localStorage.getItem('ai_threshold') || '0.25');
    const reviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');

    try {
        const res = await fetch(`${BASE_URL}/ai/predict`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ frame_id: frame.id, camera: currentCamera, threshold })
        });
        if (!res.ok) { showToast('AI không khả dụng', 'error'); return; }
        const result = await res.json();
        const preds = result.predictions || [];
        if (!preds.length) { showToast('AI không phát hiện đối tượng', 'info'); return; }

        // Phân tách nhãn thủ công và nhãn do AI tự sinh trước đó
        const existingManualAnns = currentAnns().filter(a => !a.is_ai_generated);
        const existingAiAnns = currentAnns().filter(a => a.is_ai_generated);

        // Tính chỉ số track_id lớn nhất hiện tại để tiếp tục tăng tuần tự
        const classMaxId = {};
        Object.values(annotations).forEach(fa => Object.values(fa).forEach(ca => ca.forEach(a => {
            if (a.track_id && a.category) {
                classMaxId[a.category] = Math.max(classMaxId[a.category] || 0, a.track_id);
            }
        })));
        existingManualAnns.forEach(a => {
            if (a.track_id && a.category) {
                classMaxId[a.category] = Math.max(classMaxId[a.category] || 0, a.track_id);
            }
        });

        const newAnns = [...existingManualAnns];

        preds.forEach(p => {
            let nextId = 1;
            while (newAnns.some(a => a.category === p.category && a.track_id === nextId)) {
                nextId++;
            }
            newAnns.push({
                id: genId(),
                category: p.category,
                track_id: nextId,
                bbox_x: p.bbox_x, bbox_y: p.bbox_y,
                bbox_w: p.bbox_w, bbox_h: p.bbox_h,
                confidence: p.confidence,
                is_ai_generated: true,
                ai_bbox_x: p.bbox_x,
                ai_bbox_y: p.bbox_y,
                ai_bbox_w: p.bbox_w,
                ai_bbox_h: p.bbox_h,
                needs_review: p.confidence < reviewThreshold, // Gắn cờ đỏ nếu độ tin cậy thấp hơn mức yêu cầu
                hidden: false,
                custom_name: null,
            });
        });
        setFrameAnns(frame.id, currentCamera, newAnns);
        redrawAnnotations();
        renderLabelList();
        updateCamBadge();
        markUnsaved();
        showToast(`AI phát hiện ${preds.length} đối tượng`, 'success');
    } catch (e) {
        showToast('Lỗi kết nối AI', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-robot"></i> <span>AI TỰ ĐỘNG GÁN NHÃN</span>'; }
    }
}

// ==============================================================================
// PHÓNG TO / THU NHỎ MÀN HÌNH (ZOOM)
// ==============================================================================
let zoomLevel = 100;
const ZOOM_STEP = 10;
const ZOOM_MIN = 30;
const ZOOM_MAX = 200;

function zoomIn() {
    zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
    applyZoom();
}

function zoomOut() {
    zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
    applyZoom();
}

function applyZoom() {
    const img = document.getElementById('mainImage');
    if (!img) return;

    img.style.width = zoomLevel === 100 ? '100%' : `${zoomLevel}%`;
    img.style.height = zoomLevel === 100 ? '100%' : 'auto';

    document.getElementById('zoomLevel').textContent = `${zoomLevel}%`;

    setTimeout(() => {
        imgDisplayW = img.offsetWidth;
        imgDisplayH = img.offsetHeight;
        if (annCanvas) { annCanvas.width = imgDisplayW; annCanvas.height = imgDisplayH; }
        if (drawCanvas) { drawCanvas.width = imgDisplayW; drawCanvas.height = imgDisplayH; }
        redrawAnnotations();
    }, 50);
}

// Lăn chuột phóng to/thu nhỏ
document.querySelector('.center-canvas')?.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
}, { passive: false });

// ==============================================================================
// KÉO THẢ DI CHUYỂN GÓC NHÌN (PAN)
// ==============================================================================
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };

function enablePan() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', onPanStart);
    canvas.addEventListener('mousemove', onPanMove);
    canvas.addEventListener('mouseup', onPanEnd);
    canvas.addEventListener('mouseleave', onPanEnd);
}

function disablePan() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.removeEventListener('mousedown', onPanStart);
    canvas.removeEventListener('mousemove', onPanMove);
    canvas.removeEventListener('mouseup', onPanEnd);
    canvas.removeEventListener('mouseleave', onPanEnd);
}

function onPanStart(e) {
    if (currentTool !== 'pan') return;
    isPanning = true;
    panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    e.currentTarget.style.cursor = 'grabbing';
}

function onPanMove(e) {
    if (!isPanning || currentTool !== 'pan') return;
    panOffset.x = e.clientX - panStart.x;
    panOffset.y = e.clientY - panStart.y;
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
}

function onPanEnd(e) {
    isPanning = false;
    if (currentTool === 'pan') e.currentTarget.style.cursor = 'grab';
}

// ==============================================================================
// SAO CHÉP NHANH HỘP GIỚI HẠN (CLONE)
// ==============================================================================
function cloneSelected() {
    if (!selectedAnnId) {
        showToast('Chọn một nhãn trước khi sao chép', 'info');
        setActiveTool('pointer');
        return;
    }
    const frame = frames[currentFrameIdx];
    const anns = currentAnns();
    const src = anns.find(a => a.id === selectedAnnId);
    if (!src) return;

    const offset = 0.02; // Dịch nhẹ 2% so với trục cũ để tránh đè lấp
    const clone = {
        ...src,
        id: genId(),
        bbox_x: Math.min(1 - src.bbox_w, src.bbox_x + offset),
        bbox_y: Math.min(1 - src.bbox_h, src.bbox_y + offset),
        hidden: false,
        is_ai_generated: false,
    };
    anns.push(clone);
    setFrameAnns(frame.id, currentCamera, anns);
    selectedAnnId = clone.id;
    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
    showToast('Đã sao chép nhãn', 'success');
    setActiveTool('pointer');
}

// ==============================================================================
// CO GIÃN HỘP GIỚI HẠN (RESIZE HANDLES)
// ==============================================================================
// Điểm neo co giãn: 8 điểm (4 góc + 4 trung điểm cạnh)
let resizeHandle = null; // 'tl','tc','tr','ml','mr','bl','bc','br'
let resizeAnn = null;
let resizeStart = null;
const HANDLE_SIZE = 8;

// Trả về toạ độ pixel của 8 điểm neo quanh hộp
function getHandles(ann) {
    const x = ann.bbox_x * imgDisplayW;
    const y = ann.bbox_y * imgDisplayH;
    const w = ann.bbox_w * imgDisplayW;
    const h = ann.bbox_h * imgDisplayH;
    return {
        tl: { x, y },
        tc: { x: x + w / 2, y },
        tr: { x: x + w, y },
        ml: { x, y: y + h / 2 },
        mr: { x: x + w, y: y + h / 2 },
        bl: { x, y: y + h },
        bc: { x: x + w / 2, y: y + h },
        br: { x: x + w, y: y + h },
    };
}

// Kiểm tra xem người dùng có click trúng điểm neo nào hay không
function hitHandle(px, py, ann) {
    const handles = getHandles(ann);
    for (const [key, pt] of Object.entries(handles)) {
        if (Math.abs(px - pt.x) <= HANDLE_SIZE && Math.abs(py - pt.y) <= HANDLE_SIZE) return key;
    }
    return null;
}

// Vẽ điểm neo hình vuông nhỏ màu trắng viền xanh tại các góc
function drawHandles(ann) {
    if (!annCtx || currentTool !== 'resize') return;
    const handles = getHandles(ann);
    annCtx.fillStyle = '#fff';
    annCtx.strokeStyle = '#2563EB';
    annCtx.lineWidth = 1.5;
    for (const pt of Object.values(handles)) {
        annCtx.beginPath();
        annCtx.rect(pt.x - HANDLE_SIZE / 2, pt.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        annCtx.fill();
        annCtx.stroke();
    }
}

function redrawWithHandles() {
    redrawAnnotations();
    if (currentTool === 'resize' && selectedAnnId) {
        const ann = currentAnns().find(a => a.id === selectedAnnId);
        if (ann) drawHandles(ann);
    }
}

// ==============================================================================
// QUẢN LÝ TÊN VẾT THEO DÕI (TRACK NAMES MAP & COUNTERS)
// ==============================================================================
const trackNames = {};

function getTrackName(category, trackId) {
    return trackNames[`${category}_${trackId}`] || null;
}

function setTrackName(category, trackId, name) {
    if (name) trackNames[`${category}_${trackId}`] = name;
    else delete trackNames[`${category}_${trackId}`];
}

const trackCounters = {};

// Tìm số ID theo vết (Track ID) tiếp theo chưa sử dụng cho nhóm
function getNextTrackId(category) {
    let maxId = 0;
    Object.values(annotations).forEach(fa => Object.values(fa).forEach(ca => ca.forEach(a => {
        if (a.category === category && a.track_id && a.track_id > maxId) maxId = a.track_id;
    })));
    trackCounters[category] = maxId + 1;
    return trackCounters[category];
}

function initTrackCounters() {
    Object.keys(trackCounters).forEach(k => delete trackCounters[k]);
}

const recalcTrackCounters = initTrackCounters;

// ==============================================================================
// ĐỔI TÊN ĐỐI TƯỢNG (RENAME ANNOTATION)
// ==============================================================================
function renameAnn(id) {
    const anns = currentAnns();
    const ann = anns.find(a => a.id === id);
    if (!ann) return;
    const trackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';
    const current = ann.custom_name || '';
    const newName = prompt(`Đổi tên cho đối tượng "${trackNum}":\n(Để trống để dùng mặc định)`, current);
    if (newName === null) return;
    const trimmed = newName.trim() || null;
    ann.custom_name = trimmed;
    const frame = frames[currentFrameIdx];
    setFrameAnns(frame.id, currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
    markUnsaved();
}

// ==============================================================================
// KẾT XUẤT DANH SÁCH CẦN CHÚ Ý (ATTENTION LIST)
// ==============================================================================
function renderAttentionList() {
    const list = document.getElementById('attentionList');
    const countEl = document.getElementById('attentionCount');
    if (!list) return;

    const flagged = currentAnns().filter(ann => ann.needs_review === true);

    // Cập nhật số nhãn cần chú ý lên badge
    if (countEl) {
        if (flagged.length > 0) {
            countEl.textContent = flagged.length;
            countEl.style.display = 'inline-block';
        } else {
            countEl.style.display = 'none';
        }
    }

    if (!flagged.length) {
        list.innerHTML = '<div style="color:#94A3B8;font-size:13px;padding:8px 0">Không có nhãn nào cần chú ý.</div>';
        return;
    }

    list.innerHTML = flagged.map(ann => {
        const cls = CLASS_MAP[ann.category];
        const color = cls ? cls.color : '#14B8A6';
        const label = cls ? cls.name : ann.category;
        const conf = ann.confidence != null ? `${Math.round(ann.confidence * 100)}%` : '';
        const sel = ann.id === selectedAnnId;
        return `
        <div class="label-item ${sel ? 'active' : ''}" onclick="selectAnn('${ann.id}')" style="border-left:3px solid #EF4444">
            <div class="label-info">
                <div class="label-dot" style="background:${color}"></div>
                <div class="label-text">
                    <span class="label-name" style="cursor:pointer">
                        ${label} <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px"></i>
                        <span style="font-size:10px;color:#EF4444;margin-left:4px">${conf}</span>
                    </span>
                    <div class="label-actions">
                        <i class="fa-solid fa-check" title="Đánh dấu đã kiểm tra"
                           onclick="markReviewed('${ann.id}');event.stopPropagation()"
                           style="color:#10B981"></i>
                        <i class="fa-regular fa-trash-can" title="Xóa" onclick="deleteAnn('${ann.id}');event.stopPropagation()"></i>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Xác nhận đã kiểm tra nhãn cảnh báo (needs_review = false)
function markReviewed(id) {
    const ann = currentAnns().find(a => a.id === id);
    if (!ann) return;
    ann.needs_review = false;
    sessionReviewedIds.add(id);
    redrawAnnotations();
    renderLabelList();
    renderAttentionList();
    markUnsaved();
}

// Chuyển đổi tab hiển thị ở Sidebar (Tất cả nhãn vs Cần chú ý)
function switchResultTab(tab) {
    window._currentResultTab = tab;
    const panelResults = document.getElementById('panelResults');
    const panelAttention = document.getElementById('panelAttention');
    const tabResults = document.getElementById('tabResults');
    const tabAttention = document.getElementById('tabAttention');
    if (tab === 'results') {
        panelResults.style.display = '';
        panelAttention.style.display = 'none';
        tabResults.classList.add('active');
        tabAttention.classList.remove('active');
    } else {
        panelResults.style.display = 'none';
        panelAttention.style.display = '';
        tabResults.classList.remove('active');
        tabAttention.classList.add('active');
        renderAttentionList();
    }
    redrawAnnotations();
}

// ==============================================================================
// HIỂN THỊ HỘP THOẠI CHI TIẾT NHIỆM VỤ (TASK INFO MODAL)
// ==============================================================================
function openTaskInfo() {
    const modal = document.getElementById('modalTaskInfo');
    if (!modal || !task) return;
    document.getElementById('infoProjectName').textContent = task.scene_name || `Nhiệm vụ #${task.id}`;
    document.getElementById('infoTaskName').textContent = task.scene_description || 'Không có mô tả';
    document.getElementById('infoLabeler').textContent = task.assigned_user
        ? (task.assigned_user.username + (task.assigned_user.full_name ? ' — ' + task.assigned_user.full_name : ''))
        : '—';
    document.getElementById('infoReviewer').textContent = task.reviewer_user
        ? (task.reviewer_user.username + (task.reviewer_user.full_name ? ' — ' + task.reviewer_user.full_name : ''))
        : 'Chưa phân công';
    modal.style.display = 'flex';
}

// ==============================================================================
// BỘ LỌC HÌNH ẢNH (IMAGE FILTER)
// ==============================================================================
function applyImageFilter() {
    const brightness = document.getElementById('brightnessSlider')?.value || 100;
    const contrast = document.getElementById('contrastSlider')?.value || 100;
    document.getElementById('brightnessVal').textContent = brightness + '%';
    document.getElementById('contrastVal').textContent = contrast + '%';
    const img = document.getElementById('mainImage');
    if (img) img.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
}

function resetImageFilter() {
    const bs = document.getElementById('brightnessSlider');
    const cs = document.getElementById('contrastSlider');
    if (bs) bs.value = 100;
    if (cs) cs.value = 100;
    applyImageFilter();
}

// ==============================================================================
// THÔNG BÁO TOAST & CSS DỰ PHÒNG
// ==============================================================================
function showToast(msg, type = 'info', customColor = null) {
    const colors = { success: '#10B981', error: '#EF4444', info: '#2563EB', custom: customColor };
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', custom: 'fa-tag' };
    const bg = customColor || colors[type] || '#2563EB';
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:80px;right:16px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:${bg};box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;font-family:Inter,sans-serif`;
    t.innerHTML = `<i class="fa-solid ${icons[type] || 'fa-circle-info'}"></i>${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

const style = document.createElement('style');
style.textContent = `
@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
.category-group-header:hover { background: #E2E8F0 !important; }
.category-group-content { margin-left: 4px; border-left: 2px solid #F1F5F9; padding-left: 4px; }
`;
document.head.appendChild(style);

// ==============================================================================
// ĐĂNG KÝ SỰ KIỆN KHỞI CHẠY (DOMContentLoaded & BACKDROP CLICK)
// ==============================================================================
// Tự động đóng các modal popup khi click chuột vào vùng nền (backdrop) trống xung quanh
['modalTaskInfo', 'modalShortcuts', 'modalSettings'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function (e) {
        if (e.target === this) this.style.display = 'none';
    });
});

init();
