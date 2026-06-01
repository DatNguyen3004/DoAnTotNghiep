const BASE_URL = '/api';
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');

if (!taskId) {
    window.location.href = 'dashboard.html';
}

// Categories map
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

const CAMERAS = ['CAM_FRONT', 'CAM_FRONT_LEFT', 'CAM_FRONT_RIGHT', 'CAM_BACK', 'CAM_BACK_LEFT', 'CAM_BACK_RIGHT'];
const CAM_LABELS = {
    CAM_FRONT: 'Cam trước',
    CAM_FRONT_LEFT: 'Cam trái trước',
    CAM_FRONT_RIGHT: 'Cam phải trước',
    CAM_BACK: 'Cam sau',
    CAM_BACK_LEFT: 'Cam trái sau',
    CAM_BACK_RIGHT: 'Cam phải sau',
};

// State variables
let evaluationData = null;
let selectedFrameIdx = 0;
let selectedCamera = 'CAM_FRONT';
let zoomScale = 1.0;
let panOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

let annCanvas = null;
let annCtx = null;
let imgDisplayW = 1;
let imgDisplayH = 1;

let showAILabels = true;
let showUserLabels = true;

function toggleAI() {
    if (showAILabels && !showUserLabels) {
        showAILabels = true;
        showUserLabels = true;
    } else {
        showAILabels = true;
        showUserLabels = false;
    }
    updateLabelTogglesUI();
    redrawAnnotations();
}

function toggleUser() {
    if (showUserLabels && !showAILabels) {
        showAILabels = true;
        showUserLabels = true;
    } else {
        showAILabels = false;
        showUserLabels = true;
    }
    updateLabelTogglesUI();
    redrawAnnotations();
}

function updateLabelTogglesUI() {
    const btnAI = document.getElementById('btnToggleAI');
    const btnUser = document.getElementById('btnToggleUser');
    if (btnAI) {
        if (showAILabels) {
            btnAI.style.background = '#EEF2FF';
            btnAI.style.color = '#4F46E5';
            btnAI.style.border = '1px solid #E0E7FF';
        } else {
            btnAI.style.background = '#F1F5F9';
            btnAI.style.color = '#94A3B8';
            btnAI.style.border = '1px solid #E2E8F0';
        }
    }
    if (btnUser) {
        if (showUserLabels) {
            btnUser.style.background = '#ECFDF5';
            btnUser.style.color = '#059669';
            btnUser.style.border = '1px solid #D1FAE5';
        } else {
            btnUser.style.background = '#F1F5F9';
            btnUser.style.color = '#94A3B8';
            btnUser.style.border = '1px solid #E2E8F0';
        }
    }
}

function getToken() {
    return localStorage.getItem('access_token');
}

