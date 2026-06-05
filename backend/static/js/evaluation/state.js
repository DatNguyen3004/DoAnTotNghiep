export const state = {
    evaluationData: null,
    selectedFrameIdx: 0,
    selectedCamera: 'CAM_FRONT',
    zoomScale: 1.0,
    panOffset: { x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    annCanvas: null,
    annCtx: null,
    imgDisplayW: 1,
    imgDisplayH: 1,
    showAILabels: true,
    showUserLabels: true,
    selectedAnnId: null,
    currentTool: 'pointer',
    hiddenMatchedItems: new Map(),
    collapsedCategories: new Set(),
    selectedEvalStatusValue: null
};

const urlParams = new URLSearchParams(window.location.search);
export const taskId = urlParams.get('taskId');

export function getToken() {
    return localStorage.getItem('access_token');
}

export function resetMatchedState() {
    state.hiddenMatchedItems.clear();
}

export function getCurrentEntries(comp) {
    if (!comp) return [];
    const matched = comp.matched || [];
    const extra = comp.extra || [];
    const missing = comp.ai_boxes ? comp.ai_boxes.filter(box =>
        !matched.some(m => m.ai_box.id === box.id || (m.ai_box.bbox_x === box.bbox_x && m.ai_box.bbox_y === box.bbox_y))
    ) : [];

    let entries = [];
    if (state.showAILabels || state.showUserLabels) {
        matched.forEach(m => {
            entries.push({
                type: 'matched',
                id: m.user_box.id,
                category: m.user_box.category,
                trackId: m.user_box.track_id,
                iou: m.iou,
                user_box: m.user_box,
                ai_box: m.ai_box
            });
        });
    }
    if (state.showUserLabels) {
        extra.forEach(ex => {
            entries.push({
                type: 'extra',
                id: ex.id,
                category: ex.category,
                trackId: ex.track_id,
                iou: 0,
                user_box: ex,
                ai_box: null
            });
        });
    }
    if (state.showAILabels) {
        missing.forEach(mi => {
            entries.push({
                type: 'missing',
                id: mi.id,
                category: mi.category,
                trackId: mi.track_id,
                iou: 0,
                user_box: null,
                ai_box: mi
            });
        });
    }
    return entries;
}
