import { currentUser, getToken, taskId, state, genId, getFrameAnns, setFrameAnns, currentAnns, getTrackName, setTrackName, getNextTrackId, initTrackCounters, markUnsaved } from './labeling/state.js';
import { BASE_URL, CLASSES, CLASS_MAP, CAM_LABELS } from './labeling/constants.js';
import { fetchTask, fetchFrames, fetchAllAnnotations, saveAnnotations, saveCurrentFrame, submitTask, runAI } from './labeling/api.js';
import { setupCanvas, handleResize, redrawAnnotations, redrawWithHandles, selectAt, zoomIn, zoomOut, applyZoom, initPanReview, enablePan, disablePan, applyImageFilter, resetImageFilter } from './labeling/canvas.js';
import { startTimer, stopTimer, updateTimerDisplay } from './labeling/timer.js';
import { renderCamList, renderFrameStrip, loadStripThumb, loadThumb, prefetchNextFrame, renderLabelList, renderAttentionList, openTaskInfo } from './labeling/ui.js';

// Auth guard
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}
if (!taskId) window.location.href = 'dashboard.html';

// ============= INIT =============
async function init() {
    startTimer();
    try {
        const taskData = await fetchTask();
        state.task = taskData;

        // Update user avatar
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
        initTrackCounters();

        // Detect available cameras dynamically
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

        window._isSingleCam = state.CAMERAS.length === 1;
        if (window._isSingleCam) {
            const panelHeader = document.querySelector('.panel-header');
            if (panelHeader) panelHeader.textContent = 'KHUNG HÌNH';
        }

        if (state.CAMERAS.length > 0 && !state.CAMERAS.includes(state.currentCamera)) {
            state.currentCamera = state.CAMERAS[0];
        }

        const urlFrame = parseInt(new URLSearchParams(window.location.search).get('frame') || '-1');
        const savedFrame = parseInt(localStorage.getItem(`lastFrame_${taskId}`) || '0');
        const startFrame = urlFrame >= 0
            ? Math.min(urlFrame, state.frames.length - 1)
            : Math.min(Math.max(0, savedFrame), state.frames.length - 1);
        
        await goToFrame(startFrame);
        setupDropdownItems();

        // If task is rejected, disable submit button
        const framelistActive = localStorage.getItem(`framelist_mode_${taskId}`) === 'fix';
        if (state.task.status === 'rejected' || framelistActive) {
            const submitBtn = document.getElementById('btnNop') || document.querySelector('.btn-phe-duyet');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.title = 'Vui lòng sửa từng khung hình qua danh sách khung hình rồi nộp lại';
                submitBtn.style.opacity = '0.5';
                submitBtn.style.cursor = 'not-allowed';
                submitBtn.style.pointerEvents = 'none';
            }
        }

        if (state.task.status === 'pending') {
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

// ============= FRAME NAVIGATION =============
async function goToFrame(idx) {
    if (idx < 0 || idx >= state.frames.length) return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('frame', idx);
        window.history.replaceState(null, '', url.toString());
    } catch (e) {}
    const prevIdx = state.currentFrameIdx;
    
    if (state.unsaved && prevIdx >= 0 && prevIdx < state.frames.length) {
        if (state.autoSaveTimeout) clearTimeout(state.autoSaveTimeout);
        const saveBtn = document.querySelector('.btn-submit');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
            saveBtn.style.background = '#F59E0B';
        }
        await saveCurrentFrame(false);
        state.unsaved = false;
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Lưu';
            saveBtn.style.background = '';
        }
    }

    state.currentFrameIdx = idx;
    state.sessionReviewedIds.clear();
    updatePageNumber();

    renderCamList(state.frames[idx]);
    await loadImage(state.frames[idx], state.currentCamera);
    prefetchNextFrame(idx + 1);
}

function updatePageNumber() {
    const el = document.querySelector('.page-number');
    if (el) el.textContent = state.currentFrameIdx + 1;
}