// Initialize Page
async function initPage() {
    updateLabelTogglesUI();
    try {
        // Fetch evaluation details
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/evaluation-details`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) {
            if (res.status === 403) {
                alert('Bạn không có quyền truy cập trang này.');
                window.location.href = '/static/login.html';
                return;
            }
            throw new Error('Không thể tải thông tin đối chiếu');
        }
        evaluationData = await res.json();


        // Setup user avatar placeholder
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            avatar.textContent = 'AD';
        }

        // Go to first frame
        if (evaluationData.frames.length > 0) {
            await selectFrame(0);
        }

    } catch (err) {
        console.error(err);
        alert(err.message || 'Có lỗi xảy ra khi tải trang.');
    }
}

// Frame Navigation Actions
function firstFrame() {
    if (selectedFrameIdx > 0) {
        selectFrame(0);
    }
}

// Open Statistics and Evaluation dialog
document.getElementById('btnNop')?.addEventListener('click', () => {
    // Open the statistics popup or call the statistics handler
    if (typeof openEvaluationStats === 'function') {
        openEvaluationStats();
    } else {
        // Standard action if not defined: open modal or alert
        alert('Chức năng thống kê đang được tải.');
    }
});

function lastFrame() {
    if (selectedFrameIdx < evaluationData.frames.length - 1) {
        selectFrame(evaluationData.frames.length - 1);
    }
}

function prevFrame() {
    if (selectedFrameIdx > 0) {
        selectFrame(selectedFrameIdx - 1);
    }
}

function nextFrame() {
    if (selectedFrameIdx < evaluationData.frames.length - 1) {
        selectFrame(selectedFrameIdx + 1);
    }
}

// Select active frame
async function selectFrame(idx) {
    selectedFrameIdx = idx;
    const frame = evaluationData.frames[idx];

    // Update toolbar indicator
    document.getElementById('frameIndicator').textContent = `${idx + 1}`;

    // Keep selectedCamera if available, else pick first camera
    if (frame.cameras.length > 0) {
        if (!frame.cameras.includes(selectedCamera)) {
            selectedCamera = frame.cameras[0];
        }
        // Render camera list panel on the left
        renderCamList();
        // Refresh image and annotations
        await loadComparisonImages();
    } else {
        alert('Không có dữ liệu camera cho khung hình này');
    }
}

// Render vertical camera thumbnails list on the left side
function renderCamList() {
    const list = document.getElementById('camList');
    const frame = evaluationData.frames[selectedFrameIdx];

    list.innerHTML = CAMERAS.map(cam => {
        const hasData = frame.cameras.includes(cam);
        const active = cam === selectedCamera;

        return `
        <div class="cam-row">
            <div class="cam-item ${active ? 'active' : ''}" ${hasData ? `onclick="selectCamera('${cam}')"` : ''}>
                <img id="thumb_${cam}" src="" class="hidden">
                <div id="nodata_${cam}" class="cam-nodata" style="display:${hasData ? 'none' : 'flex'}">
                    <i class="fa-solid fa-camera-slash"></i>
                    <span>Không có</span>
                </div>
                <div class="cam-label">${CAM_LABELS[cam] || cam}</div>
            </div>
        </div>`;
    }).join('');

    // Load thumbnails for active cams
    CAMERAS.forEach(cam => {
        if (frame.cameras.includes(cam)) {
            loadThumb(frame, cam);
        }
    });
}

async function loadThumb(frame, cam) {
    const img = document.getElementById(`thumb_${cam}`);
    if (!img) return;
    const nodata = document.getElementById(`nodata_${cam}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) {
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

// Select camera
async function selectCamera(cam) {
    selectedCamera = cam;
    renderCamList();
    await loadComparisonImages();
}

// Load images for current frame and camera
async function loadComparisonImages() {
    const frame = evaluationData.frames[selectedFrameIdx];
    const mainImg = document.getElementById('mainImage');

    // Reset zoom offset and filter on camera change
    resetZoom();

    mainImg.src = '';
    mainImg.style.display = 'none';

    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${selectedCamera}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error('Không tải được ảnh');

        const blob = await res.blob();
        mainImg.src = URL.createObjectURL(blob);
        mainImg.style.display = 'block';

        mainImg.onload = () => {
            const container = document.querySelector('.canvas-container');
            setupCanvas(container, mainImg);
            redrawAnnotations();
        };
    } catch (err) {
        console.error(err);
    }
}

function setupCanvas(container, img) {
    // Remove old canvas
    container.querySelectorAll('canvas').forEach(c => c.remove());

    imgDisplayW = img.clientWidth;
    imgDisplayH = img.clientHeight;

    annCanvas = document.createElement('canvas');
    annCanvas.width = imgDisplayW;
    annCanvas.height = imgDisplayH;
    annCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    container.appendChild(annCanvas);
    annCtx = annCanvas.getContext('2d');
}

// Canvas Redrawing logic
let selectedAnnId = null;
let currentTool = 'pointer';

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

function selectAt(clientX, clientY) {
    const img = document.getElementById('mainImage');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Convert screen coordinates to canvas space coordinates
    const px = ((clientX - rect.left) / rect.width) * imgDisplayW;
    const py = ((clientY - rect.top) / rect.height) * imgDisplayH;

    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera] || { ai_boxes: [], user_boxes: [], matched: [], missing: [], extra: [] };

    // Check User/Final boxes first if they are shown
    if (showUserLabels) {
        // Check extra boxes
        for (let i = comp.extra.length - 1; i >= 0; i--) {
            const ex = comp.extra[i];
            const x = ex.bbox_x * imgDisplayW;
            const y = ex.bbox_y * imgDisplayH;
            const w = ex.bbox_w * imgDisplayW;
            const h = ex.bbox_h * imgDisplayH;
            if (px >= x && px <= x + w && py >= y && py <= y + h) {
                selectedAnnId = ex.id;
                redrawAnnotations();
                return;
            }
        }
        // Check matched boxes
        for (let i = comp.matched.length - 1; i >= 0; i--) {
            const m = comp.matched[i];
            const u = m.user_box;
            const x = u.bbox_x * imgDisplayW;
            const y = u.bbox_y * imgDisplayH;
            const w = u.bbox_w * imgDisplayW;
            const h = u.bbox_h * imgDisplayH;
            if (px >= x && px <= x + w && py >= y && py <= y + h) {
                selectedAnnId = u.id;
                redrawAnnotations();
                return;
            }
        }
    }

    // Check AI boxes if they are shown
    if (showAILabels) {
        for (let i = comp.ai_boxes.length - 1; i >= 0; i--) {
            const box = comp.ai_boxes[i];
            const x = box.bbox_x * imgDisplayW;
            const y = box.bbox_y * imgDisplayH;
            const w = box.bbox_w * imgDisplayW;
            const h = box.bbox_h * imgDisplayH;
            if (px >= x && px <= x + w && py >= y && py <= y + h) {
                selectedAnnId = box.id;
                redrawAnnotations();
                return;
            }
        }
    }

    // Deselect if clicked outside all boxes
    selectedAnnId = null;
    redrawAnnotations();
}

