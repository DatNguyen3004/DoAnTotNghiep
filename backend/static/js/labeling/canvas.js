import { state, currentAnns, markUnsaved, genId, setFrameAnns } from './state.js';
import { CLASS_MAP, CLASSES } from './constants.js';

export let annCanvas = null, drawCanvas = null;
export let annCtx = null, drawCtx = null;
export let imgDisplayW = 1, imgDisplayH = 1;
export let imgNaturalW = 1, imgNaturalH = 1;

export function setupCanvas(container, img) {
    container.querySelectorAll('canvas').forEach(c => c.remove());

    imgDisplayW = img.offsetWidth || img.naturalWidth;
    imgDisplayH = img.offsetHeight || img.naturalHeight;
    imgNaturalW = img.naturalWidth || imgDisplayW;
    imgNaturalH = img.naturalHeight || imgDisplayH;

    annCanvas = document.createElement('canvas');
    annCanvas.width = imgDisplayW;
    annCanvas.height = imgDisplayH;
    annCanvas.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;`;
    annCtx = annCanvas.getContext('2d');

    drawCanvas = document.createElement('canvas');
    drawCanvas.width = imgDisplayW;
    drawCanvas.height = imgDisplayH;
    drawCanvas.style.cssText = `position:absolute;top:0;left:0;cursor:${state.currentTool === 'box' ? 'crosshair' : 'default'};`;
    drawCtx = drawCanvas.getContext('2d');

    container.appendChild(annCanvas);
    container.appendChild(drawCanvas);

    if (state.currentTool === 'box') drawCanvas.style.cursor = 'crosshair';
    else if (state.currentTool === 'pan') drawCanvas.style.cursor = 'grab';
    else drawCanvas.style.cursor = 'default';

    drawCanvas.addEventListener('mousedown', onMouseDown);
    drawCanvas.addEventListener('mousemove', onMouseMove);
    drawCanvas.addEventListener('mouseup', onMouseUp);
    drawCanvas.addEventListener('mouseleave', onMouseLeave);
}

export function handleResize() {
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
}

export function redrawAnnotations() {
    if (!annCtx) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);

    const attentionMode = window._currentResultTab === 'attention';

    currentAnns().forEach(ann => {
        if (ann.hidden || state.hiddenCategories.has(ann.category)) return;

        const needsFlag = ann.needs_review === true;

        if (attentionMode && !needsFlag && !state.sessionReviewedIds.has(ann.id)) return;

        const cls = CLASS_MAP[ann.category];
        const baseColor = cls ? cls.color : '#14B8A6';
        const color = needsFlag ? '#EF4444' : baseColor;

        const x = ann.bbox_x * imgDisplayW;
        const y = ann.bbox_y * imgDisplayH;
        const w = ann.bbox_w * imgDisplayW;
        const h = ann.bbox_h * imgDisplayH;
        const sel = ann.id === state.selectedAnnId;

        const hasSelection = state.selectedAnnId !== null;
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

export function redrawWithHandles() {
    redrawAnnotations();
    if (state.currentTool === 'resize' && state.selectedAnnId) {
        const ann = currentAnns().find(a => a.id === state.selectedAnnId);
        if (ann) drawHandles(ann);
    }
}

export function drawHandles(ann) {
    if (!annCtx || state.currentTool !== 'resize') return;
    const handles = getHandles(ann);
    annCtx.fillStyle = '#fff';
    annCtx.strokeStyle = '#2563EB';
    annCtx.lineWidth = 1.5;
    const HANDLE_SIZE = 8;
    for (const pt of Object.values(handles)) {
        annCtx.beginPath();
        annCtx.rect(pt.x - HANDLE_SIZE / 2, pt.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        annCtx.fill();
        annCtx.stroke();
    }
}

export function getHandles(ann) {
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

export function hitHandle(px, py, ann) {
    const HANDLE_SIZE = 8;
    const handles = getHandles(ann);
    for (const [key, pt] of Object.entries(handles)) {
        if (Math.abs(px - pt.x) <= HANDLE_SIZE && Math.abs(py - pt.y) <= HANDLE_SIZE) return key;
    }
    return null;
}

export function selectAt(px, py) {
    const anns = currentAnns();
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
            state.selectedAnnId = a.id;
            redrawAnnotations();
            window.renderLabelList();
            return;
        }
    }
    state.selectedAnnId = null;
    redrawAnnotations();
    window.renderLabelList();
}

function onMouseDown(e) {
    if (state.currentTool === 'resize') {
        const pos = getPos(e);
        const anns = currentAnns();
        for (let i = anns.length - 1; i >= 0; i--) {
            const h = hitHandle(pos.x, pos.y, anns[i]);
            if (h) {
                state.resizeHandle = h;
                state.resizeAnn = anns[i];
                state.resizeStart = { ...pos, origAnn: { ...anns[i] } };
                state.selectedAnnId = anns[i].id;
                return;
            }
        }
        selectAt(pos.x, pos.y);
        return;
    }
    if (state.currentTool === 'pointer') {
        const pos = getPos(e);
        const anns = currentAnns();
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
                state.selectedAnnId = a.id;
                state.isDragging = true;
                state.dragStart = { ...pos };
                state.dragAnn = { ...a };
                drawCanvas.style.cursor = 'grabbing';
                redrawAnnotations();
                window.renderLabelList();
                return;
            }
        }
        state.selectedAnnId = null;
        redrawAnnotations();
        window.renderLabelList();
        return;
    }
    if (state.currentTool !== 'box') return;
    state.isDrawing = true;
    state.drawStart = getPos(e);
}

function onMouseMove(e) {
    if (state.currentTool === 'resize' && state.resizeHandle && state.resizeAnn) {
        const pos = getPos(e);
        const dx = (pos.x - state.resizeStart.x) / imgDisplayW;
        const dy = (pos.y - state.resizeStart.y) / imgDisplayH;
        const o = state.resizeStart.origAnn;
        let { bbox_x: x, bbox_y: y, bbox_w: w, bbox_h: h } = o;

        if (state.resizeHandle.includes('l')) { x = Math.min(o.bbox_x + o.bbox_w - 0.01, o.bbox_x + dx); w = o.bbox_w - dx; }
        if (state.resizeHandle.includes('r')) { w = Math.max(0.01, o.bbox_w + dx); }
        if (state.resizeHandle.includes('t')) { y = Math.min(o.bbox_y + o.bbox_h - 0.01, o.bbox_y + dy); h = o.bbox_h - dy; }
        if (state.resizeHandle.includes('b')) { h = Math.max(0.01, o.bbox_h + dy); }

        state.resizeAnn.bbox_x = Math.max(0, x);
        state.resizeAnn.bbox_y = Math.max(0, y);
        state.resizeAnn.bbox_w = Math.min(1 - state.resizeAnn.bbox_x, Math.max(0.01, w));
        state.resizeAnn.bbox_h = Math.min(1 - state.resizeAnn.bbox_y, Math.max(0.01, h));

        redrawWithHandles();
        return;
    }
    if (state.currentTool === 'pointer' && state.isDragging && state.dragAnn) {
        const pos = getPos(e);
        const dx = (pos.x - state.dragStart.x) / imgDisplayW;
        const dy = (pos.y - state.dragStart.y) / imgDisplayH;
        const anns = currentAnns();
        const ann = anns.find(a => a.id === state.selectedAnnId);
        if (ann) {
            ann.bbox_x = Math.max(0, Math.min(1 - state.dragAnn.bbox_w, state.dragAnn.bbox_x + dx));
            ann.bbox_y = Math.max(0, Math.min(1 - state.dragAnn.bbox_h, state.dragAnn.bbox_y + dy));
            redrawAnnotations();
        }
        return;
    }
    if (!state.isDrawing) return;
    const pos = getPos(e);
    state.drawRect = {
        x: Math.min(state.drawStart.x, pos.x),
        y: Math.min(state.drawStart.y, pos.y),
        w: Math.abs(pos.x - state.drawStart.x),
        h: Math.abs(pos.y - state.drawStart.y)
    };
    renderDrawing();
}

function onMouseUp(e) {
    if (state.currentTool === 'resize' && state.resizeHandle) {
        if (state.resizeAnn) {
            state.resizeAnn.needs_review = false;
            state.sessionReviewedIds.add(state.resizeAnn.id);
        }
        state.resizeHandle = null;
        state.resizeAnn = null;
        state.resizeStart = null;
        markUnsaved();
        redrawAnnotations();
        window.renderLabelList();
        window.renderAttentionList();
        return;
    }
    if (state.currentTool === 'pointer' && state.isDragging) {
        const movedAnn = currentAnns().find(a => a.id === state.selectedAnnId);
        if (movedAnn) {
            movedAnn.needs_review = false;
            state.sessionReviewedIds.add(movedAnn.id);
        }
        state.isDragging = false;
        state.dragAnn = null;
        drawCanvas.style.cursor = 'default';
        markUnsaved();
        redrawAnnotations();
        window.renderLabelList();
        window.renderAttentionList();
        return;
    }
    if (!state.isDrawing) return;
    state.isDrawing = false;
    if (!state.drawRect || state.drawRect.w < 8 || state.drawRect.h < 8) {
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        return;
    }
    const frame = state.frames[state.currentFrameIdx];
    const anns = currentAnns();
    let maxId = 0;
    anns.forEach(a => {
        if (a.category === state.selectedClass && a.track_id && a.track_id > maxId) {
            maxId = a.track_id;
        }
    });
    const nextTrackId = maxId + 1;

    const ann = {
        id: genId(),
        category: state.selectedClass,
        track_id: nextTrackId,
        bbox_x: Math.max(0, state.drawRect.x / imgDisplayW),
        bbox_y: Math.max(0, state.drawRect.y / imgDisplayH),
        bbox_w: Math.min(1 - state.drawRect.x / imgDisplayW, state.drawRect.w / imgDisplayW),
        bbox_h: Math.min(1 - state.drawRect.y / imgDisplayH, state.drawRect.h / imgDisplayH),
        confidence: null,
        is_ai_generated: false,
        needs_review: false,
        hidden: false,
    };
    anns.push(ann);
    setFrameAnns(frame.id, state.currentCamera, anns);
    state.selectedAnnId = ann.id;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    redrawAnnotations();
    window.renderLabelList();
    window.updateCamBadge();
    markUnsaved();
}

function onMouseLeave() {
    if (state.isDrawing) {
        state.isDrawing = false;
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
    if (!state.drawRect) return;
    const cls = CLASS_MAP[state.selectedClass];
    const color = cls ? cls.color : '#14B8A6';
    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = 2;
    drawCtx.setLineDash([5, 4]);
    drawCtx.strokeRect(state.drawRect.x, state.drawRect.y, state.drawRect.w, state.drawRect.h);
    drawCtx.fillStyle = color + '22';
    drawCtx.fillRect(state.drawRect.x, state.drawRect.y, state.drawRect.w, state.drawRect.h);
    drawCtx.setLineDash([]);
}

export function zoomIn() {
    state.zoomLevel = Math.min(200, state.zoomLevel + 10);
    applyZoom();
}

export function zoomOut() {
    state.zoomLevel = Math.max(30, state.zoomLevel - 10);
    applyZoom();
}

export function applyZoom() {
    const img = document.getElementById('mainImage');
    if (!img) return;

    img.style.width = state.zoomLevel === 100 ? '100%' : `${state.zoomLevel}%`;
    img.style.height = state.zoomLevel === 100 ? '100%' : 'auto';

    const zoomEl = document.getElementById('zoomLevel');
    if (zoomEl) zoomEl.textContent = `${state.zoomLevel}%`;

    setTimeout(() => {
        imgDisplayW = img.offsetWidth;
        imgDisplayH = img.offsetHeight;
        if (annCanvas) { annCanvas.width = imgDisplayW; annCanvas.height = imgDisplayH; }
        if (drawCanvas) { drawCanvas.width = imgDisplayW; drawCanvas.height = imgDisplayH; }
        redrawAnnotations();
    }, 50);
}

export function initPanReview() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;

    canvas.addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
    }, { passive: false });
}

export function enablePan() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', onPanStart);
    canvas.addEventListener('mousemove', onPanMove);
    canvas.addEventListener('mouseup', onPanEnd);
    canvas.addEventListener('mouseleave', onPanEnd);
}

export function disablePan() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.removeEventListener('mousedown', onPanStart);
    canvas.removeEventListener('mousemove', onPanMove);
    canvas.removeEventListener('mouseup', onPanEnd);
    canvas.removeEventListener('mouseleave', onPanEnd);
}

function onPanStart(e) {
    if (state.currentTool !== 'pan') return;
    state.isPanning = true;
    state.panStart = { x: e.clientX - state.panOffset.x, y: e.clientY - state.panOffset.y };
    e.currentTarget.style.cursor = 'grabbing';
}

function onPanMove(e) {
    if (!state.isPanning || state.currentTool !== 'pan') return;
    state.panOffset.x = e.clientX - state.panStart.x;
    state.panOffset.y = e.clientY - state.panStart.y;
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(${state.panOffset.x}px, ${state.panOffset.y}px)`;
}

function onPanEnd(e) {
    state.isPanning = false;
    if (state.currentTool === 'pan') e.currentTarget.style.cursor = 'grab';
}

export function applyImageFilter() {
    const brightness = document.getElementById('brightnessSlider')?.value || 100;
    const contrast = document.getElementById('contrastSlider')?.value || 100;
    
    const bVal = document.getElementById('brightnessVal');
    if (bVal) bVal.textContent = brightness + '%';
    const cVal = document.getElementById('contrastVal');
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
