// ============= CONFIG =============
const BASE_URL = 'http://localhost:8000/api';
function getToken() { return localStorage.getItem('access_token'); }

// Auth guard
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}

// Task ID from URL
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');
if (!taskId) window.location.href = 'dashboard.html';

// ============= CLASSES =============
const CLASSES = [
    { id: 'vehicle.car', name: 'Xe con', icon: 'fa-car', color: '#3B82F6' },
    { id: 'vehicle.truck', name: 'Xe tải', icon: 'fa-truck', color: '#F59E0B' },
    { id: 'vehicle.bus', name: 'Xe buýt', icon: 'fa-bus', color: '#8B5CF6' },
    { id: 'vehicle.motorcycle', name: 'Xe máy', icon: 'fa-motorcycle', color: '#EC4899' },
    { id: 'human.pedestrian', name: 'Người đi bộ', icon: 'fa-person-walking', color: '#10B981' },
    { id: 'vehicle.bicycle', name: 'Xe đạp', icon: 'fa-bicycle', color: '#F97316' },
];
const CLASS_MAP = {};
CLASSES.forEach(c => CLASS_MAP[c.id] = c);

const CAMERAS = ['CAM_FRONT', 'CAM_FRONT_LEFT', 'CAM_FRONT_RIGHT', 'CAM_BACK', 'CAM_BACK_LEFT', 'CAM_BACK_RIGHT'];

const CAM_LABELS = {
    CAM_FRONT: 'Cam trước',
    CAM_FRONT_LEFT: 'Cam trái trước',
    CAM_FRONT_RIGHT: 'Cam phải trước',
    CAM_BACK: 'Cam sau',
    CAM_BACK_LEFT: 'Cam trái sau',
    CAM_BACK_RIGHT: 'Cam phải sau',
};

// ============= STATE =============
let task = null;
let frames = [];
let currentFrameIdx = 0;
let currentCamera = 'CAM_FRONT';
let selectedClass = CLASSES[0].id;
let selectedAnnId = null;
let currentTool = 'pointer'; // mặc định là con trỏ

// annotations[frameId][camera] = [{id, category, bbox_x, bbox_y, bbox_w, bbox_h, confidence, is_ai_generated}]
let annotations = {};

// Set lưu id các nhãn vừa được review trong session (chưa lưu) — vẫn hiển thị ở tab Cần chú ý
const sessionReviewedIds = new Set();

// Drawing state
let isDrawing = false;
let drawStart = null;
let drawRect = null;

// Canvas refs (created dynamically)
let annCanvas = null, drawCanvas = null;
let annCtx = null, drawCtx = null;
let imgDisplayW = 1, imgDisplayH = 1;
let imgNaturalW = 1, imgNaturalH = 1;

// Timer
let timerSeconds = 0;
let timerInterval = null;

// ============= INIT =============
async function init() {
    startTimer();
    await loadTask();
    setupDropdownItems();
}

// ============= TIMER =============
function startTimer() {
    // Khôi phục thời gian đã lưu cho task này
    const saved = parseInt(localStorage.getItem(`timer_${taskId}`) || '0');
    timerSeconds = saved;

    // Hiển thị ngay
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timerSeconds++;
        localStorage.setItem(`timer_${taskId}`, timerSeconds);
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const h = String(Math.floor(timerSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(timerSeconds % 60).padStart(2, '0');
    const el = document.querySelector('.timer-pill');
    if (el) el.innerHTML = `<i class="fa-regular fa-clock"></i> ${h}:${m}:${s}`;
}

// Tạm dừng khi rời trang (về menu, đóng tab, v.v.)
window.addEventListener('beforeunload', () => {
    clearInterval(timerInterval);
    localStorage.setItem(`timer_${taskId}`, timerSeconds);
});

// ============= LOAD TASK =============
async function loadTask() {
    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        task = await res.json();

        // Update user avatar — chỉ set initials nếu chưa có ảnh (avatar-sync.js đã xử lý ảnh)
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl && avatarEl.tagName === 'DIV' && !currentUser.avatar_url) {
            const initials = (currentUser.username || 'NL').substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }

        await loadFrames(task.scene_id);

        // Nếu task đang bị rejected (gán lại) → luôn disable nút Nộp, buộc dùng FrameList
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

        // Cập nhật status sang in_progress nếu đang pending
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

// ============= LOAD FRAMES =============
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
        // Khôi phục frame đã lưu gần nhất
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
                needs_review: ann.needs_review || false,
                hidden: false,
                track_id: ann.track_id || null,
                custom_name: ann.custom_name || null,
            });
            if (ann.track_id && ann.custom_name) {
                setTrackName(ann.category, ann.track_id, ann.custom_name);
            }
        });
    } catch (e) { /* silent */ }
}