function redrawAnnotations() {
    if (!annCtx || !evaluationData) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);

    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera] || { ai_boxes: [], user_boxes: [], matched: [], missing: [], extra: [] };

    const width = imgDisplayW;
    const height = imgDisplayH;

    const hasSelection = selectedAnnId !== null;

    // 1. Draw AI Original Boxes (dashed lines, styled in respective category colors)
    if (showAILabels) {
        comp.ai_boxes.forEach(box => {
            const x = box.bbox_x * width;
            const y = box.bbox_y * height;
            const w = box.bbox_w * width;
            const h = box.bbox_h * height;

            const cls = CLASS_MAP[box.category];
            const color = cls ? cls.color : 'rgba(147, 51, 234, 0.85)';

            const sel = box.id === selectedAnnId;
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;

            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.setLineDash([2, 2]); // AI is always dashed in Overlay
            annCtx.strokeRect(x, y, w, h);
            annCtx.setLineDash([]);
        });
    }

    // 2. Draw User/Final Boxes with Edit Statuses (styled in respective category colors)
    if (showUserLabels) {
        // A. Draw Matched Boxes
        comp.matched.forEach(m => {
            const u = m.user_box;
            const x = u.bbox_x * width;
            const y = u.bbox_y * height;
            const w = u.bbox_w * width;
            const h = u.bbox_h * height;

            const cls = CLASS_MAP[u.category];
            const color = cls ? cls.color : '#10B981';

            const sel = u.id === selectedAnnId;
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;

            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.strokeRect(x, y, w, h);
            annCtx.fillStyle = color;
            annCtx.globalAlpha = hasSelection ? (sel ? 0.25 : 0.05) : 0.12;
            annCtx.fillRect(x, y, w, h);
        });

        // B. Draw Extra Boxes (User added)
        comp.extra.forEach(ex => {
            const x = ex.bbox_x * width;
            const y = ex.bbox_y * height;
            const w = ex.bbox_w * width;
            const h = ex.bbox_h * height;

            const cls = CLASS_MAP[ex.category];
            const color = cls ? cls.color : '#3B82F6';

            const sel = ex.id === selectedAnnId;
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;

            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.strokeRect(x, y, w, h);
            annCtx.fillStyle = color;
            annCtx.globalAlpha = hasSelection ? (sel ? 0.25 : 0.05) : 0.12;
            annCtx.fillRect(x, y, w, h);
        });
    }

    annCtx.globalAlpha = 1.0;
}

