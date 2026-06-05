import { state, getCurrentEntries } from './state.js';
import { CLASS_MAP } from './constants.js';

// We import renderMatchedLabels dynamically or from main module.
// In ES6, we can import it from '../Evaluation.js'.
import { renderMatchedLabels } from '../Evaluation.js';

export function setupCanvas(container, img) {
    // Remove old canvas
    container.querySelectorAll('canvas').forEach(c => c.remove());

    state.imgDisplayW = img.clientWidth;
    state.imgDisplayH = img.clientHeight;

    state.annCanvas = document.createElement('canvas');
    state.annCanvas.width = state.imgDisplayW;
    state.annCanvas.height = state.imgDisplayH;
    state.annCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    container.appendChild(state.annCanvas);
    state.annCtx = state.annCanvas.getContext('2d');
}

export function redrawAnnotations() {
    if (!state.annCtx || !state.evaluationData) return;
    state.annCtx.clearRect(0, 0, state.annCanvas.width, state.annCanvas.height);

    const frame = state.evaluationData.frames[state.selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[state.selectedCamera] || { ai_boxes: [], matched: [], extra: [] };

    const width = state.imgDisplayW;
    const height = state.imgDisplayH;
    const hasSelection = state.selectedAnnId !== null;

    // Build per-item hidden sets
    const hiddenAIKeys = new Set();
    const hiddenUserIds = new Set();

    const entries = getCurrentEntries(comp);
    entries.forEach(item => {
        const ov = state.hiddenMatchedItems.get(String(item.id));
        if (item.type === 'matched') {
            if (ov?.hideAI) hiddenAIKeys.add(`${item.ai_box.bbox_x}_${item.ai_box.bbox_y}`);
            if (ov?.hideUser) hiddenUserIds.add(item.user_box.id);
        } else if (item.type === 'extra') {
            if (ov?.hideUser) hiddenUserIds.add(item.user_box.id);
        } else if (item.type === 'missing') {
            if (ov?.hideAI) hiddenAIKeys.add(`${item.ai_box.bbox_x}_${item.ai_box.bbox_y}`);
        }
    });

    // 1. Draw AI boxes (dashed)
    if (state.showAILabels) {
        comp.ai_boxes.forEach(box => {
            if (hiddenAIKeys.has(`${box.bbox_x}_${box.bbox_y}`)) return;
            const x = box.bbox_x * width, y = box.bbox_y * height;
            const w = box.bbox_w * width, h = box.bbox_h * height;
            const cls = CLASS_MAP[box.category];
            const color = cls ? cls.color : '#9333EA';
            const isMatchedToSelectedUser = comp.matched.some(m =>
                String(m.user_box.id) === String(state.selectedAnnId) &&
                (String(m.ai_box.id) === String(box.id) || (m.ai_box.bbox_x === box.bbox_x && m.ai_box.bbox_y === box.bbox_y))
            );
            const sel = String(box.id) === String(state.selectedAnnId) || isMatchedToSelectedUser;
            state.annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            state.annCtx.strokeStyle = color;
            state.annCtx.lineWidth = sel ? 3.5 : 2.0;
            state.annCtx.setLineDash([2, 2]);
            state.annCtx.strokeRect(x, y, w, h);
            state.annCtx.setLineDash([]);
        });
    }

    // 2. Draw user boxes
    if (state.showUserLabels) {
        comp.matched.forEach(m => {
            const u = m.user_box;
            if (hiddenUserIds.has(u.id)) return;
            const x = u.bbox_x * width, y = u.bbox_y * height;
            const w = u.bbox_w * width, h = u.bbox_h * height;
            const cls = CLASS_MAP[u.category];
            const color = cls ? cls.color : '#10B981';
            const sel = String(u.id) === String(state.selectedAnnId);
            state.annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            state.annCtx.strokeStyle = color;
            state.annCtx.lineWidth = sel ? 3.5 : 2.0;
            state.annCtx.strokeRect(x, y, w, h);
            state.annCtx.fillStyle = color;
            state.annCtx.globalAlpha = hasSelection ? (sel ? 0.25 : 0.05) : 0.12;
            state.annCtx.fillRect(x, y, w, h);
        });
        comp.extra.forEach(ex => {
            if (hiddenUserIds.has(ex.id)) return;
            const x = ex.bbox_x * width, y = ex.bbox_y * height;
            const w = ex.bbox_w * width, h = ex.bbox_h * height;
            const cls = CLASS_MAP[ex.category];
            const color = cls ? cls.color : '#3B82F6';
            const sel = String(ex.id) === String(state.selectedAnnId);
            state.annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            state.annCtx.strokeStyle = color;
            state.annCtx.lineWidth = sel ? 3.5 : 2.0;
            state.annCtx.strokeRect(x, y, w, h);
            state.annCtx.fillStyle = color;
            state.annCtx.globalAlpha = hasSelection ? (sel ? 0.25 : 0.05) : 0.12;
            state.annCtx.fillRect(x, y, w, h);
        });
    }

    state.annCtx.globalAlpha = 1.0;
}

export function zoomIn() {
    state.zoomScale = Math.min(state.zoomScale + 0.25, 4);
    applyZoom();
}

export function zoomOut() {
    state.zoomScale = Math.max(state.zoomScale - 0.25, 0.5);
    applyZoom();
}

export function resetZoom() {
    state.zoomScale = 1.0;
    state.panOffset = { x: 0, y: 0 };
    applyZoom();
}

export function applyZoom() {
    const container = document.querySelector('.canvas-container');
    if (container) {
        container.style.transform = `translate(${state.panOffset.x}px, ${state.panOffset.y}px) scale(${state.zoomScale})`;
    }
    const zoomLevelEl = document.getElementById('zoomLevel');
    if (zoomLevelEl) {
        zoomLevelEl.textContent = `${Math.round(state.zoomScale * 100)}%`;
    }
}

export function selectAt(clientX, clientY) {
    const img = document.getElementById('mainImage');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = ((clientX - rect.left) / rect.width) * state.imgDisplayW;
    const py = ((clientY - rect.top) / rect.height) * state.imgDisplayH;
    const frame = state.evaluationData.frames[state.selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[state.selectedCamera] || { ai_boxes: [], matched: [], extra: [] };

    const entries = getCurrentEntries(comp);

    for (let i = entries.length - 1; i >= 0; i--) {
        const item = entries[i];
        if (item.type === 'matched') {
            const u = item.user_box;
            const ai = item.ai_box;
            if (state.showUserLabels && px >= u.bbox_x * state.imgDisplayW && px <= (u.bbox_x + u.bbox_w) * state.imgDisplayW &&
                py >= u.bbox_y * state.imgDisplayH && py <= (u.bbox_y + u.bbox_h) * state.imgDisplayH) {
                state.selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
            if (state.showAILabels && px >= ai.bbox_x * state.imgDisplayW && px <= (ai.bbox_x + ai.bbox_w) * state.imgDisplayW &&
                py >= ai.bbox_y * state.imgDisplayH && py <= (ai.bbox_y + ai.bbox_h) * state.imgDisplayH) {
                state.selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
        } else if (item.type === 'extra') {
            const ex = item.user_box;
            if (state.showUserLabels && px >= ex.bbox_x * state.imgDisplayW && px <= (ex.bbox_x + ex.bbox_w) * state.imgDisplayW &&
                py >= ex.bbox_y * state.imgDisplayH && py <= (ex.bbox_y + ex.bbox_h) * state.imgDisplayH) {
                state.selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
        } else if (item.type === 'missing') {
            const mi = item.ai_box;
            if (state.showAILabels && px >= mi.bbox_x * state.imgDisplayW && px <= (mi.bbox_x + mi.bbox_w) * state.imgDisplayW &&
                py >= mi.bbox_y * state.imgDisplayH && py <= (mi.bbox_y + mi.bbox_h) * state.imgDisplayH) {
                state.selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
        }
    }
    state.selectedAnnId = null; redrawAnnotations(); renderMatchedLabels();
}

export function initPanReview() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', _panStart, { passive: false });
    canvas.addEventListener('mousemove', _panMove, { passive: false });
    canvas.addEventListener('mouseup', _panEnd);
    canvas.addEventListener('mouseleave', _panEnd);
    canvas.style.cursor = state.currentTool === 'pan' ? 'grab' : 'default';

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
    if (state.currentTool !== 'pan') {
        selectAt(e.clientX, e.clientY);
        return;
    }
    e.preventDefault();
    state.isPanning = true;
    state.panStart = { x: e.clientX - state.panOffset.x, y: e.clientY - state.panOffset.y };
    e.currentTarget.style.cursor = 'grabbing';
    e.currentTarget.style.userSelect = 'none';
}

function _panMove(e) {
    if (state.currentTool !== 'pan' || !state.isPanning) return;
    e.preventDefault();
    state.panOffset.x = e.clientX - state.panStart.x;
    state.panOffset.y = e.clientY - state.panStart.y;
    applyZoom();
}

function _panEnd(e) {
    if (state.currentTool !== 'pan') return;
    state.isPanning = false;
    e.currentTarget.style.cursor = 'grab';
    e.currentTarget.style.userSelect = '';
}

export function applyImageFilter() {
    const brightness = document.getElementById('brightnessSlider')?.value || 100;
    const contrast = document.getElementById('contrastSlider')?.value || 100;
    const bVal = document.getElementById('brightnessVal');
    const cVal = document.getElementById('contrastVal');
    if (bVal) bVal.textContent = brightness + '%';
    if (cVal) cVal.textContent = contrast + '%';
    const img = document.getElementById('mainImage');
    if (img) img.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
}

export function resetImageFilter() {
    const bs = document.getElementById('brightnessSlider');
    const cs = document.getElementById('contrastSlider');
    if (bs) bs.value = 100;
    if (cs) cs.value = 100;
    applyImageFilter();
}