// ============= FRAME NAVIGATION =============
async function goToFrame(idx) {
    if (idx < 0 || idx >= frames.length) return;
    const prevIdx = currentFrameIdx;
    currentFrameIdx = idx;
    sessionReviewedIds.clear(); // Reset khi chuyển frame
    updatePageNumber();

    // Copy annotations từ frame liền trước nếu frame mới chưa có
    if (idx > 0 && idx !== prevIdx) {
        const newFrame = frames[idx];
        const prevFrame = frames[idx - 1];
        if (prevFrame && newFrame && prevFrame.id !== newFrame.id) {
            // Tính optical flow để dịch chuyển bbox
            let flowData = null;
            try {
                // Lấy annotations của camera hiện tại từ frame trước (chỉ AI)
                const prevCamAnns = getFrameAnns(prevFrame.id, currentCamera).filter(a => a.is_ai_generated);
                const bboxes = prevCamAnns.map(a => ({
                    bbox_x: a.bbox_x, bbox_y: a.bbox_y,
                    bbox_w: a.bbox_w, bbox_h: a.bbox_h
                }));

                const flowRes = await fetch(`${BASE_URL}/ai/flow`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        frame_id_prev: prevFrame.id,
                        frame_id_next: newFrame.id,
                        camera: currentCamera,
                        bboxes: bboxes.length > 0 ? bboxes : null
                    })
                });
                if (flowRes.ok) flowData = await flowRes.json();
            } catch (e) { /* silent */ }

            CAMERAS.forEach(cam => {
                if (getFrameAnns(newFrame.id, cam).length === 0) {
                    const prevAnns = getFrameAnns(prevFrame.id, cam);
                    if (prevAnns.length > 0) {
                        const shifted = prevAnns
                            .filter(a => a.is_ai_generated) // Chỉ copy nhãn AI, bỏ nhãn thủ công
                            .map((a, i) => {
                                // Dùng per-bbox flow nếu có (chỉ cho camera hiện tại)
                                let dx = 0, dy = 0;
                                if (cam === currentCamera && flowData?.per_bbox?.[i]) {
                                    dx = flowData.per_bbox[i].dx;
                                    dy = flowData.per_bbox[i].dy;
                                } else if (flowData?.dx !== undefined) {
                                    dx = flowData.dx;
                                    dy = flowData.dy;
                                }
                                return {
                                    ...a,
                                    id: genId(),
                                    bbox_x: a.bbox_x + dx,
                                    bbox_y: a.bbox_y + dy,
                                };
                            }).filter(a =>
                                a.bbox_x >= -0.05 && a.bbox_x + a.bbox_w <= 1.05 &&
                                a.bbox_y >= -0.05 && a.bbox_y + a.bbox_h <= 1.05
                            ).map(a => ({
                                ...a,
                                bbox_x: Math.max(0, Math.min(1 - a.bbox_w, a.bbox_x)),
                                bbox_y: Math.max(0, Math.min(1 - a.bbox_h, a.bbox_y)),
                            }));
                        setFrameAnns(newFrame.id, cam, shifted);
                    }
                }
            });
        }
    }

    renderCamList(frames[idx]);
    await loadImage(frames[idx], currentCamera);
}

function updatePageNumber() {
    const el = document.querySelector('.page-number');
    if (el) el.textContent = currentFrameIdx + 1;
}

// Pagination buttons
document.querySelector('.fa-angles-left')?.addEventListener('click', () => goToFrame(0));
document.querySelector('.fa-angle-left')?.addEventListener('click', () => goToFrame(currentFrameIdx - 1));
document.querySelector('.fa-angle-right')?.addEventListener('click', () => goToFrame(currentFrameIdx + 1));
document.querySelector('.fa-angles-right')?.addEventListener('click', () => goToFrame(frames.length - 1));

// Keyboard Navigation & Shortcuts
document.addEventListener('keydown', e => {
    // Không chạy phím tắt khi đang gõ văn bản
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // 1. ZOOM (Ctrl + Up/Down)
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (e.key === 'ArrowUp') zoomIn();
        else zoomOut();
        return;
    }

    // 2. CHUYỂN CAMERA (W/S hoặc Mũi tên Lên/Xuống)
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

    // 3. ĐIỀU HƯỚNG KHUNG HÌNH
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') goToFrame(currentFrameIdx + 1);
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') goToFrame(currentFrameIdx - 1);
    if (e.key === 'Home') goToFrame(0);
    if (e.key === 'End') goToFrame(frames.length - 1);

    // 4. CAMERA (Phím số 1-6)
    if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        switchCamera(CAMERAS[parseInt(e.key) - 1]);
    }

    // 5. CÔNG CỤ
    if (e.key === 'v' || e.key === 'V') setActiveTool('pointer');
    if (e.key === 'b' || e.key === 'B') setActiveTool('box');
    if (e.key === 'h' || e.key === 'H') setActiveTool('pan');
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
    if (e.key === 'Escape') { selectedAnnId = null; redrawAnnotations(); renderLabelList(); }

    // 6. ZOOM (Phím lẻ)
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-' || e.key === '_') zoomOut();
    if (e.key === '0') { zoomLevel = 100; applyZoom(); }
});