// Zoom & Pan controls (same as label_review.js)
function zoomIn() {
    zoomScale = Math.min(zoomScale + 0.25, 4);
    applyZoom();
}

function zoomOut() {
    zoomScale = Math.max(zoomScale - 0.25, 0.5);
    applyZoom();
}

function resetZoom() {
    zoomScale = 1.0;
    panOffset = { x: 0, y: 0 };
    applyZoom();
}

function applyZoom() {
    const container = document.querySelector('.canvas-container');
    if (container) {
        container.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`;
    }
    document.getElementById('zoomLevel').textContent = `${Math.round(zoomScale * 100)}%`;
}

// Panning setup
function initPanReview() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', _panStart, { passive: false });
    canvas.addEventListener('mousemove', _panMove, { passive: false });
    canvas.addEventListener('mouseup', _panEnd);
    canvas.addEventListener('mouseleave', _panEnd);
    canvas.style.cursor = currentTool === 'pan' ? 'grab' : 'default';

    // Zoom on Ctrl + wheel scroll
    canvas.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }
    }, { passive: false });
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
    applyZoom();
}

function _panEnd(e) {
    if (currentTool !== 'pan') return;
    isPanning = false;
    e.currentTarget.style.cursor = 'grab';
    e.currentTarget.style.userSelect = '';
}

// Modals opening and image settings logic
function openTaskInfo() {
    const modal = document.getElementById('modalTaskInfo');
    if (!modal || !evaluationData) return;
    document.getElementById('infoProjectName').textContent = evaluationData.scene_name || '—';
    document.getElementById('infoTaskName').textContent = `Nhiệm vụ #${evaluationData.task_id}`;
    document.getElementById('infoLabeler').textContent = evaluationData.labeler
        ? (evaluationData.labeler.username + (evaluationData.labeler.full_name ? ' — ' + evaluationData.labeler.full_name : ''))
        : '—';
    document.getElementById('infoReviewer').textContent = evaluationData.reviewer
        ? (evaluationData.reviewer.username + (evaluationData.reviewer.full_name ? ' — ' + evaluationData.reviewer.full_name : ''))
        : 'Chưa phân công';
    modal.style.display = 'flex';
}

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

// Keyboard shortcuts listener
window.addEventListener('keydown', (e) => {
    // Ignore keypresses inside input fields or textareas
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();

    // Navigation
    if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        nextFrame();
    } else if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        prevFrame();
    } else if (key === 'home') {
        e.preventDefault();
        firstFrame();
    } else if (key === 'end') {
        e.preventDefault();
        lastFrame();
    }

    // Camera mapping
    const camShortcuts = {
        '1': 'CAM_FRONT',
        '2': 'CAM_FRONT_LEFT',
        '3': 'CAM_FRONT_RIGHT',
        '4': 'CAM_BACK',
        '5': 'CAM_BACK_LEFT',
        '6': 'CAM_BACK_RIGHT'
    };
    if (camShortcuts[key]) {
        e.preventDefault();
        const targetCam = camShortcuts[key];
        const frame = evaluationData?.frames[selectedFrameIdx];
        if (frame && frame.cameras.includes(targetCam)) {
            selectCamera(targetCam);
        }
    }

    // Camera switching with ArrowUp/ArrowDown or W/S
    if ((key === 'arrowup' && !e.ctrlKey) || key === 'w') {
        e.preventDefault();
        const curIdx = CAMERAS.indexOf(selectedCamera);
        if (curIdx > -1) {
            const frame = evaluationData?.frames[selectedFrameIdx];
            if (frame) {
                for (let i = 1; i <= CAMERAS.length; i++) {
                    const prevCam = CAMERAS[(curIdx - i + CAMERAS.length) % CAMERAS.length];
                    if (frame.cameras.includes(prevCam)) {
                        selectCamera(prevCam);
                        break;
                    }
                }
            }
        }
    } else if ((key === 'arrowdown' && !e.ctrlKey) || key === 's') {
        e.preventDefault();
        const curIdx = CAMERAS.indexOf(selectedCamera);
        if (curIdx > -1) {
            const frame = evaluationData?.frames[selectedFrameIdx];
            if (frame) {
                for (let i = 1; i <= CAMERAS.length; i++) {
                    const nextCam = CAMERAS[(curIdx + i) % CAMERAS.length];
                    if (frame.cameras.includes(nextCam)) {
                        selectCamera(nextCam);
                        break;
                    }
                }
            }
        }
    }

    // Zoom mapping
    if (key === '+' || key === '=' || (e.ctrlKey && key === 'arrowup')) {
        e.preventDefault();
        zoomIn();
    } else if (key === '-' || (e.ctrlKey && key === 'arrowdown')) {
        e.preventDefault();
        zoomOut();
    } else if (key === '0') {
        e.preventDefault();
        resetZoom();
    }

    // Esc to close modals
    if (key === 'escape') {
        document.getElementById('modalTaskInfo').style.display = 'none';
        document.getElementById('modalShortcuts').style.display = 'none';
        document.getElementById('modalSettings').style.display = 'none';
        document.getElementById('modalEvaluationChat').style.display = 'none';
        document.getElementById('modalEvaluationHistory').style.display = 'none';
    }
});

