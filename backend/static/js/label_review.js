// ==============================================================================
// CẤU HÌNH & XÁC THỰC CƠ BẢN
// ==============================================================================
const BASE_URL = '/api';

// Hàm lấy token JWT từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// KIỂM TRA QUYỀN TRUY CẬP (Auth guard)
// Đọc thông tin người dùng từ localStorage. Nếu không phải User hoặc Admin, chuyển hướng về login.html
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || (currentUser.role !== 'user' && currentUser.role !== 'admin')) {
    window.location.href = '../login.html';
}

const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');
const reviewMode = urlParams.get('mode') === 'review'; // true = reviewer đang thực hiện kiểm duyệt
if (!taskId) window.location.href = 'dashboard.html';

// ==============================================================================
// ĐỊNH NGHĨA CÁC LỚP ĐỐI TƯỢNG (CLASSES) & CAMERA TRÊN XE TỰ HÀNH (nuScenes)
// ==============================================================================
const CLASSES = [
    { id: 'vehicle.car',        name: 'Xe con',       icon: 'fa-car',              color: '#3B82F6' },
    { id: 'vehicle.truck',      name: 'Xe tải',       icon: 'fa-truck',            color: '#F59E0B' },
    { id: 'vehicle.bus',        name: 'Xe buýt',      icon: 'fa-bus',              color: '#8B5CF6' },
    { id: 'vehicle.motorcycle', name: 'Xe máy',       icon: 'fa-motorcycle',       color: '#EC4899' },
    { id: 'vehicle.bicycle',    name: 'Xe đạp',       icon: 'fa-bicycle',          color: '#F97316' },
    { id: 'human.pedestrian',   name: 'Người đi bộ',  icon: 'fa-person-walking',   color: '#10B981' },
];
const CLASS_MAP = {};
CLASSES.forEach(c => CLASS_MAP[c.id] = c);

// Danh sách camera xung quanh xe tự hành
let CAMERAS = ['CAM_FRONT','CAM_FRONT_LEFT','CAM_FRONT_RIGHT','CAM_BACK','CAM_BACK_LEFT','CAM_BACK_RIGHT'];
const CAM_LABELS = {
    CAM_FRONT:'Cam trước', CAM_FRONT_LEFT:'Cam trái trước', CAM_FRONT_RIGHT:'Cam phải trước',
    CAM_BACK:'Cam sau', CAM_BACK_LEFT:'Cam trái sau', CAM_BACK_RIGHT:'Cam phải sau',
};

// ==============================================================================
// KHỞI TẠO TRẠNG THÁI GIAO DIỆN (STATE)
// ==============================================================================
let task = null;
let frames = [];
let currentFrameIdx = 0;
let currentCamera = 'CAM_FRONT';
let annotations = {};
let hiddenIds = new Set();
const hiddenCategories = new Set();
let selectedAnnId = null;
let collapsedCategories = {};

// Trạng thái kiểm duyệt của từng khung hình: { [frameId]: { status: 'correct'|'wrong'|null, feedback: '' } }
let frameReviews = {};

// ==============================================================================
// ĐỒNG BỘ THÔNG TIN NHIỆM VỤ & BỘ LỌC ẢNH
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

// Áp dụng bộ lọc ảnh (độ sáng & độ tương phản)
function applyImageFilter() {
    const brightness = document.getElementById('brightnessSlider')?.value || 100;
    const contrast = document.getElementById('contrastSlider')?.value || 100;
    document.getElementById('brightnessVal').textContent = brightness + '%';
    document.getElementById('contrastVal').textContent = contrast + '%';
    const img = document.getElementById('mainImage');
    if (img) img.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
}

// Đặt lại (reset) bộ lọc ảnh về mặc định (100%)
function resetImageFilter() {
    const bs = document.getElementById('brightnessSlider');
    const cs = document.getElementById('contrastSlider');
    if (bs) bs.value = 100;
    if (cs) cs.value = 100;
    applyImageFilter();
}

// Ẩn/hiển thị nhanh các nhãn thuộc cùng một lớp đối tượng (category)
function toggleCategoryHide(catId) {
    if (hiddenCategories.has(catId)) {
        hiddenCategories.delete(catId);
    } else {
        hiddenCategories.add(catId);
    }
    redrawAnnotations();
    renderLabelList();
}

