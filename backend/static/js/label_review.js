// ============= CONFIG =============
const BASE_URL = 'http://localhost:8000/api';
function getToken() { return localStorage.getItem('access_token'); }

const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}

const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');
const reviewMode = urlParams.get('mode') === 'review'; // true = reviewer đang kiểm duyệt
if (!taskId) window.location.href = 'dashboard.html';

// ============= CLASSES =============
const CLASSES = [
    { id: 'vehicle.car',        name: 'Xe con',       color: '#3B82F6' },
    { id: 'vehicle.truck',      name: 'Xe tải',       color: '#F59E0B' },
    { id: 'vehicle.bus',        name: 'Xe buýt',      color: '#8B5CF6' },
    { id: 'vehicle.motorcycle', name: 'Xe máy',       color: '#EC4899' },
    { id: 'human.pedestrian',   name: 'Người đi bộ',  color: '#10B981' },
    { id: 'vehicle.bicycle',    name: 'Xe đạp',       color: '#F97316' },
];
const CLASS_MAP = {};
CLASSES.forEach(c => CLASS_MAP[c.id] = c);
const CAMERAS = ['CAM_FRONT','CAM_FRONT_LEFT','CAM_FRONT_RIGHT','CAM_BACK','CAM_BACK_LEFT','CAM_BACK_RIGHT'];
const CAM_LABELS = {
    CAM_FRONT:'Cam trước', CAM_FRONT_LEFT:'Cam trái trước', CAM_FRONT_RIGHT:'Cam phải trước',
    CAM_BACK:'Cam sau', CAM_BACK_LEFT:'Cam trái sau', CAM_BACK_RIGHT:'Cam phải sau',
};

// ============= STATE =============
let task = null;
let frames = [];
let currentFrameIdx = 0;
let currentCamera = 'CAM_FRONT';
let annotations = {};
let hiddenIds = new Set();
let selectedAnnId = null;

// Per-frame review state: { [frameId]: { status: 'correct'|'wrong'|null, feedback: '' } }
let frameReviews = {};

function saveReviewsToStorage() {
    localStorage.setItem(`review_${taskId}`, JSON.stringify(frameReviews));
}

function loadReviewsFromStorage() {
    try {
        const saved = localStorage.getItem(`review_${taskId}`);
        if (saved) frameReviews = JSON.parse(saved);
    } catch (e) { frameReviews = {}; }
}

// Canvas
let annCanvas = null, annCtx = null;
let imgDisplayW = 1, imgDisplayH = 1;

// Zoom
let zoomScale = 1;

// Timer
let timerSeconds = 0, timerInterval = null;

// ============= INIT =============
async function init() {
    startTimer();
    await loadTask();
    setupNav();
    document.getElementById('btnDaKiemTra').addEventListener('click', submitReview);
    document.getElementById('frameFeedback').addEventListener('input', saveFeedbackToState);
}

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

function updateTimerDisplay() {
    const h = String(Math.floor(timerSeconds / 3600)).padStart(2,'0');
    const m = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2,'0');
    const s = String(timerSeconds % 60).padStart(2,'0');
    const el = document.querySelector('.timer-pill');
    if (el) el.innerHTML = `<i class="fa-regular fa-clock"></i> ${h}:${m}:${s}`;
}

window.addEventListener('beforeunload', () => {
    clearInterval(timerInterval);
    localStorage.setItem(`review_timer_${taskId}`, timerSeconds);
});

// ============= LOAD =============
async function loadTask() {
    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        task = await res.json();

        // Check permission
        const isReviewer = task.reviewer_id === currentUser.id;
        const isLabeler = task.assigned_to === currentUser.id;
        const isAdmin = currentUser.role === 'admin';

        if (!isReviewer && !isLabeler && !isAdmin) {
            showToast('Bạn không có quyền xem nhiệm vụ này', 'error');
            setTimeout(() => window.location.href = 'dashboard.html', 2000);
            return;
        }

        // Ẩn nút "Đã kiểm tra" nếu không phải reviewer
        if (!isReviewer && !isAdmin) {
            const btn = document.getElementById('btnDaKiemTra');
            if (btn) btn.style.display = 'none';
        }

        const initials = (currentUser.username || 'NL').substring(0, 2).toUpperCase();
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl) avatarEl.textContent = initials;

        await loadFrames(task.scene_id);
    } catch (e) {
        showToast('Không thể tải nhiệm vụ', 'error');
    }
}

