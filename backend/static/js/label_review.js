import { currentUser, getToken, taskId, state, currentAnns } from './reviewing/state.js';
import { BASE_URL, CLASSES, CLASS_MAP, CAM_LABELS } from './reviewing/constants.js';
import { fetchTask, fetchFrames, fetchAllAnnotations, submitReview } from './reviewing/api.js';
import { setupCanvas, redrawAnnotations, zoomIn, zoomOut, applyZoom, initPanReview, selectAt, applyImageFilter, resetImageFilter } from './reviewing/canvas.js';
import { startTimer, stopTimer, updateTimerDisplay } from './reviewing/timer.js';
import { renderCamList, renderLabelList, openTaskInfo, loadFrameReviewState, saveFeedbackToState, markFrame, updateFrameStatusBadge, updateActionButtons, updateProgress } from './reviewing/ui.js';

// Auth guard
if (!getToken() || (currentUser.role !== 'user' && currentUser.role !== 'admin')) {
    window.location.href = '../login.html';
}
if (!taskId) window.location.href = 'dashboard.html';

// ============= INIT =============
async function init() {
    startTimer();
    try {
        const taskData = await fetchTask();
        state.task = taskData;

        // Permission check
        const isReviewer = state.task.reviewer_id === currentUser.id;
        const isLabeler = state.task.assigned_to === currentUser.id;
        const isAdmin = currentUser.role === 'admin';

        if (!isReviewer && !isLabeler && !isAdmin) {
            showToast('Bạn không có quyền xem nhiệm vụ này', 'error');
            const redirectUrl = currentUser.role === 'admin' ? '../Admin/dashboard.html' : 'dashboard.html';
            setTimeout(() => window.location.href = redirectUrl, 2000);
            return;
        }

        if (!isReviewer && !isAdmin) {
            const btn = document.getElementById('btnDaKiemTra');
            if (btn) btn.style.display = 'none';
        }

        if (isAdmin) {
            const btn = document.getElementById('btnDaKiemTra');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-shield-check"></i> Xác nhận kết quả';
            const backLink = document.getElementById('backLinkReview');
            if (backLink) backLink.href = '../Admin/dashboard.html';
        }

        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl && avatarEl.tagName === 'DIV' && !currentUser.avatar_url) {
            const initials = (currentUser.username || 'NL').substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }

        const framesData = await fetchFrames(state.task.scene_id);
        state.frames = framesData;
        if (!state.frames.length) {
            showToast('Nhiệm vụ không có khung hình', 'error');
            return;
        }

        await fetchAllAnnotations();

        // Detect cameras
        const firstFrame = state.frames[0];
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
            state.CAMERAS = detectedCams;
        }

        if (state.CAMERAS.length > 0 && !state.CAMERAS.includes(state.currentCamera)) {
            state.currentCamera = state.CAMERAS[0];
        }

        const urlFrame = parseInt(new URLSearchParams(window.location.search).get('frame') || '-1');
        const savedFrame = parseInt(localStorage.getItem(`review_frame_${taskId}`) || '0');
        const startFrame = urlFrame >= 0
            ? Math.min(urlFrame, state.frames.length - 1)
            : Math.min(Math.max(0, savedFrame), state.frames.length - 1);
        
        await goToFrame(startFrame);
        setupNav();

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