// Lưu thông tin đánh giá khung hình xuống localStorage của trình duyệt
function saveReviewsToStorage() {
    localStorage.setItem(`review_${taskId}`, JSON.stringify(frameReviews));
}

// Khôi phục thông tin đánh giá đã lưu từ localStorage
function loadReviewsFromStorage() {
    try {
        const saved = localStorage.getItem(`review_${taskId}`);
        if (saved) frameReviews = JSON.parse(saved);
    } catch (e) { frameReviews = {}; }
}

// Biến điều khiển vẽ khung canvas lên ảnh camera
let annCanvas = null, annCtx = null;
let imgDisplayW = 1, imgDisplayH = 1;

// Mức độ phóng to (Zoom) và Công cụ đang chọn (Tools)
let zoomScale = 1;
let currentTool = 'pointer'; // 'pointer' (chọn/click) hoặc 'pan' (kéo thả góc nhìn)

// Thiết lập công cụ vẽ/tác vụ hiện hành trên màn hình
function setActiveTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tools-section .tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`tool-${tool}`);
    if (activeBtn) activeBtn.classList.add('active');

    const canvas = document.querySelector('.center-canvas');
    if (canvas) {
        if (tool === 'pointer') {
            canvas.style.cursor = 'default';
        } else if (tool === 'pan') {
            canvas.style.cursor = 'grab';
        }
    }
}

// Bộ đếm thời gian kiểm duyệt (Timer)
let timerSeconds = 0, timerInterval = null;

// ==============================================================================
// KHỞI TẠO BẢN KIỂM DUYỆT (INIT)
// ==============================================================================
async function init() {
    startTimer();
    await loadTask();
    setupNav();
    document.getElementById('btnDaKiemTra').addEventListener('click', submitReview);
    document.getElementById('frameFeedback').addEventListener('input', saveFeedbackToState);
    
    // Lưu ý kiến đóng góp (feedback) cho khung hình khi reviewer ngừng gõ
    document.getElementById('frameFeedback').addEventListener('blur', function() {
        saveFeedbackToState();
        // Đồng bộ vào framelist_review nếu đến từ danh sách FrameList
        const returnTo = new URLSearchParams(window.location.search).get('returnTo');
        if (returnTo === 'FrameList') {
            try {
                const frameNum = currentFrameIdx + 1;
                const reviewKey = `framelist_review_${taskId}`;
                const rs = JSON.parse(localStorage.getItem(reviewKey) || '{}');
                const fb = document.getElementById('frameFeedback').value.trim();
                if (fb) rs['fb_' + frameNum] = fb;
                localStorage.setItem(reviewKey, JSON.stringify(rs));
            } catch(e) {}
        }
    });
}

// Bắt đầu đếm thời gian thực hiện kiểm duyệt
function startTimer() {
    const saved = parseInt(localStorage.getItem(`review_timer_${taskId}`) || '0');
    timerSeconds = saved;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timerSeconds++;
        localStorage.setItem(`review_timer_${taskId}`, timerSeconds);
        updateTimerDisplay();
    }, 1000);
}

// Định dạng và hiển thị thời gian kiểm duyệt (hh:mm:ss)
function updateTimerDisplay() {
    const h = String(Math.floor(timerSeconds / 3600)).padStart(2,'0');
    const m = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2,'0');
    const s = String(timerSeconds % 60).padStart(2,'0');
    const el = document.querySelector('.timer-pill');
    if (el) el.innerHTML = `<i class="fa-regular fa-clock"></i> ${h}:${m}:${s}`;
}