// ============= CHAT & HISTORY FUNCTIONS =============
function getToken() { return localStorage.getItem('access_token'); }

async function openEvaluationChat() {
    const modal = document.getElementById('modalEvaluationChat');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadEvaluationChats();
}

async function loadEvaluationChats() {
    const container = document.getElementById('evaluationChatList');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>`;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/peer-chats`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) throw new Error();
        const chats = await res.json();

        if (!chats.length) {
            container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">
                Chưa có trao đổi nào giữa gán nhãn và kiểm duyệt.
            </div>`;
            return;
        }

        container.innerHTML = chats.map(c => {
            const date = new Date(c.created_at);
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const timeStr = `${hh}:${mm} ${d}-${m}`;
            
            const isLabeler = evaluationData && evaluationData.labeler && c.sender_id === evaluationData.labeler.id;
            const senderName = c.sender_full_name || c.sender_username;
            
            if (isLabeler) {
                return `
                <div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:12px;font-family:Inter,sans-serif">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                        <span style="font-size:11px;font-weight:600;color:#64748B">${senderName}</span>
                        <span style="font-size:9px;font-weight:700;background:#EFF6FF;color:#2563EB;padding:1px 4px;border-radius:4px;text-transform:uppercase">USER</span>
                    </div>
                    <div style="background:#4F46E5;color:#fff;padding:8px 12px;border-radius:14px 14px 2px 14px;max-width:80%;font-size:13px;word-break:break-word">
                        ${c.message}
                    </div>
                    <span style="font-size:10px;color:#94A3B8;margin-top:2px">${timeStr}</span>
                </div>`;
            } else {
                return `
                <div style="display:flex;flex-direction:column;align-items:flex-start;margin-bottom:12px;font-family:Inter,sans-serif">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                        <span style="font-size:11px;font-weight:600;color:#64748B">${senderName}</span>
                        <span style="font-size:9px;font-weight:700;background:#F1F5F9;color:#475569;padding:1px 4px;border-radius:4px;text-transform:uppercase">USER</span>
                    </div>
                    <div style="background:#EBF0F6;color:#1E293B;padding:8px 12px;border-radius:14px 14px 14px 2px;max-width:80%;font-size:13px;word-break:break-word">
                        ${c.message}
                    </div>
                    <span style="font-size:10px;color:#94A3B8;margin-top:2px">${timeStr}</span>
                </div>`;
            }
        }).join('');

        container.scrollTop = container.scrollHeight;

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#EF4444;font-size:13px">Không thể tải nội dung trao đổi</div>`;
    }
}