// ============= IMAGE LOADING =============
async function loadImage(frame, cam) {
    const container = document.querySelector('.canvas-container');
    let mainImg = document.getElementById('mainImage');
    if (!mainImg) return;

    const oldPlaceholder = document.getElementById('mainNoData');
    if (oldPlaceholder) oldPlaceholder.remove();

    mainImg.style.display = 'block';
    state.selectedAnnId = null;

    state.panOffset = { x: 0, y: 0 };
    if (container) container.style.transform = '';

    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const src = URL.createObjectURL(blob);

        await new Promise((resolve, reject) => {
            mainImg.onload = resolve;
            mainImg.onerror = reject;
            mainImg.src = src;
        });

        requestAnimationFrame(() => {
            setupCanvas(container, mainImg);
            redrawAnnotations();
            renderLabelList();
            renderAttentionList();
        });
    } catch (e) {
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

async function switchCamera(cam) {
    if (!cam || !state.CAMERAS.includes(cam) || cam === state.currentCamera) return;

    if (state.unsaved) {
        if (state.autoSaveTimeout) clearTimeout(state.autoSaveTimeout);
        const saveBtn = document.querySelector('.btn-submit');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
            saveBtn.style.background = '#F59E0B';
        }
        await saveCurrentFrame(false);
        state.unsaved = false;
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Lưu';
            saveBtn.style.background = '';
        }
    }

    state.currentCamera = cam;
    renderCamList(state.frames[state.currentFrameIdx]);
    await loadImage(state.frames[state.currentFrameIdx], cam);
}

// ============= INTERACTIONS & SIDEBAR =============
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
    redrawWithHandles();
    renderLabelList();
}

function selectAnn(id) {
    state.selectedAnnId = id;
    redrawAnnotations();
    renderLabelList();
    setTimeout(() => {
        const el = document.querySelector(`.label-item.active`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
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
    const frame = state.frames[state.currentFrameIdx];
    const anns = currentAnns();
    const ann = anns.find(a => a.id === annId);
    if (!ann) return;

    document.getElementById('changeCatModal').style.display = 'none';

    ann.category = newCategory;
    ann.track_id = null;

    setFrameAnns(frame.id, state.currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
    markUnsaved();
    showToast('Đã đổi loại đối tượng', 'success');
}

function toggleAnnVisibility(id) {
    const frame = state.frames[state.currentFrameIdx];
    const anns = currentAnns();
    const ann = anns.find(a => a.id === id);
    if (ann) ann.hidden = !ann.hidden;
    setFrameAnns(frame.id, state.currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
}

function deleteAnn(id) {
    const frame = state.frames[state.currentFrameIdx];
    setFrameAnns(frame.id, state.currentCamera, currentAnns().filter(a => a.id !== id));
    if (state.selectedAnnId === id) state.selectedAnnId = null;

    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
}

function deleteSelected() {
    if (!state.selectedAnnId) return;
    deleteAnn(state.selectedAnnId);
}

function updateCamBadge() {
    renderCamList(state.frames[state.currentFrameIdx]);
}

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
    const frame = state.frames[state.currentFrameIdx];
    setFrameAnns(frame.id, state.currentCamera, anns);
    redrawAnnotations();
    renderLabelList();
    markUnsaved();
}

function markReviewed(id) {
    const ann = currentAnns().find(a => a.id === id);
    if (!ann) return;
    ann.needs_review = false;
    state.sessionReviewedIds.add(id);
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

// ============= KEYBOARD & DRAG SHORTCUTS =============
document.querySelector('.fa-angles-left')?.addEventListener('click', () => goToFrame(0));
document.querySelector('.fa-angle-left')?.addEventListener('click', () => goToFrame(state.currentFrameIdx - 1));
document.querySelector('.fa-angle-right')?.addEventListener('click', () => goToFrame(state.currentFrameIdx + 1));
document.querySelector('.fa-angles-right')?.addEventListener('click', () => goToFrame(state.frames.length - 1));

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
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') goToFrame(state.currentFrameIdx - 1);
    if (e.key === 'Home') goToFrame(0);
    if (e.key === 'End') goToFrame(state.frames.length - 1);

    if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        switchCamera(state.CAMERAS[parseInt(e.key) - 1]);
    }

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

    if (e.key === 'v' || e.key === 'V') setActiveTool('pointer');
    if (e.key === 'b' || e.key === 'B') setActiveTool('box');
    if (e.key === 'h' || e.key === 'H') setActiveTool('pan');
    if (e.key === 'e' || e.key === 'E') setActiveTool('resize');
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); runAI(); }
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
    if (e.key === 'Escape') { state.selectedAnnId = null; redrawAnnotations(); renderLabelList(); }

    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-' || e.key === '_') zoomOut();
    if (e.key === '0') {
        state.zoomLevel = 100;
        state.panOffset = { x: 0, y: 0 };
        const _c = document.querySelector('.canvas-container');
        if (_c) _c.style.transform = '';
        applyZoom();
    }
});