// Ngắt bộ đếm thời gian khi reviewer đóng hoặc chuyển trang
window.addEventListener('beforeunload', () => {
    clearInterval(timerInterval);
    localStorage.setItem(`review_timer_${taskId}`, timerSeconds);
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

        // Kiểm tra quyền kiểm duyệt nhiệm vụ
        const isReviewer = task.reviewer_id === currentUser.id;
        const isLabeler = task.assigned_to === currentUser.id;
        const isAdmin = currentUser.role === 'admin';

        if (!isReviewer && !isLabeler && !isAdmin) {
            showToast('Bạn không có quyền xem nhiệm vụ này', 'error');
            const redirectUrl = currentUser.role === 'admin' ? '../Admin/dashboard.html' : 'dashboard.html';
            setTimeout(() => window.location.href = redirectUrl, 2000);
            return;
        }

        // Ẩn nút "Đã kiểm tra" nếu không phải reviewer hay admin
        if (!isReviewer && !isAdmin) {
            const btn = document.getElementById('btnDaKiemTra');
            if (btn) btn.style.display = 'none';
        }

        // Admin: thay đổi dòng chữ nút thành "Xác nhận kết quả" và điều hướng đường dẫn trở về
        if (isAdmin) {
            const btn = document.getElementById('btnDaKiemTra');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-shield-check"></i> Xác nhận kết quả';
            const backLink = document.getElementById('backLinkReview');
            if (backLink) backLink.href = '../Admin/dashboard.html';
        }

        // Cập nhật ảnh đại diện người dùng
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl && avatarEl.tagName === 'DIV' && !currentUser.avatar_url) {
            const initials = (currentUser.username || 'NL').substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }

        await loadFrames(task.scene_id);

        // Nếu chế độ xem danh sách FrameList đang kích hoạt
        // Vô hiệu hóa nút "Đã kiểm tra" tổng thể để bắt buộc kiểm tra từng frame
        const returnTo = new URLSearchParams(window.location.search).get('returnTo');
        const framelistActive = localStorage.getItem(`framelist_mode_${taskId}`) === 'review';
        if (returnTo === 'FrameList' || framelistActive) {
            const btn = document.getElementById('btnDaKiemTra');
            if (btn) {
                btn.disabled = true;
                btn.title = 'Vui lòng đánh giá từng khung hình qua danh sách rồi xác nhận';
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
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

        // Thiết lập camera mặc định là camera đầu tiên nếu cam hiện tại không nằm trong danh sách phát hiện
        if (CAMERAS.length > 0 && !CAMERAS.includes(currentCamera)) {
            currentCamera = CAMERAS[0];
        }

        const urlFrame = parseInt(new URLSearchParams(window.location.search).get('frame') || '-1');
        const savedFrame = parseInt(localStorage.getItem(`review_frame_${taskId}`) || '0');
        const startFrame = urlFrame >= 0
            ? Math.min(urlFrame, frames.length - 1)
            : Math.min(Math.max(0, savedFrame), frames.length - 1);
        console.log("DEBUG [loadFrames]: urlFrame =", urlFrame, "savedFrame =", savedFrame, "startFrame =", startFrame);
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
                id: String(ann.id),
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
        // Khởi tạo các đánh giá khung hình - nạp từ bộ nhớ cache của trình duyệt trước
        loadReviewsFromStorage();
        frames.forEach(f => {
            if (!frameReviews[f.id]) frameReviews[f.id] = { status: null, feedback: '' };
        });
    } catch (e) { /* silent */ }
}

// ==============================================================================
// ĐIỀU HƯỚNG VÀ PHÍM TẮT (NAVIGATION)
// ==============================================================================
function setupNav() {
    document.getElementById('btnFirst').addEventListener('click', () => goToFrame(0));
    document.getElementById('btnPrev').addEventListener('click', () => goToFrame(currentFrameIdx - 1));
    document.getElementById('btnNext').addEventListener('click', () => goToFrame(currentFrameIdx + 1));
    document.getElementById('btnLast').addEventListener('click', () => goToFrame(frames.length - 1));
    
    document.addEventListener('keydown', e => {
        // Không kích hoạt phím tắt khi đang gõ nhận xét (feedback)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // 1. PHÓNG TO/THU NHỎ (Ctrl + ArrowUp/ArrowDown)
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

        // 3. DI CHUYỂN QUA LẠI KHUNG HÌNH (ArrowRight/ArrowLeft hoặc D/A)
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') goToFrame(currentFrameIdx + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') goToFrame(currentFrameIdx - 1);
        if (e.key === 'Home') goToFrame(0);
        if (e.key === 'End')  goToFrame(frames.length - 1);

        // 4. CHỌN CAMERA NHANH BẰNG PHÍM SỐ (1-6)
        if (['1','2','3','4','5','6'].includes(e.key)) {
            switchCamera(CAMERAS[parseInt(e.key) - 1]);
        }

        // 5. ĐÁNH GIÁ NHANH (Phím C: Đúng, Phím W hoặc X: Sai)
        if (e.key === 'c' || e.key === 'C') markFrame('correct');
        if (e.key === 'w' || e.key === 'W' || e.key === 'x' || e.key === 'X') markFrame('wrong');

        // 6. PHÓNG TO NHANH BẰNG PHÍM + / -
        if (e.key === '+' || e.key === '=') zoomIn();
        if (e.key === '-' || e.key === '_') zoomOut();
        if (e.key === '0') { zoomScale = 1; panOffset = { x: 0, y: 0 }; applyZoom(); }
    });

    // Ctrl + Lăn chuột (wheel) để phóng to/thu nhỏ góc nhìn
    window.addEventListener('wheel', e => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) zoomIn();
            else zoomOut();
        }
    }, { passive: false });
}