// ============= FRAME NAVIGATION =============
async function goToFrame(idx) {
    if (idx < 0 || idx >= state.frames.length) return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('frame', idx);
        window.history.replaceState(null, '', url.toString());
    } catch (e) {}
    
    saveFeedbackToState();
    state.currentFrameIdx = idx;
    state.selectedAnnId = null;
    
    state.panOffset = { x: 0, y: 0 };
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(0px, 0px) scale(${state.zoomScale})`;
    
    const pageNum = document.getElementById('pageNum');
    if (pageNum) pageNum.textContent = idx + 1;

    renderCamList(state.frames[idx]);
    await loadImage(state.frames[idx], state.currentCamera);
    updateProgress();
    loadFrameReviewState();
}

async function switchCamera(cam) {
    if (!cam || !state.CAMERAS.includes(cam) || cam === state.currentCamera) return;
    state.currentCamera = cam;
    await loadImage(state.frames[state.currentFrameIdx], cam);
    renderCamList(state.frames[state.currentFrameIdx]);
}

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

// ============= SIDEBAR & INTERACTION =============
function selectAnn(id) {
    state.selectedAnnId = state.selectedAnnId === id ? null : id;
    redrawAnnotations();
    renderLabelList();
    setTimeout(() => {
        const el = document.querySelector('.review-label-item.active');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

function toggleHide(id) {
    if (state.hiddenIds.has(id)) state.hiddenIds.delete(id);
    else state.hiddenIds.add(id);
    redrawAnnotations();
    renderLabelList();
}

function toggleCategoryCollapse(category) {
    state.collapsedCategories[category] = !state.collapsedCategories[category];
    renderLabelList();
}

function toggleCategoryHide(catId) {
    if (state.hiddenCategories.has(catId)) {
        state.hiddenCategories.delete(catId);
    } else {
        state.hiddenCategories.add(catId);
    }
    redrawAnnotations();
    renderLabelList();
}

// ============= SHORTCUTS & TOOLS =============
function setupNav() {
    document.getElementById('btnFirst')?.addEventListener('click', () => goToFrame(0));
    document.getElementById('btnPrev')?.addEventListener('click', () => goToFrame(state.currentFrameIdx - 1));
    document.getElementById('btnNext')?.addEventListener('click', () => goToFrame(state.currentFrameIdx + 1));
    document.getElementById('btnLast')?.addEventListener('click', () => goToFrame(state.frames.length - 1));
    
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            if (e.key === 'ArrowUp') zoomIn();
            else zoomOut();
            return;
        }

        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
            e.preventDefault();
            const idx = state.CAMERAS.indexOf(state.currentCamera);
            const nextIdx = (idx - 1 + state.CAMERAS.length) % state.CAMERAS.length;
            switchCamera(state.CAMERAS[nextIdx]);
            return;
        }
        if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
            e.preventDefault();
            const idx = state.CAMERAS.indexOf(state.currentCamera);
            const nextIdx = (idx + 1) % state.CAMERAS.length;
            switchCamera(state.CAMERAS[nextIdx]);
            return;
        }

        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') goToFrame(state.currentFrameIdx + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') goToFrame(state.currentFrameIdx - 1);
        if (e.key === 'Home') goToFrame(0);
        if (e.key === 'End')  goToFrame(state.frames.length - 1);

        if (['1','2','3','4','5','6'].includes(e.key)) {
            switchCamera(state.CAMERAS[parseInt(e.key) - 1]);
        }

        if (e.key === 'c' || e.key === 'C') markFrame('correct');
        if (e.key === 'w' || e.key === 'W' || e.key === 'x' || e.key === 'X') markFrame('wrong');

        if (e.key === '+' || e.key === '=') zoomIn();
        if (e.key === '-' || e.key === '_') zoomOut();
        if (e.key === '0') { state.zoomScale = 1; state.panOffset = { x: 0, y: 0 }; applyZoom(); }
    });

    window.addEventListener('wheel', e => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) zoomIn();
            else zoomOut();
        }
    }, { passive: false });
}

function setActiveTool(tool) {
    state.currentTool = tool;
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

// ============= TOAST UTILS =============
export function showToast(msg, type = 'info') {
    const colors = { success: '#10B981', error: '#EF4444', info: '#2563EB' };
    const icons  = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:80px;right:16px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:${colors[type]||'#2563EB'};box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;font-family:Inter,sans-serif`;
    t.innerHTML = `<i class="fa-solid ${icons[type]||'fa-circle-info'}"></i>${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
.category-group-header:hover { background: #E2E8F0 !important; }
.category-group-content { margin-left: 4px; border-left: 2px solid #F1F5F9; padding-left: 4px; }
`;
document.head.appendChild(styleSheet);

// Bind variables to window for HTML events
window.goToFrame = goToFrame;
window.switchCamera = switchCamera;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.openTaskInfo = openTaskInfo;
window.applyImageFilter = applyImageFilter;
window.resetImageFilter = resetImageFilter;
window.toggleCategoryCollapse = toggleCategoryCollapse;
window.toggleCategoryHide = toggleCategoryHide;
window.selectAnn = selectAnn;
window.toggleHide = toggleHide;
window.markFrame = markFrame;
window.submitReview = submitReview;
window.showToast = showToast;
window.renderLabelList = renderLabelList;
window.setActiveTool = setActiveTool;
window.toggleSectionCollapse = toggleSectionCollapse;

document.addEventListener('DOMContentLoaded', () => initPanReview());
window.addEventListener('beforeunload', () => {
    stopTimer();
});

// Setup modal bindings
['modalTaskInfo', 'modalShortcuts'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function (e) {
        if (e.target === this) this.style.display = 'none';
    });
});

document.getElementById('btnDaKiemTra')?.addEventListener('click', submitReview);
document.getElementById('frameFeedback')?.addEventListener('input', saveFeedbackToState);
document.getElementById('frameFeedback')?.addEventListener('blur', function() {
    saveFeedbackToState();
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo === 'FrameList') {
        try {
            const frameNum = state.currentFrameIdx + 1;
            const reviewKey = `framelist_review_${taskId}`;
            const rs = JSON.parse(localStorage.getItem(reviewKey) || '{}');
            const fb = document.getElementById('frameFeedback').value.trim();
            if (fb) rs['fb_' + frameNum] = fb;
            localStorage.setItem(reviewKey, JSON.stringify(rs));
        } catch(e) {}
    }
});

// Add tool events
document.getElementById('tool-pointer')?.addEventListener('click', () => setActiveTool('pointer'));
document.getElementById('tool-pan')?.addEventListener('click', () => setActiveTool('pan'));

init();
export { goToFrame, switchCamera };