// Ctrl + Lăn chuột để Zoom
window.addEventListener('wheel', e => {
    if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
    }
}, { passive: false });

// ============= CAMERA =============
function renderCamList(frame) {
    const list = document.getElementById('camList');
    if (!list) return;
    list.innerHTML = CAMERAS.map((cam, i) => {
        const count = getFrameAnns(frame.id, cam).length;
        return `
        <div class="cam-row">
            <div class="cam-item ${cam === currentCamera ? 'active' : ''}" onclick="switchCamera('${cam}')">
                <img id="thumb_${cam}" src="" alt="${cam}" onerror="this.style.background='#E2E8F0'">
                <div class="cam-label">${CAM_LABELS[cam]}</div>
                ${count > 0 ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px">${count}</div>` : ''}
            </div>
        </div>`;
    }).join('');

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

async function switchCamera(cam) {
    if (cam === currentCamera) return;
    currentCamera = cam;
    renderCamList(frames[currentFrameIdx]);
    await loadImage(frames[currentFrameIdx], cam);
}

// ============= IMAGE LOADING =============
async function loadImage(frame, cam) {
    const container = document.querySelector('.canvas-container');
    let mainImg = document.getElementById('mainImage');
    if (!mainImg) return;

    mainImg.style.opacity = '0';
    mainImg.style.display = 'block';
    selectedAnnId = null;

    // Reset pan khi load ảnh mới
    panOffset = { x: 0, y: 0 };
    if (container) container.style.transform = '';

    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();

        await new Promise((resolve, reject) => {
            mainImg.onload = resolve;
            mainImg.onerror = reject;
            mainImg.src = URL.createObjectURL(blob);
        });

        mainImg.style.opacity = '1';
        // Đợi browser render ảnh xong mới setup canvas
        requestAnimationFrame(() => {
            setupCanvas(container, mainImg);
            redrawAnnotations();
            renderLabelList();
            renderAttentionList();
        });
    } catch (e) {
        mainImg.style.opacity = '1';
        showToast('Không thể tải ảnh', 'error');
    }
}

function setupCanvas(container, img) {
    // Remove old canvases
    container.querySelectorAll('canvas').forEach(c => c.remove());

    imgDisplayW = img.offsetWidth || img.naturalWidth;
    imgDisplayH = img.offsetHeight || img.naturalHeight;
    imgNaturalW = img.naturalWidth || imgDisplayW;
    imgNaturalH = img.naturalHeight || imgDisplayH;

    // Annotation canvas (display only)
    annCanvas = document.createElement('canvas');
    annCanvas.width = imgDisplayW;
    annCanvas.height = imgDisplayH;
    annCanvas.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;`;
    annCtx = annCanvas.getContext('2d');

    // Draw canvas (interaction)
    drawCanvas = document.createElement('canvas');
    drawCanvas.width = imgDisplayW;
    drawCanvas.height = imgDisplayH;
    drawCanvas.style.cssText = `position:absolute;top:0;left:0;cursor:${currentTool === 'box' ? 'crosshair' : 'default'};`;
    drawCtx = drawCanvas.getContext('2d');

    container.appendChild(annCanvas);
    container.appendChild(drawCanvas);

    // Set cursor theo tool hiện tại
    if (currentTool === 'box') drawCanvas.style.cursor = 'crosshair';
    else if (currentTool === 'pan') drawCanvas.style.cursor = 'grab';
    else drawCanvas.style.cursor = 'default';

    // Events
    drawCanvas.addEventListener('mousedown', onMouseDown);
    drawCanvas.addEventListener('mousemove', onMouseMove);
    drawCanvas.addEventListener('mouseup', onMouseUp);
    drawCanvas.addEventListener('mouseleave', onMouseLeave);
}

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

// ============= DRAWING =============
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
    // Gán track_id: dùng _forceTrackId nếu chọn thực thể đã có, ngược lại tạo mới
    const trackId = (window._forceTrackId !== undefined) ? window._forceTrackId : getNextTrackId(selectedClass);
    window._forceTrackId = undefined;

    const ann = {
        id: genId(),
        category: selectedClass,
        track_id: trackId,
        bbox_x: Math.max(0, drawRect.x / imgDisplayW),
        bbox_y: Math.max(0, drawRect.y / imgDisplayH),
        bbox_w: Math.min(1 - drawRect.x / imgDisplayW, drawRect.w / imgDisplayW),
        bbox_h: Math.min(1 - drawRect.y / imgDisplayH, drawRect.h / imgDisplayH),
        confidence: null,
        is_ai_generated: false,
        needs_review: false,
        hidden: false,
    };
    const anns = currentAnns();
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

function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

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

function redrawAnnotations() {
    if (!annCtx) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);

    const reviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');
    const attentionMode = window._currentResultTab === 'attention';

    currentAnns().forEach(ann => {
        if (ann.hidden) return;

        const needsFlag = ann.needs_review === true;

        // Ở tab "Cần chú ý": chỉ vẽ nhãn có cờ đỏ hoặc nhãn vừa review trong session
        if (attentionMode && !needsFlag && !sessionReviewedIds.has(ann.id)) return;

        const cls = CLASS_MAP[ann.category];
        const baseColor = cls ? cls.color : '#14B8A6';
        // Nhãn có cờ đỏ → dùng màu đỏ; ngược lại màu gốc
        const color = needsFlag ? '#EF4444' : baseColor;

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
        const tNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '?';
        const resolvedName = getTrackName(ann.category, ann.track_id) || ann.custom_name || null;
        const canvasLabel = resolvedName ? `${baseLbl} ${tNum} - ${resolvedName}` : `${baseLbl} ${tNum}`;
        annCtx.font = 'bold 11px Inter, sans-serif';
        const tw = annCtx.measureText(canvasLabel).width + 8;
        const tagY = y > 18 ? y - 18 : y + h;
        annCtx.fillStyle = color;
        annCtx.fillRect(x, tagY, tw, 16);
        annCtx.fillStyle = '#fff';
        annCtx.fillText(canvasLabel, x + 4, tagY + 11);

        // Cờ đỏ
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
    });
}

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