// Chuyển sang khung hình cụ thể
async function goToFrame(idx) {
    console.log("DEBUG [goToFrame]: idx =", idx);
    if (idx < 0 || idx >= frames.length) return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('frame', idx);
        window.history.replaceState(null, '', url.toString());
    } catch (e) {}
    
    // Lưu phản hồi của frame hiện tại trước khi chuyển sang frame mới
    saveFeedbackToState();
    currentFrameIdx = idx;
    selectedAnnId = null;
    
    // Reset góc kéo màn hình, giữ nguyên hệ số Zoom
    panOffset = { x: 0, y: 0 };
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(0px, 0px) scale(${zoomScale})`;
    
    document.getElementById('pageNum').textContent = idx + 1;
    renderCamList(frames[idx]);
    await loadImage(frames[idx], currentCamera);
    updateProgress();
    loadFrameReviewState();
}

// Chuyển camera hiển thị
async function switchCamera(cam) {
    if (!cam || !CAMERAS.includes(cam) || cam === currentCamera) return;
    currentCamera = cam;
    await loadImage(frames[currentFrameIdx], cam);
    renderCamList(frames[currentFrameIdx]);
}

// Vẽ danh sách camera cùng các ảnh nhỏ (thumbnail) tương ứng
function renderCamList(frame) {
    const list = document.getElementById('camList');
    if (!list) return;
    list.innerHTML = CAMERAS.map(cam => {
        const anns = getFrameAnns(frame.id, cam);
        const active = cam === currentCamera;
        return `
        <div class="cam-row">
            <div class="cam-item ${active ? 'active' : ''}" onclick="switchCamera('${cam}')">
                <img id="thumb_${cam}" src="" style="width:100%;height:100%;object-fit:cover" class="hidden">
                <div id="nodata_${cam}" style="display:none;position:absolute;inset:0;background:#E2E8F0;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none">
                    <i class="fa-solid fa-camera-slash" style="font-size:28px;color:#000"></i>
                    <div style="font-size:12px;font-weight:700;color:#000;text-align:center;line-height:1.3">Không có<br>dữ liệu</div>
                </div>
                <div class="cam-label">${CAM_LABELS[cam] || cam}</div>
                ${anns.length ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">${anns.length}</div>` : ''}
            </div>
        </div>`;
    }).join('');
    // Nạp ngầm ảnh thumbnail
    CAMERAS.forEach(cam => loadThumb(frame, cam));
}

// Tải ảnh thumbnail góc camera của khung hình
async function loadThumb(frame, cam) {
    const img = document.getElementById(`thumb_${cam}`);
    if (!img) return;
    const nodata = document.getElementById(`nodata_${cam}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}?_=${Date.now()}`, {
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

// Tải ảnh camera kích thước đầy đủ lên màn hình làm việc chính
async function loadImage(frame, cam) {
    const mainImg = document.getElementById('mainImage');
    const container = document.querySelector('.canvas-container');
    if (!mainImg || !container) return;
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}?_=${Date.now()}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        mainImg.src = URL.createObjectURL(blob);
        mainImg.style.display = 'block';
        mainImg.onload = () => {
            setupCanvas(container, mainImg);
            redrawAnnotations();
            renderLabelList();
        };
    } catch (e) {
        showToast('Không thể tải ảnh', 'error');
    }
}

// Cấu hình lại canvas vẽ đè nhãn lên ảnh
function setupCanvas(container, img) {
    container.querySelectorAll('canvas').forEach(c => c.remove());
    imgDisplayW = img.offsetWidth;
    imgDisplayH = img.offsetHeight;

    annCanvas = document.createElement('canvas');
    annCanvas.width = imgDisplayW;
    annCanvas.height = imgDisplayH;
    annCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    container.appendChild(annCanvas);
    annCtx = annCanvas.getContext('2d');
}

// ==============================================================================
// XỬ LÝ VÀ HIỂN THỊ CÁC HỘP GIỚI HẠN (ANNOTATIONS / BOUNDING BOXES)
// ==============================================================================
function getFrameAnns(fid, cam) { return annotations[fid]?.[cam] || []; }
function currentAnns() {
    const f = frames[currentFrameIdx];
    return f ? getFrameAnns(f.id, currentCamera) : [];
}

// Vẽ lại toàn bộ hộp giới hạn (Bounding Box) lên canvas
function redrawAnnotations() {
    if (!annCtx) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
    currentAnns().forEach(ann => {
        if (hiddenIds.has(ann.id) || hiddenCategories.has(ann.category)) return;
        const cls = CLASS_MAP[ann.category];
        const color = cls ? cls.color : '#14B8A6';
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

        // Vẽ biểu tượng cờ đỏ nhỏ nếu nhãn này được đánh dấu "cần kiểm duyệt" (needs_review)
        if (ann.needs_review) {
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

// Thu gọn hoặc mở rộng nhóm nhãn theo phân lớp ở sidebar
function toggleCategoryCollapse(category) {
    collapsedCategories[category] = !collapsedCategories[category];
    renderLabelList();
}

// Vẽ danh sách nhãn ra Sidebar
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

    // Nhóm các nhãn theo mã lớp tương ứng
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
        
        // Vẽ header nhóm nhãn
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

        // Vẽ từng nhãn cụ thể trong nhóm
        html += groupAnns.map((ann) => {
            const color = cls.color;
            const trackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';
            const label = ann.custom_name ? `${trackNum} - ${ann.custom_name}` : `${trackNum}`;
            const isAnnHidden = hiddenIds.has(ann.id);
            const hidden = isAnnHidden || isCatHidden;
            const sel = ann.id === selectedAnnId;
            const flagMark = ann.needs_review
                ? ' <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px"></i>' : '';
            
            // Tính toán mức độ tương đồng IoU (Intersection over Union) giữa nhãn của AI và nhãn của Labeler chỉnh sửa
            let similarityText = '';
            if (ann.is_ai_generated && ann.ai_bbox_x !== null && ann.ai_bbox_x !== undefined) {
                const ax1 = ann.ai_bbox_x, ay1 = ann.ai_bbox_y, ax2 = ann.ai_bbox_x + ann.ai_bbox_w, ay2 = ann.ai_bbox_y + ann.ai_bbox_h;
                const bx1 = ann.bbox_x, by1 = ann.bbox_y, bx2 = ann.bbox_x + ann.bbox_w, by2 = ann.bbox_y + ann.bbox_h;
                const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
                const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
                let iou = 0;
                if (ix2 > ix1 && iy2 > iy1) {
                    const inter = (ix2 - ix1) * (iy2 - iy1);
                    const union = ann.ai_bbox_w * ann.ai_bbox_h + ann.bbox_w * ann.bbox_h - inter;
                    iou = union > 0 ? inter / union : 0;
                }
                similarityText = ` (${Math.round(iou * 100)}%)`;
            }
            const aiMark = ann.is_ai_generated
                ? ` <span style="font-size:10px;color:#9333EA">AI${similarityText}</span>` : '';
            return `
            <div class="review-label-item ${sel ? 'active' : ''}" onclick="selectAnn('${ann.id}')">
                <div class="label-info">
                    <div class="label-dot" style="background:${color};opacity:${hidden ? 0.3 : 1}"></div>
                    <div class="label-text">
                        <span class="label-name" style="opacity:${hidden ? 0.4 : 1}">${label}${aiMark}${flagMark}</span>
                    </div>
                </div>
                <i class="${isAnnHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}"
                   style="color:#94A3B8;cursor:pointer;font-size:13px;opacity:${isCatHidden ? 0.4 : 1};pointer-events:${isCatHidden ? 'none' : 'auto'}"
                   title="${isAnnHidden ? 'Hiện nhãn' : 'Ẩn nhãn'}"
                   onclick="toggleHide('${ann.id}');event.stopPropagation()"></i>
            </div>`;
        }).join('');

        html += `</div>`; // Đóng category-group-content
    });

    list.innerHTML = html;
}

// Click chọn một nhãn từ sidebar hoặc canvas
function selectAnn(id) {
    selectedAnnId = selectedAnnId === id ? null : id;
    redrawAnnotations();
    renderLabelList();
    setTimeout(() => {
        const el = document.querySelector('.review-label-item.active');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

// Ẩn / Hiện nhanh một hộp giới hạn cụ thể
function toggleHide(id) {
    if (hiddenIds.has(id)) hiddenIds.delete(id);
    else hiddenIds.add(id);
    redrawAnnotations();
    renderLabelList();
}

// ==============================================================================
// QUẢN LÝ TRẠNG THÁI KIỂM DUYỆT TỪNG KHUNG HÌNH (FRAME REVIEW STATE)
// ==============================================================================
function loadFrameReviewState() {
    const frame = frames[currentFrameIdx];
    if (!frame) return;
    const state = frameReviews[frame.id] || { status: null, feedback: '' };
    document.getElementById('frameFeedback').value = state.feedback || '';
    updateFrameStatusBadge(state.status);
    updateActionButtons(state.status);
}

function saveFeedbackToState() {
    const frame = frames[currentFrameIdx];
    if (!frame) return;
    if (!frameReviews[frame.id]) frameReviews[frame.id] = { status: null, feedback: '' };
    frameReviews[frame.id].feedback = document.getElementById('frameFeedback').value;
    saveReviewsToStorage();
}

// Đánh dấu trạng thái kiểm duyệt cho khung hình hiện hành (Đúng hoặc Sai)
function markFrame(status) {
    const frame = frames[currentFrameIdx];
    if (!frame) return;
    if (!frameReviews[frame.id]) frameReviews[frame.id] = { status: null, feedback: '' };

    frameReviews[frame.id].status = status;
    frameReviews[frame.id].feedback = document.getElementById('frameFeedback').value;

    saveReviewsToStorage();
    localStorage.setItem(`review_frame_${taskId}`, currentFrameIdx);

    // Đồng bộ nếu đến từ giao diện FrameList
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo === 'FrameList') {
        const frameNum = currentFrameIdx + 1;
        localStorage.setItem(`framelist_saved_${taskId}_${frameNum}`, 'true');
        try {
            const reviewKey = `framelist_review_${taskId}`;
            const rs = JSON.parse(localStorage.getItem(reviewKey) || '{}');
            rs[frameNum] = status; 
            const fb = document.getElementById('frameFeedback').value.trim();
            if (fb) rs['fb_' + frameNum] = fb;
            else delete rs['fb_' + frameNum];
            localStorage.setItem(reviewKey, JSON.stringify(rs));
        } catch(e) {}
    }

    updateFrameStatusBadge(status);
    updateActionButtons(status);
    updateProgress();
}

// Cập nhật nhãn trạng thái Đúng/Sai của khung hình trên giao diện
function updateFrameStatusBadge(status) {
    const badge = document.getElementById('frameStatusBadge');
    if (!badge) return;
    if (status === 'correct') {
        badge.className = 'frame-status correct';
        badge.innerHTML = '<i class="fa-solid fa-check"></i> Đúng';
    } else if (status === 'wrong') {
        badge.className = 'frame-status wrong';
        badge.innerHTML = '<i class="fa-solid fa-xmark"></i> Sai';
    } else {
        badge.className = 'frame-status pending';
        badge.innerHTML = 'Chưa đánh giá';
    }
}

// Tạo hiệu ứng thu nhỏ / mờ đi cho nút Đúng / Sai không được tích chọn
function updateActionButtons(status) {
    const btnC = document.getElementById('btnCorrect');
    const btnW = document.getElementById('btnWrong');
    if (btnC) btnC.style.opacity = status === 'correct' ? '1' : (status === 'wrong' ? '0.4' : '1');
    if (btnW) btnW.style.opacity = status === 'wrong' ? '1' : (status === 'correct' ? '0.4' : '1');
    if (btnC) btnC.style.transform = status === 'correct' ? 'scale(1.03)' : '';
    if (btnW) btnW.style.transform = status === 'wrong' ? 'scale(1.03)' : '';
}

// Cập nhật thanh tiến độ (Progress bar) đánh giá
function updateProgress() {
    const total = frames.length;
    const done = Object.values(frameReviews).filter(r => r.status !== null).length;
    document.getElementById('progressText').textContent = `${done} / ${total} khung hình`;
    document.getElementById('progressFill').style.width = `${total ? (done / total * 100) : 0}%`;
}

// ==============================================================================
// GỬI KẾT QUẢ ĐÁNH GIÁ (SUBMIT REVIEW)
// ==============================================================================
async function submitReview() {
    const total = frames.length;
    const done = Object.values(frameReviews).filter(r => r.status !== null).length;
    if (done < total) {
        showConfirm(`Còn ${total - done} khung hình chưa đánh giá. Vẫn muốn nộp?`, () => _doSubmitReview(), { title: 'Xác nhận nộp', confirmText: 'Nộp', type: 'warning' });
        return;
    }
    _doSubmitReview();
}

// Gửi kết quả cuối cùng lên server
async function _doSubmitReview() {
    const wrongFrames = frames.filter(f => frameReviews[f.id]?.status === 'wrong');
    
    // Thu thập toàn bộ các mô tả lỗi từ các khung hình bị đánh dấu "Sai"
    const allFeedbacks = wrongFrames
        .map(f => {
            const frameNum = frames.indexOf(f) + 1;
            const desc = frameReviews[f.id]?.feedback?.trim() || 'Có lỗi cần sửa';
            return `Khung hình ${frameNum}: ${desc}`;
        })
        .join('\n');

    const btn = document.getElementById('btnDaKiemTra');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nộp...';

    const isAdmin = currentUser.role === 'admin';
    const redirectUrl = isAdmin ? '../Admin/dashboard.html' : 'dashboard.html';

    try {
        if (wrongFrames.length > 0) {
            // Có lỗi cần sửa -> Reject nhiệm vụ
            // Admin dùng ghi đè (override) để từ chối trực tiếp, Reviewer dùng review/reject chuẩn
            const url = isAdmin
                ? `${BASE_URL}/tasks/${taskId}/admin/override`
                : `${BASE_URL}/tasks/${taskId}/review/reject`;
            const body = isAdmin
                ? { status: 'rejected', feedback: allFeedbacks }
                : { feedback: allFeedbacks };
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Lỗi');
            showToast('Đã gửi phản hồi về cho người gán nhãn', 'success');
            localStorage.removeItem(`review_${taskId}`);
            localStorage.removeItem(`review_frame_${taskId}`);
        } else {
            // Không có lỗi -> Duyệt nhiệm vụ
            // Admin dùng ghi đè để đạt ngay lập thể, Reviewer chuyển trạng thái chờ duyệt cuối cùng
            const url = isAdmin
                ? `${BASE_URL}/tasks/${taskId}/admin/override`
                : `${BASE_URL}/tasks/${taskId}/review/approve`;
            const body = isAdmin
                ? { status: 'approved' }
                : { reviewer_time_spent: timerSeconds };
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Lỗi');
            const msg = isAdmin ? 'Đã phê duyệt nhiệm vụ' : 'Đã xác nhận — nhiệm vụ chờ admin phê duyệt';
            showToast(msg, 'success');
            localStorage.removeItem(`review_${taskId}`);
            localStorage.removeItem(`review_frame_${taskId}`);
        }
        setTimeout(() => window.location.href = redirectUrl, 2000);
    } catch (e) {
        showToast(e.message || 'Lỗi kết nối', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã kiểm tra';
    }
}

// ==============================================================================
// CHỨC NĂNG PHÓNG TO / THU NHỎ GÓC NHÌN (ZOOM)
// ==============================================================================
function zoomIn() {
    zoomScale = Math.min(zoomScale + 0.25, 4);
    applyZoom();
}
function zoomOut() {
    zoomScale = Math.max(zoomScale - 0.25, 0.5);
    applyZoom();
}
function applyZoom() {
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`;
    document.getElementById('zoomLevel').textContent = `${Math.round(zoomScale * 100)}%`;
}