async function loadFrames(sceneId) {
    try {
        const res = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        frames = await res.json();
        if (!frames.length) { showToast('Nhiệm vụ không có khung hình', 'error'); return; }

        await loadAllAnnotations();
        const savedFrame = parseInt(localStorage.getItem(`review_frame_${taskId}`) || '0');
        const startFrame = Math.min(Math.max(0, savedFrame), frames.length - 1);
        await goToFrame(startFrame);
    } catch (e) {
        showToast('Không thể tải khung hình', 'error');
    }
}

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
                needs_review: ann.needs_review || false,
                track_id: ann.track_id || null,
                custom_name: ann.custom_name || null,
            });
        });
        // Init frameReviews — load từ localStorage trước, sau đó fill frame mới nếu thiếu
        loadReviewsFromStorage();
        frames.forEach(f => {
            if (!frameReviews[f.id]) frameReviews[f.id] = { status: null, feedback: '' };
        });
    } catch (e) { /* silent */ }
}

// ============= NAVIGATION =============
function setupNav() {
    document.getElementById('btnFirst').addEventListener('click', () => goToFrame(0));
    document.getElementById('btnPrev').addEventListener('click', () => goToFrame(currentFrameIdx - 1));
    document.getElementById('btnNext').addEventListener('click', () => goToFrame(currentFrameIdx + 1));
    document.getElementById('btnLast').addEventListener('click', () => goToFrame(frames.length - 1));
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'd') goToFrame(currentFrameIdx + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'a') goToFrame(currentFrameIdx - 1);
    });
}

async function goToFrame(idx) {
    if (idx < 0 || idx >= frames.length) return;
    // Lưu feedback của frame hiện tại trước khi chuyển
    saveFeedbackToState();
    currentFrameIdx = idx;
    selectedAnnId = null;
    document.getElementById('pageNum').textContent = idx + 1;
    renderCamList(frames[idx]);
    await loadImage(frames[idx], currentCamera);
    updateProgress();
    loadFrameReviewState();
}

async function switchCamera(cam) {
    currentCamera = cam;
    await loadImage(frames[currentFrameIdx], cam);
    renderCamList(frames[currentFrameIdx]);
}

