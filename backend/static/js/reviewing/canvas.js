import { state, currentAnns } from './state.js';
import { CLASS_MAP } from './constants.js';

export let annCanvas = null, annCtx = null;

export function setupCanvas(container, img) {
    container.querySelectorAll('canvas').forEach(c => c.remove());
    state.imgDisplayW = img.offsetWidth;
    state.imgDisplayH = img.offsetHeight;

    annCanvas = document.createElement('canvas');
    annCanvas.width = state.imgDisplayW;
    annCanvas.height = state.imgDisplayH;
    annCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    container.appendChild(annCanvas);
    annCtx = annCanvas.getContext('2d');
}

export function redrawAnnotations() {
    if (!annCtx) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
    currentAnns().forEach(ann => {
        if (state.hiddenIds.has(ann.id) || state.hiddenCategories.has(ann.category)) return;
        const cls = CLASS_MAP[ann.category];
        const color = cls ? cls.color : '#14B8A6';
        const x = ann.bbox_x * state.imgDisplayW;
        const y = ann.bbox_y * state.imgDisplayH;
        const w = ann.bbox_w * state.imgDisplayW;
        const h = ann.bbox_h * state.imgDisplayH;
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

export function zoomIn() {
    state.zoomScale = Math.min(state.zoomScale + 0.25, 4);
    applyZoom();
}

export function zoomOut() {
    state.zoomScale = Math.max(state.zoomScale - 0.25, 0.5);
    applyZoom();
}

export function applyZoom() {
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(${state.panOffset.x}px, ${state.panOffset.y}px) scale(${state.zoomScale})`;
    
    const zoomEl = document.getElementById('zoomLevel');
    if (zoomEl) zoomEl.textContent = `${Math.round(state.zoomScale * 100)}%`;
}

export function selectAt(clientX, clientY) {
    const img = document.getElementById('mainImage');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const px = ((clientX - rect.left) / rect.width) * state.imgDisplayW;
    const py = ((clientY - rect.top) / rect.height) * state.imgDisplayH;

    const anns = currentAnns();
    for (let i = anns.length - 1; i >= 0; i--) {
        const a = anns[i];
        if (state.hiddenIds.has(a.id) || state.hiddenCategories.has(a.category)) continue;

        const x = a.bbox_x * state.imgDisplayW;
        const y = a.bbox_y * state.imgDisplayH;
        const w = a.bbox_w * state.imgDisplayW;
        const h = a.bbox_h * state.imgDisplayH;

        if (px >= x && px <= x + w && py >= y && py <= y + h) {
            state.selectedAnnId = a.id;
            redrawAnnotations();
            window.renderLabelList();
            
            setTimeout(() => {
                const activeEl = document.querySelector('.review-label-item.active');
                if (activeEl) {
                    activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }, 50);
            return;
        }
    }
    state.selectedAnnId = null;
    redrawAnnotations();
    window.renderLabelList();
}

export function initPanReview() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', _panStart, { passive: false });
    canvas.addEventListener('mousemove', _panMove, { passive: false });
    canvas.addEventListener('mouseup', _panEnd);
    canvas.addEventListener('mouseleave', _panEnd);
    canvas.style.cursor = state.currentTool === 'pan' ? 'grab' : 'default';
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
    const container = document.querySelector('.canvas-container');
    if (container) container.style.transform = `translate(${state.panOffset.x}px, ${state.panOffset.y}px) scale(${state.zoomScale})`;
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
    document.getElementById('brightnessVal').textContent = brightness + '%';
    document.getElementById('contrastVal').textContent = contrast + '%';
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