// ==============================================================================
// CHỨC NĂNG KÉO THẢ DI CHUYỂN GÓC NHÌN (PAN)
// ==============================================================================
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };

function togglePanReview() {
    // Không làm gì - cơ chế kéo thả luôn hoạt động khi chọn đúng công cụ
}

// Xác định xem toạ độ click chuột trên ảnh có nằm trong bounding box nào không
function selectAt(clientX, clientY) {
    const img = document.getElementById('mainImage');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const px = ((clientX - rect.left) / rect.width) * imgDisplayW;
    const py = ((clientY - rect.top) / rect.height) * imgDisplayH;

    const anns = currentAnns();
    for (let i = anns.length - 1; i >= 0; i--) {
        const a = anns[i];
        if (hiddenIds.has(a.id) || hiddenCategories.has(a.category)) continue;

        const x = a.bbox_x * imgDisplayW;
        const y = a.bbox_y * imgDisplayH;
        const w = a.bbox_w * imgDisplayW;
        const h = a.bbox_h * imgDisplayH;

        if (px >= x && px <= x + w && py >= y && py <= y + h) {
            selectedAnnId = a.id;
            redrawAnnotations();
            renderLabelList();
            
            setTimeout(() => {
                const activeEl = document.querySelector('.review-label-item.active');
                if (activeEl) {
                    activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }, 50);
            return;
        }
    }
    selectedAnnId = null;
    redrawAnnotations();
    renderLabelList();
}

// Khởi chạy cơ chế lắng nghe sự kiện kéo thả chuột trên Canvas
function initPanReview() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', _panStart, { passive: false });
    canvas.addEventListener('mousemove', _panMove, { passive: false });
    canvas.addEventListener('mouseup', _panEnd);
    canvas.addEventListener('mouseleave', _panEnd);
    canvas.style.cursor = currentTool === 'pan' ? 'grab' : 'default';
}