// ============= TOOL SETUP =============
function selectClassById(classId) {
    const found = CLASSES.find(c => c.id === classId);
    if (found) {
        state.selectedClass = found.id;
        showToast(`Nhãn: ${found.name}`, 'custom', found.color);
        
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

    document.querySelector('.tool-btn[title="Pointer"]')?.addEventListener('click', () => setActiveTool('pointer'));
    document.getElementById('btn-clone')?.addEventListener('click', () => setActiveTool('clone'));
    document.getElementById('btn-resize')?.addEventListener('click', () => setActiveTool('resize'));
    document.querySelector('.tool-btn[title="Pan"]')?.addEventListener('click', () => setActiveTool('pan'));
    document.querySelector('.btn-ai-auto')?.addEventListener('click', runAI);
    document.querySelector('.btn-submit')?.addEventListener('click', () => saveAnnotations(true));
    document.querySelector('.btn-phe-duyet')?.addEventListener('click', submitTask);

    setActiveTool('pointer');
}

function setActiveTool(tool) {
    state.currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

    const drawCanvas = document.querySelector('canvas:not([style*="pointer-events:none"])');

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
        document.querySelector('.tool-btn[title="Pointer"]')?.classList.add('active');
        if (drawCanvas) drawCanvas.style.cursor = 'default';
        disablePan();
    }
}

function cloneSelected() {
    if (!state.selectedAnnId) {
        showToast('Chọn một nhãn trước khi sao chép', 'info');
        setActiveTool('pointer');
        return;
    }
    const frame = state.frames[state.currentFrameIdx];
    const anns = currentAnns();
    const src = anns.find(a => a.id === state.selectedAnnId);
    if (!src) return;

    const offset = 0.02;
    const clone = {
        ...src,
        id: genId(),
        bbox_x: Math.min(1 - src.bbox_w, src.bbox_x + offset),
        bbox_y: Math.min(1 - src.bbox_h, src.bbox_y + offset),
        hidden: false,
        is_ai_generated: false,
    };
    anns.push(clone);
    setFrameAnns(frame.id, state.currentCamera, anns);
    state.selectedAnnId = clone.id;
    redrawAnnotations();
    renderLabelList();
    updateCamBadge();
    markUnsaved();
    showToast('Đã sao chép nhãn', 'success');
    setActiveTool('pointer');
}

// ============= TOAST & MODAL UTILS =============
export function showToast(msg, type = 'info', customColor = null) {
    const colors = { success: '#10B981', error: '#EF4444', info: '#2563EB', custom: customColor };
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', custom: 'fa-tag' };
    const bg = customColor || colors[type] || '#2563EB';
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:80px;right:16px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:${bg};box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;font-family:Inter,sans-serif`;
    t.innerHTML = `<i class="fa-solid ${icons[type] || 'fa-circle-info'}"></i>${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

// Add animation stylesheet
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
.category-group-header:hover { background: #E2E8F0 !important; }
.category-group-content { margin-left: 4px; border-left: 2px solid #F1F5F9; padding-left: 4px; }
`;
document.head.appendChild(style);

// Bind variables to window for HTML events
window.goToFrame = goToFrame;
window.switchCamera = switchCamera;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.openTaskInfo = openTaskInfo;
window.applyImageFilter = applyImageFilter;
window.resetImageFilter = resetImageFilter;
window.switchResultTab = switchResultTab;
window.toggleCategoryCollapse = toggleCategoryCollapse;
window.toggleCategoryHide = toggleCategoryHide;
window.selectAnn = selectAnn;
window.renameAnn = renameAnn;
window.toggleAnnVisibility = toggleAnnVisibility;
window.changeAnnCategory = changeAnnCategory;
window.confirmChangeCategory = confirmChangeCategory;
window.deleteAnn = deleteAnn;
window.markReviewed = markReviewed;
window.showToast = showToast;
window.updateCamBadge = updateCamBadge;
window.renderLabelList = renderLabelList;
window.renderAttentionList = renderAttentionList;
window.redrawAnnotations = redrawAnnotations;

// Modalbackdrop close
['modalTaskInfo', 'modalShortcuts', 'modalSettings'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function (e) {
        if (e.target === this) this.style.display = 'none';
    });
});

window.addEventListener('beforeunload', () => {
    stopTimer();
});

window.addEventListener('resize', handleResize);

initPanReview();
init();
export { goToFrame, switchCamera, switchResultTab };