function deleteSelected() {
    if (!selectedAnnId) return;
    const ann = currentAnns().find(a => a.id === selectedAnnId);
    const trackId = ann?.track_id;
    const category = ann?.category;
    const frame = frames[currentFrameIdx];

    setFrameAnns(frame.id, currentCamera, currentAnns().filter(a => a.id !== selectedAnnId));
    selectedAnnId = null;

    // Xóa cùng track_id ở tất cả frames SAU frame hiện tại
    if (trackId && category) {
        for (let i = currentFrameIdx + 1; i < frames.length; i++) {
            const futureFrame = frames[i];
            const futureAnns = getFrameAnns(futureFrame.id, currentCamera);
            const filtered = futureAnns.filter(a => !(a.category === category && a.track_id === trackId));
            if (filtered.length !== futureAnns.length) {
                setFrameAnns(futureFrame.id, currentCamera, filtered);
            }
        }
    }

    recalcTrackCounters();
    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
}

// ============= TOOL SETUP =============
function setupDropdownItems() {
    // Dropdown label items → set selectedClass
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', e => {
            e.stopPropagation();
            const label = item.getAttribute('data-label');
            const found = CLASSES.find(c => c.name === label);
            if (found) {
                selectedClass = found.id;
                showToast(`Nhãn: ${found.name}`, 'custom', found.color);
            }
            document.getElementById('box-dropdown')?.classList.remove('show');
            setActiveTool('box');
        });

        // Hover → hiện submenu "Tạo mới" / "Thực thể đã có"
        item.addEventListener('mouseenter', () => {
            document.querySelectorAll('.sub-menu').forEach(s => s.remove());
            const label = item.getAttribute('data-label');
            const found = CLASSES.find(c => c.name === label);
            if (!found) return;

            // Track_id đã có trong toàn task
            const allTracks = new Set();
            Object.values(annotations).forEach(fa => Object.values(fa).forEach(ca => ca.forEach(a => {
                if (a.category === found.id && a.track_id) allTracks.add(a.track_id);
            })));

            // Lọc bỏ track_id đã có trong frame/camera hiện tại
            const usedInFrame = new Set(
                currentAnns().filter(a => a.category === found.id && a.track_id).map(a => a.track_id)
            );
            const availableTracks = [...allTracks].filter(tid => !usedInFrame.has(tid));

            const sub = document.createElement('div');
            sub.className = 'sub-menu';
            sub.style.cssText = `position:absolute;right:100%;top:0;background:#fff;border:1px solid #E2E8F0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.1);min-width:180px;padding:6px;z-index:1001`;

            // Tạo mới
            const newBtn = document.createElement('div');
            newBtn.className = 'dropdown-item';
            newBtn.innerHTML = '<i class="fa-solid fa-plus" style="color:#2563EB"></i> Tạo mới';
            newBtn.addEventListener('click', e => {
                e.stopPropagation();
                selectedClass = found.id;
                document.getElementById('box-dropdown')?.classList.remove('show');
                sub.remove();
                setActiveTool('box');
                showToast(`Nhãn mới: ${found.name}`, 'custom', found.color);
            });
            sub.appendChild(newBtn);

            // Thực thể đã có
            if (availableTracks.length > 0) {
                const divider = document.createElement('div');
                divider.style.cssText = 'height:1px;background:#F1F5F9;margin:4px 0';
                sub.appendChild(divider);
                const header = document.createElement('div');
                header.style.cssText = 'font-size:10px;font-weight:700;color:#94A3B8;padding:4px 14px;text-transform:uppercase;letter-spacing:0.5px';
                header.textContent = 'Thực thể đã có';
                sub.appendChild(header);

                availableTracks.sort((a, b) => a - b).forEach(tid => {
                    const customName = getTrackName(found.id, tid);
                    const displayName = customName
                        ? `${found.name} ${String(tid).padStart(2, '0')} - ${customName}`
                        : `${found.name} ${String(tid).padStart(2, '0')}`;
                    const btn = document.createElement('div');
                    btn.className = 'dropdown-item';
                    btn.innerHTML = `<i class="fa-solid fa-link" style="color:#64748B;font-size:11px"></i> ${displayName}`;
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        selectedClass = found.id;
                        window._forceTrackId = tid;
                        document.getElementById('box-dropdown')?.classList.remove('show');
                        sub.remove();
                        setActiveTool('box');
                        showToast(`Thực thể: ${displayName}`, 'custom', found.color);
                    });
                    sub.appendChild(btn);
                });
            }

            item.style.position = 'relative';
            item.appendChild(sub);
        });

        item.addEventListener('mouseleave', () => {
            setTimeout(() => {
                const sub = item.querySelector('.sub-menu');
                if (sub && !sub.matches(':hover')) sub.remove();
            }, 100);
        });
    });

    // Pointer tool
    document.querySelector('.tool-btn[title="Pointer"]')?.addEventListener('click', () => setActiveTool('pointer'));

    // Clone tool
    document.getElementById('btn-clone')?.addEventListener('click', () => setActiveTool('clone'));

    // Resize tool
    document.getElementById('btn-resize')?.addEventListener('click', () => setActiveTool('resize'));

    // Pan tool
    document.querySelector('.tool-btn[title="Pan"]')?.addEventListener('click', () => setActiveTool('pan'));

    // AI button
    document.querySelector('.btn-ai-auto')?.addEventListener('click', runAI);

    // Save button
    document.querySelector('.btn-submit')?.addEventListener('click', () => saveAnnotations(true));

    // Submit (Nộp) button
    document.querySelector('.btn-phe-duyet')?.addEventListener('click', submitTask);

    // Set tool pointer active by default
    setActiveTool('pointer');
}

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
        // pointer
        document.querySelector('.tool-btn[title="Pointer"]')?.classList.add('active');
        if (drawCanvas) drawCanvas.style.cursor = 'default';
        disablePan();
    }
}