function _panStart(e) {
    if (currentTool !== 'pan') {
        selectAt(e.clientX, e.clientY);
        return;
    }
    e.preventDefault();
    isPanning = true;
    panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    e.currentTarget.style.cursor = 'grabbing';
    e.currentTarget.style.userSelect = 'none';
}

function _panMove(e) {
    if (currentTool !== 'pan' || !isPanning) return;
    e.preventDefault();
    panOffset.x = e.clientX - panStart.x;
    panOffset.y = e.clientY - panStart.y;
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`;
}

function _panEnd(e) {
    if (currentTool !== 'pan') return;
    isPanning = false;
    e.currentTarget.style.cursor = 'grab';
    e.currentTarget.style.userSelect = '';
}

// ==============================================================================
// THÔNG BÁO TOAST & CSS DỰ PHÒNG
// ==============================================================================
function showToast(msg, type = 'info') {
    const colors = { success: '#10B981', error: '#EF4444', info: '#2563EB' };
    const icons  = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:80px;right:16px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:${colors[type]||'#2563EB'};box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;font-family:Inter,sans-serif`;
    t.innerHTML = `<i class="fa-solid ${icons[type]||'fa-circle-info'}"></i>${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

const _style = document.createElement('style');
_style.textContent = `
@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
.category-group-header:hover { background: #E2E8F0 !important; }
.category-group-content { margin-left: 4px; border-left: 2px solid #F1F5F9; padding-left: 4px; }
`;
document.head.appendChild(_style);

// Thu gọn / mở rộng các thanh công cụ, thông tin nhãn bên Sidebar
function toggleSectionCollapse(id) {
    const body = document.getElementById('section-body-' + id);
    const icon = document.getElementById('collapse-icon-' + id);
    if (!body || !icon) return;
    
    const isCollapsed = body.style.display === 'none';
    
    if (isCollapsed) {
        body.style.display = '';
        icon.className = 'fa-solid fa-chevron-up';
        
        const container = document.getElementById('section-container-' + id);
        if (container) {
            if (id === 'tools') {
                container.style.flexShrink = '0';
            } else {
                container.style.flex = '1';
                container.style.overflowY = 'auto';
            }
        }
    } else {
        body.style.display = 'none';
        icon.className = 'fa-solid fa-chevron-down';
        
        const container = document.getElementById('section-container-' + id);
        if (container) {
            if (id === 'tools') {
                container.style.flexShrink = '0';
            } else {
                container.style.flex = 'none';
                container.style.overflowY = 'visible';
            }
        }
    }
}

// ==============================================================================
// KHỞI CHẠY TẢI DỮ LIỆU
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => initPanReview());
init();