function renderCamList(frame) {
    const list = document.getElementById('camList');
    if (!list) return;
    list.innerHTML = CAMERAS.map(cam => {
        const anns = getFrameAnns(frame.id, cam);
        const active = cam === currentCamera;
        return `
        <div class="cam-row">
            <div class="cam-number">${CAMERAS.indexOf(cam) + 1}</div>
            <div class="cam-item ${active ? 'active' : ''}" onclick="switchCamera('${cam}')">
                <img id="thumb_${cam}" src="" style="width:100%;height:100%;object-fit:cover">
                <div class="cam-label">${CAM_LABELS[cam] || cam}</div>
                ${anns.length ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">${anns.length}</div>` : ''}
            </div>
        </div>`;
    }).join('');
    // Load thumbnails
    CAMERAS.forEach(cam => loadThumb(frame, cam));
}

async function loadThumb(frame, cam) {
    const img = document.getElementById(`thumb_${cam}`);
    if (!img) return;
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
    } catch (e) { /* silent */ }
}

async function loadImage(frame, cam) {
    const mainImg = document.getElementById('mainImage');
    const container = document.querySelector('.canvas-container');
    if (!mainImg || !container) return;
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}`, {
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

function setupCanvas(container, img) {
    // Remove old canvas
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

// ============= ANNOTATIONS =============
function getFrameAnns(fid, cam) { return annotations[fid]?.[cam] || []; }
function currentAnns() {
    const f = frames[currentFrameIdx];
    return f ? getFrameAnns(f.id, currentCamera) : [];
}

function redrawAnnotations() {
    if (!annCtx) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
    currentAnns().forEach(ann => {
        if (hiddenIds.has(ann.id)) return;
        const cls = CLASS_MAP[ann.category];
        const color = cls ? cls.color : '#14B8A6';
        const x = ann.bbox_x * imgDisplayW;
        const y = ann.bbox_y * imgDisplayH;
        const w = ann.bbox_w * imgDisplayW;
        const h = ann.bbox_h * imgDisplayH;
        const sel = ann.id === selectedAnnId;

        annCtx.strokeStyle = color;
        annCtx.lineWidth = sel ? 2.5 : 1.5;
        annCtx.strokeRect(x, y, w, h);
        annCtx.fillStyle = color + (sel ? '30' : '18');
        annCtx.fillRect(x, y, w, h);

        // Label tag
        const baseLbl = cls ? cls.name : ann.category;
        const tNum = ann.track_id ? String(ann.track_id).padStart(2,'0') : '?';
        const label = ann.custom_name ? `${baseLbl} ${tNum} - ${ann.custom_name}` : `${baseLbl} ${tNum}`;
        annCtx.font = 'bold 11px Inter, sans-serif';
        const tw = annCtx.measureText(label).width + 8;
        const tagY = y > 18 ? y - 18 : y + h;
        annCtx.fillStyle = color;
        annCtx.fillRect(x, tagY, tw, 16);
        annCtx.fillStyle = '#fff';
        annCtx.fillText(label, x + 4, tagY + 11);

        // Cờ đỏ nếu needs_review
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
    });
}

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
    list.innerHTML = anns.map(ann => {
        const cls = CLASS_MAP[ann.category];
        const color = cls ? cls.color : '#14B8A6';
        const baseName = cls ? cls.name : ann.category;
        const tNum = ann.track_id ? String(ann.track_id).padStart(2,'0') : '??';
        const label = ann.custom_name ? `${baseName} ${tNum} - ${ann.custom_name}` : `${baseName} ${tNum}`;
        const hidden = hiddenIds.has(ann.id);
        const sel = ann.id === selectedAnnId;
        const flagMark = ann.needs_review
            ? ' <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px"></i>' : '';
        const aiMark = ann.is_ai_generated
            ? ' <span style="font-size:10px;color:#9333EA">AI</span>' : '';
        return `
        <div class="review-label-item ${sel ? 'active' : ''}" onclick="selectAnn('${ann.id}')">
            <div class="label-info">
                <div class="label-dot" style="background:${color};opacity:${hidden ? 0.3 : 1}"></div>
                <div class="label-text">
                    <span class="label-name" style="opacity:${hidden ? 0.4 : 1}">${label}${aiMark}${flagMark}</span>
                </div>
            </div>
            <i class="${hidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}"
               style="color:#94A3B8;cursor:pointer;font-size:13px"
               title="${hidden ? 'Hiện nhãn' : 'Ẩn nhãn'}"
               onclick="toggleHide('${ann.id}');event.stopPropagation()"></i>
        </div>`;
    }).join('');
}

function selectAnn(id) {
    selectedAnnId = selectedAnnId === id ? null : id;
    redrawAnnotations();
    renderLabelList();
    // Scroll to item
    setTimeout(() => {
        const el = document.querySelector('.review-label-item.active');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

function toggleHide(id) {
    if (hiddenIds.has(id)) hiddenIds.delete(id);
    else hiddenIds.add(id);
    redrawAnnotations();
    renderLabelList();
}

// ============= FRAME REVIEW STATE =============
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

function markFrame(status) {
    const frame = frames[currentFrameIdx];
    if (!frame) return;
    if (!frameReviews[frame.id]) frameReviews[frame.id] = { status: null, feedback: '' };

    // Lưu lựa chọn mới nhất (không toggle — nhấn Sai sau Đúng thì vẫn là Sai)
    frameReviews[frame.id].status = status;
    frameReviews[frame.id].feedback = document.getElementById('frameFeedback').value;

    // Lưu ngay vào localStorage
    saveReviewsToStorage();
    localStorage.setItem(`review_frame_${taskId}`, currentFrameIdx);

    // Nếu đến từ FrameList → đánh dấu frame này đã xử lý + lưu trạng thái đúng/sai
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    const frameParam = new URLSearchParams(window.location.search).get('frame');
    if (returnTo === 'FrameList' && frameParam !== null) {
        const frameNum = parseInt(frameParam) + 1;
        localStorage.setItem(`framelist_saved_${taskId}_${frameNum}`, 'true');
        // Lưu trạng thái đúng/sai để FrameList hiển thị badge
        try {
            const reviewKey = `framelist_review_${taskId}`;
            const rs = JSON.parse(localStorage.getItem(reviewKey) || '{}');
            rs[frameNum] = status; // 'correct' hoặc 'wrong'
            const fb = document.getElementById('frameFeedback').value.trim();
            if (fb) rs['fb_' + frameNum] = fb;
            localStorage.setItem(reviewKey, JSON.stringify(rs));
        } catch(e) {}
    }

    updateFrameStatusBadge(status);
    updateActionButtons(status);
    updateProgress();
}

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

function updateActionButtons(status) {
    const btnC = document.getElementById('btnCorrect');
    const btnW = document.getElementById('btnWrong');
    if (btnC) btnC.style.opacity = status === 'correct' ? '1' : (status === 'wrong' ? '0.4' : '1');
    if (btnW) btnW.style.opacity = status === 'wrong' ? '1' : (status === 'correct' ? '0.4' : '1');
    if (btnC) btnC.style.transform = status === 'correct' ? 'scale(1.03)' : '';
    if (btnW) btnW.style.transform = status === 'wrong' ? 'scale(1.03)' : '';
}

function updateProgress() {
    const total = frames.length;
    const done = Object.values(frameReviews).filter(r => r.status !== null).length;
    document.getElementById('progressText').textContent = `${done} / ${total} khung hình`;
    document.getElementById('progressFill').style.width = `${total ? (done / total * 100) : 0}%`;
}

// ============= SUBMIT REVIEW =============
async function submitReview() {
    const total = frames.length;
    const done = Object.values(frameReviews).filter(r => r.status !== null).length;
    if (done < total) {
        showConfirm(`Còn ${total - done} khung hình chưa đánh giá. Vẫn muốn nộp?`, () => _doSubmitReview(), { title: 'Xác nhận nộp', confirmText: 'Nộp', type: 'warning' });
        return;
    }
    _doSubmitReview();
}

async function _doSubmitReview() {
    const wrongFrames = frames.filter(f => frameReviews[f.id]?.status === 'wrong');
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

    try {
        if (wrongFrames.length > 0) {
            const res = await fetch(`${BASE_URL}/tasks/${taskId}/review/reject`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback: allFeedbacks })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Lỗi');
            showToast('Đã gửi phản hồi về cho người gán nhãn', 'success');
            localStorage.removeItem(`review_${taskId}`);
            localStorage.removeItem(`review_frame_${taskId}`);
        } else {
            const res = await fetch(`${BASE_URL}/tasks/${taskId}/review/approve`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewer_time_spent: timerSeconds })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Lỗi');
            showToast('Đã xác nhận — nhiệm vụ chờ admin phê duyệt', 'success');
            localStorage.removeItem(`review_${taskId}`);
            localStorage.removeItem(`review_frame_${taskId}`);
        }
        setTimeout(() => window.location.href = 'dashboard.html', 2000);
    } catch (e) {
        showToast(e.message || 'Lỗi kết nối', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã kiểm tra';
    }
}

// ============= ZOOM =============
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
    if (container) container.style.transform = `scale(${zoomScale})`;
    document.getElementById('zoomLevel').textContent = `${Math.round(zoomScale * 100)}%`;
}

// ============= TOAST =============
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
_style.textContent = `@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}`;
document.head.appendChild(_style);

// ============= START =============
init();