// ============= ANNOTATIONS HELPERS =============
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

// ============= LABEL LIST =============
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

    list.innerHTML = (() => {
        return anns.map((ann) => {
            const cls = CLASS_MAP[ann.category];
            const color = cls ? cls.color : '#14B8A6';
            const baseName = cls ? cls.name : ann.category;
            const trackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';
            const resolvedName = getTrackName(ann.category, ann.track_id) || ann.custom_name || null;
            const label = resolvedName
                ? `${baseName} ${trackNum} - ${resolvedName}`
                : `${baseName} ${trackNum}`;
            const aiMark = ann.is_ai_generated ? ' <span style="font-size:10px;color:#9333EA">AI</span>' : '';
            const reviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');
            const needsFlag = ann.needs_review === true;
            const flagMark = needsFlag ? ' <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px" title="Độ tin cậy thấp, cần kiểm tra"></i>' : '';
            const sel = ann.id === selectedAnnId;
            const hidden = ann.hidden || false;
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
                            <i class="fa-solid fa-arrows-rotate" title="Đổi thực thể"
                               onclick="changeAnnEntity('${ann.id}');event.stopPropagation()"
                               style="color:#7C3AED"></i>
                            <i class="fa-solid fa-tag" title="Đổi loại"
                               onclick="changeAnnCategory('${ann.id}');event.stopPropagation()"
                               style="color:#0891B2"></i>
                            <i class="fa-regular fa-trash-can" title="Xóa" onclick="deleteAnn('${ann.id}');event.stopPropagation()"></i>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    })();

    // Cập nhật attention list đồng thời
    renderAttentionList();
}

function selectAnn(id) {
    selectedAnnId = id;
    redrawAnnotations();
    renderLabelList();
    // Scroll danh sách nhãn tới item được chọn
    setTimeout(() => {
        const el = document.querySelector(`.label-item.active`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

// ============= TRACK MODAL =============
let pendingAnn = null;

function closeTrackModal() {
    document.getElementById('trackModal').style.display = 'none';
    pendingAnn = null;
    if (drawCtx) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

function confirmTrack(trackId) {
    if (!pendingAnn) return;
    // Nếu là đổi thực thể → dùng confirmChangeEntity
    if (pendingAnn._changeId) { confirmChangeEntity(trackId); return; }

    const frame = frames[currentFrameIdx];
    if (trackId === 'new') {
        pendingAnn.track_id = getNextTrackId(pendingAnn.category);
    } else {
        pendingAnn.track_id = trackId;
    }
    const anns = currentAnns();
    anns.push(pendingAnn);
    setFrameAnns(frame.id, currentCamera, anns);
    selectedAnnId = pendingAnn.id;
    pendingAnn = null;
    closeTrackModal();
    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
}

function showTrackModal(ann) {
    if (window._forceTrackId !== undefined) {
        pendingAnn = ann;
        confirmTrack(window._forceTrackId);
        window._forceTrackId = undefined;
        return;
    }
    pendingAnn = ann;
    const cls = CLASS_MAP[ann.category];
    const clsName = cls ? cls.name : ann.category;

    const allTracks = new Set();
    Object.values(annotations).forEach(fa => Object.values(fa).forEach(ca => ca.forEach(a => {
        if (a.category === ann.category && a.track_id) allTracks.add(a.track_id);
    })));
    const usedInCurrentFrame = new Set(
        currentAnns().filter(a => a.category === ann.category && a.track_id).map(a => a.track_id)
    );
    const availableTracks = [...allTracks].filter(tid => !usedInCurrentFrame.has(tid));

    if (availableTracks.length === 0) { confirmTrack('new'); return; }

    document.getElementById('trackModalDesc').textContent = `"${clsName}" này là thực thể nào?`;
    const opts = document.getElementById('trackOptions');
    opts.innerHTML = availableTracks.sort((a, b) => a - b).map(tid => {
        const customName = getTrackName(ann.category, tid);
        const displayName = customName
            ? `${clsName} ${String(tid).padStart(2, '0')} - ${customName}`
            : `${clsName} ${String(tid).padStart(2, '0')}`;
        return `<button onclick="confirmTrack(${tid})"
            style="width:100%;height:36px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:600;color:#1E293B;cursor:pointer;text-align:left;padding:0 14px"
            onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background='#F8FAFC'">
            ${displayName}</button>`;
    }).join('');
    document.getElementById('trackModal').style.display = 'flex';
}

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

    // Tính track_id mới TRƯỚC khi đổi category (để không bị tính nhầm)
    // Tìm max track_id của newCategory, bỏ qua annotation đang đổi
    let maxId = 0;
    Object.values(annotations).forEach(fa => Object.values(fa).forEach(ca => ca.forEach(a => {
        if (a.id !== ann.id && a.category === newCategory && a.track_id && a.track_id > maxId) {
            maxId = a.track_id;
        }
    })));
    const newTrackId = maxId + 1;

    // Đổi category và gán track_id mới
    ann.category = newCategory;
    ann.track_id = newTrackId;

    setFrameAnns(frame.id, currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
    markUnsaved();
    showToast('Đã đổi loại đối tượng', 'success');
}

function changeAnnEntity(id) {
    const anns = currentAnns();
    const ann = anns.find(a => a.id === id);
    if (!ann) return;

    const cls = CLASS_MAP[ann.category];
    const clsName = cls ? cls.name : ann.category;
    const currentTrackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';

    // Lấy tất cả track_id đã có cho class này trong toàn task
    const allTracks = new Set();
    Object.values(annotations).forEach(fa => Object.values(fa).forEach(ca => ca.forEach(a => {
        if (a.category === ann.category && a.track_id && a.track_id !== ann.track_id) {
            allTracks.add(a.track_id);
        }
    })));

    if (allTracks.size === 0) {
        showToast('Không có thực thể nào khác để đổi', 'info');
        return;
    }

    // Dùng trackModal để chọn
    pendingAnn = { ...ann, _changeId: id };
    const clsNameDisp = clsName;
    document.getElementById('trackModalDesc').textContent =
        `Đổi "${clsNameDisp} ${currentTrackNum}" thành thực thể nào?`;

    const opts = document.getElementById('trackOptions');
    opts.innerHTML = [...allTracks].sort((a, b) => a - b).map(tid => {
        const customName = getTrackName(ann.category, tid);
        const displayName = customName
            ? `${clsNameDisp} ${String(tid).padStart(2, '0')} - ${customName}`
            : `${clsNameDisp} ${String(tid).padStart(2, '0')}`;
        return `
        <button onclick="confirmChangeEntity(${tid})"
            style="width:100%;height:36px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:600;color:#1E293B;cursor:pointer;text-align:left;padding:0 14px"
            onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background='#F8FAFC'">
            ${displayName}
        </button>`;
    }).join('');

    // Nút tạo đối tượng mới với id tiếp theo
    const nextId = getNextTrackId(ann.category);
    if (trackCounters[ann.category]) trackCounters[ann.category]--; // rollback
    opts.innerHTML += `
        <button onclick="confirmChangeEntity('new')"
            style="width:100%;height:36px;background:#EEF2FF;border:1px solid #BFDBFE;border-radius:8px;font-size:13px;font-weight:700;color:#2563EB;cursor:pointer;text-align:left;padding:0 14px"
            onmouseover="this.style.background='#DBEAFE'" onmouseout="this.style.background='#EEF2FF'">
            + ${clsNameDisp} ${String(nextId).padStart(2, '0')} (đối tượng mới)
        </button>`;

    document.getElementById('trackModal').style.display = 'flex';
}

function confirmChangeEntity(newTrackId) {
    if (!pendingAnn || !pendingAnn._changeId) return;
    const frame = frames[currentFrameIdx];
    const anns = currentAnns();
    const ann = anns.find(a => a.id === pendingAnn._changeId);
    if (ann) {
        // 'new' → tạo track_id mới
        ann.track_id = (newTrackId === 'new') ? getNextTrackId(ann.category) : newTrackId;
        setFrameAnns(frame.id, currentCamera, anns);
        redrawAnnotations();
        renderLabelList();
        markUnsaved();
        showToast('Đã đổi thực thể', 'success');
    }
    pendingAnn = null;
    closeTrackModal();
}

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
    const ann = currentAnns().find(a => a.id === id);
    const trackId = ann?.track_id;
    const category = ann?.category;

    setFrameAnns(frame.id, currentCamera, currentAnns().filter(a => a.id !== id));
    if (selectedAnnId === id) selectedAnnId = null;

    // Xóa cùng track_id ở tất cả frames SAU frame hiện tại (cùng camera)
    if (trackId && category) {
        for (let i = currentFrameIdx + 1; i < frames.length; i++) {
            const futureFrame = frames[i];
            const futureAnns = getFrameAnns(futureFrame.id, currentCamera);
            const filtered = futureAnns.filter(a => !(a.category === category && a.track_id === trackId));
            if (filtered.length !== futureAnns.length) {
                setFrameAnns(futureFrame.id, currentCamera, filtered);
            }
        }
    }

    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
}

function updateCamBadge() {
    renderCamList(frames[currentFrameIdx]);
}

// ============= SAVE =============
let unsaved = false;

function markUnsaved() {
    unsaved = true;
    // Không auto-save — chỉ lưu khi nhấn nút Lưu
}

async function saveCurrentFrame(showMsg) {
    const frame = frames[currentFrameIdx];
    if (!frame) return;
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
        if (showMsg) showToast('Đã lưu', 'success');
    } catch (e) {
        if (showMsg) showToast('Lỗi lưu', 'error');
    }
}

async function saveAnnotations(showMsg = true) {
    const frameIds = Object.keys(annotations);
    for (const fid of frameIds) {
        const frame = frames.find(f => f.id === parseInt(fid));
        if (!frame) continue;
        const allAnns = [];
        CAMERAS.forEach(cam => {
            getFrameAnns(frame.id, cam).forEach(ann => {
                // needs_review đã được cập nhật trực tiếp khi kéo/resize/markReviewed
                allAnns.push({
                    camera: cam,
                    category: ann.category,
                    bbox_x: ann.bbox_x, bbox_y: ann.bbox_y,
                    bbox_w: ann.bbox_w, bbox_h: ann.bbox_h,
                    confidence: ann.confidence,
                    is_ai_generated: ann.is_ai_generated || false,
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
    // Nếu đến từ FrameList → đánh dấu frame này đã lưu
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    const frameParam = new URLSearchParams(window.location.search).get('frame');
    if (returnTo === 'FrameList' && frameParam !== null) {
        const frameNum = parseInt(frameParam) + 1;
        localStorage.setItem(`framelist_saved_${taskId}_${frameNum}`, 'true');
    }
    if (showMsg) showToast('Đã lưu tất cả nhãn', 'success');
}

// ============= SUBMIT =============
async function submitTask() {
    // Nếu task đang ở chế độ gán lại (rejected), không cho nộp tổng thể — phải dùng FrameList
    if (task && task.status === 'rejected') {
        showToast('Vui lòng sửa từng khung hình qua danh sách khung hình rồi nộp lại', 'info');
        return;
    }

    // Kiểm tra có nhãn nào được gán chưa (Frontend check)
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

// ============= AI =============
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

        // Xóa các nhãn AI cũ của frame/camera hiện tại trước khi thêm mới
        const existingManualAnns = currentAnns().filter(a => !a.is_ai_generated);
        const existingAiAnns = currentAnns().filter(a => a.is_ai_generated);

        // Tính max track_id hiện có trong toàn task
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

        // Hàm tính IoU giữa 2 bbox
        function bboxIoU(a, b) {
            const ax2 = a.bbox_x + a.bbox_w, ay2 = a.bbox_y + a.bbox_h;
            const bx2 = b.bbox_x + b.bbox_w, by2 = b.bbox_y + b.bbox_h;
            const ix1 = Math.max(a.bbox_x, b.bbox_x), iy1 = Math.max(a.bbox_y, b.bbox_y);
            const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
            if (ix2 <= ix1 || iy2 <= iy1) return 0;
            const inter = (ix2 - ix1) * (iy2 - iy1);
            const union = a.bbox_w * a.bbox_h + b.bbox_w * b.bbox_h - inter;
            return union > 0 ? inter / union : 0;
        }

        const usedOldIds = new Set();
        preds.forEach(p => {
            // Tìm nhãn AI cũ cùng category có IoU cao nhất
            let bestMatch = null, bestIou = 0.3; // threshold
            existingAiAnns.forEach(old => {
                if (old.category === p.category && !usedOldIds.has(old.id)) {
                    const iouVal = bboxIoU(p, old);
                    if (iouVal > bestIou) { bestIou = iouVal; bestMatch = old; }
                }
            });

            let trackId;
            if (bestMatch) {
                // Cùng đối tượng → giữ track_id cũ
                trackId = bestMatch.track_id;
                usedOldIds.add(bestMatch.id);
            } else {
                // Đối tượng mới → tạo track_id mới
                classMaxId[p.category] = (classMaxId[p.category] || 0) + 1;
                trackId = classMaxId[p.category];
            }

            newAnns.push({
                id: genId(),
                category: p.category,
                track_id: trackId,
                bbox_x: p.bbox_x, bbox_y: p.bbox_y,
                bbox_w: p.bbox_w, bbox_h: p.bbox_h,
                confidence: p.confidence,
                is_ai_generated: true,
                needs_review: p.confidence < reviewThreshold,
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

// ============= ZOOM =============
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

// Ctrl+scroll to zoom
document.querySelector('.center-canvas')?.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
}, { passive: false });

// ============= PAN (kéo ảnh) =============
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

// ============= CLONE =============
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

    const offset = 0.02; // lệch 2% để thấy rõ
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

// ============= RESIZE =============
// Resize handles: 8 điểm (4 góc + 4 cạnh)
let resizeHandle = null; // 'tl','tc','tr','ml','mr','bl','bc','br'
let resizeAnn = null;
let resizeStart = null;
const HANDLE_SIZE = 8;

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

function hitHandle(px, py, ann) {
    const handles = getHandles(ann);
    for (const [key, pt] of Object.entries(handles)) {
        if (Math.abs(px - pt.x) <= HANDLE_SIZE && Math.abs(py - pt.y) <= HANDLE_SIZE) return key;
    }
    return null;
}

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

// Vẽ handles khi redraw nếu đang ở resize mode — gọi sau redrawAnnotations()
function redrawWithHandles() {
    redrawAnnotations();
    if (currentTool === 'resize' && selectedAnnId) {
        const ann = currentAnns().find(a => a.id === selectedAnnId);
        if (ann) drawHandles(ann);
    }
}

// ============= TRACK NAMES MAP =============
const trackNames = {};

function getTrackName(category, trackId) {
    return trackNames[`${category}_${trackId}`] || null;
}

function setTrackName(category, trackId, name) {
    if (name) trackNames[`${category}_${trackId}`] = name;
    else delete trackNames[`${category}_${trackId}`];
}

// Track ID counter per class
const trackCounters = {};

function getNextTrackId(category) {
    // Tìm max track_id hiện có trong toàn task cho class này
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

// ============= RENAME ANNOTATION =============
function renameAnn(id) {
    const anns = currentAnns();
    const ann = anns.find(a => a.id === id);
    if (!ann) return;
    const cls = CLASS_MAP[ann.category];
    const baseName = cls ? cls.name : ann.category;
    const trackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';
    const current = getTrackName(ann.category, ann.track_id) || ann.custom_name || '';
    const newName = prompt(`Đổi tên cho "${baseName} ${trackNum}":\n(Để trống để dùng tên mặc định)`, current);
    if (newName === null) return;
    const trimmed = newName.trim() || null;
    ann.custom_name = trimmed;
    setTrackName(ann.category, ann.track_id, trimmed);
    const frame = frames[currentFrameIdx];
    setFrameAnns(frame.id, currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
    markUnsaved();
}

// ============= ATTENTION LIST =============
function renderAttentionList() {
    const list = document.getElementById('attentionList');
    const countEl = document.getElementById('attentionCount');
    if (!list) return;

    const flagged = currentAnns().filter(ann => ann.needs_review === true);

    // Cập nhật badge số lượng
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
        const baseName = cls ? cls.name : ann.category;
        const trackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';
        const resolvedName = getTrackName(ann.category, ann.track_id) || ann.custom_name || null;
        const label = resolvedName ? `${baseName} ${trackNum} - ${resolvedName}` : `${baseName} ${trackNum}`;
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

// ============= TASK INFO MODAL =============
function openTaskInfo() {
    const modal = document.getElementById('modalTaskInfo');
    if (!modal || !task) return;
    document.getElementById('infoProjectName').textContent = task.project_name || '—';
    document.getElementById('infoTaskName').textContent = task.scene_name || `Nhiệm vụ #${task.id}`;
    document.getElementById('infoLabeler').textContent = task.assigned_user
        ? (task.assigned_user.username + (task.assigned_user.full_name ? ' — ' + task.assigned_user.full_name : ''))
        : '—';
    document.getElementById('infoReviewer').textContent = task.reviewer_user
        ? (task.reviewer_user.username + (task.reviewer_user.full_name ? ' — ' + task.reviewer_user.full_name : ''))
        : 'Chưa phân công';
    modal.style.display = 'flex';
}

// ============= IMAGE FILTER =============
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

// ============= TOAST =============
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

// CSS animation for toast
const style = document.createElement('style');
style.textContent = `@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}`;
document.head.appendChild(style);

// ============= START =============
// Đóng modal khi click ra ngoài (backdrop)
['modalTaskInfo', 'modalShortcuts', 'modalSettings'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function (e) {
        if (e.target === this) this.style.display = 'none';
    });
});

init();