async function deleteEvaluationChat() {
    if (!confirm('Bạn có chắc chắn muốn xóa (ẩn) cuộc trò chuyện này ở phía Admin? Người dùng vẫn sẽ nhìn thấy cuộc trò chuyện này bình thường.')) {
        return;
    }

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/peer-chats`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (res.ok) {
            await loadEvaluationChats();
        } else {
            alert('Không thể xóa cuộc trò chuyện');
        }
    } catch (e) {
        alert('Lỗi kết nối');
    }
}

async function openEvaluationHistory() {
    const modal = document.getElementById('modalEvaluationHistory');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadEvaluationHistory();
}

async function loadEvaluationHistory() {
    const container = document.getElementById('evaluationHistoryList');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>`;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/history`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) throw new Error();
        const history = await res.json();

        if (!history.length) {
            container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">
                Chưa có lịch sử nộp bài.
            </div>`;
            return;
        }

        const ACTION_CONFIG = {
            submitted: { icon: 'fa-paper-plane', color: '#2563EB', bg: '#EFF6FF', label: 'Nộp bài' },
            rejected: { icon: 'fa-circle-xmark', color: '#EF4444', bg: '#FEF2F2', label: 'Từ chối' },
            approved: { icon: 'fa-circle-check', color: '#10B981', bg: '#F0FDF4', label: 'Kiểm tra xong' },
            admin_approved: { icon: 'fa-check-double', color: '#7C3AED', bg: '#F5F3FF', label: 'Admin phê duyệt' },
            admin_rejected: { icon: 'fa-triangle-exclamation', color: '#DC2626', bg: '#FEF2F2', label: 'Admin từ chối' },
        };

        container.innerHTML = history.map((h, idx) => {
            const cfg = ACTION_CONFIG[h.action] || { icon: 'fa-circle', color: '#64748B', bg: '#F8FAFC', label: h.action };
            const actor = h.actor_full_name ? `${h.actor_full_name} (@${h.actor_username})` : (h.actor_username ? `@${h.actor_username}` : '—');
            
            let timeStr = '—';
            if (h.created_at) {
                const date = new Date(h.created_at);
                const hh = String(date.getHours()).padStart(2, '0');
                const mm = String(date.getMinutes()).padStart(2, '0');
                const ss = String(date.getSeconds()).padStart(2, '0');
                const d = date.getDate();
                const m = date.getMonth() + 1;
                const y = date.getFullYear();
                timeStr = `${hh}:${mm}:${ss} ${d}/${m}/${y}`;
            }

            return `
            <div style="display:flex;gap:10px;align-items:flex-start">
                <!-- Timeline dot -->
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding-top:2px;align-self:stretch">
                    <div style="width:28px;height:28px;border-radius:50%;background:${cfg.bg};color:${cfg.color};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">
                        <i class="fa-solid ${cfg.icon}"></i>
                    </div>
                    ${idx < history.length - 1 ? `<div style="width:2px;flex:1;background:#E2E8F0;margin-top:4px;margin-bottom:4px"></div>` : ''}
                </div>
                <!-- Content -->
                <div style="flex:1;padding-bottom:${idx < history.length - 1 ? '16px' : '0'}">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                        <span style="font-size:13px;font-weight:700;color:${cfg.color}">${cfg.label}</span>
                        <span style="font-size:11px;color:#94A3B8">${timeStr}</span>
                    </div>
                    <div style="font-size:12px;color:#64748B;margin-top:2px">${actor}</div>
                    ${h.feedback ? `<div style="margin-top:6px;padding:8px 10px;background:#FEF2F2;border-radius:6px;font-size:12px;color:#7F1D1D;white-space:pre-line;border-left:2px solid #EF4444">${h.feedback}</div>` : ''}
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#EF4444;font-size:13px">Không thể tải lịch sử nộp bài</div>`;
    }
}

// Initialize on load
window.onload = () => {
    initPage();
    initPanReview();
};

// Resize redraw handler
window.onresize = () => {
    const mainImg = document.getElementById('mainImage');
    if (mainImg && mainImg.style.display !== 'none') {
        const container = document.querySelector('.canvas-container');
        setupCanvas(container, mainImg);
        redrawAnnotations();
    }
};
