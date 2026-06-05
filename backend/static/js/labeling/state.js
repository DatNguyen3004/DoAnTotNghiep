import { CLASSES } from './constants.js';

export const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');

export function getToken() {
    return localStorage.getItem('access_token');
}

const urlParams = new URLSearchParams(window.location.search);
export const taskId = urlParams.get('taskId');

export const state = {
    task: null,
    frames: [],
    currentFrameIdx: 0,
    currentCamera: 'CAM_FRONT',
    selectedClass: CLASSES[0].id,
    selectedAnnId: null,
    currentTool: 'pointer',
    collapsedCategories: {},
    annotations: {},
    sessionReviewedIds: new Set(),
    hiddenCategories: new Set(),
    
    // Cameras available (starts with default, updated dynamically)
    CAMERAS: ['CAM_FRONT', 'CAM_FRONT_LEFT', 'CAM_FRONT_RIGHT', 'CAM_BACK', 'CAM_BACK_LEFT', 'CAM_BACK_RIGHT'],

    // Drawing state
    isDrawing: false,
    drawStart: null,
    drawRect: null,

    // Dragging state
    isDragging: false,
    dragStart: null,
    dragAnn: null,

    // Resizing state
    resizeHandle: null,
    resizeAnn: null,
    resizeStart: null,

    // Zooming & Panning state
    zoomLevel: 100,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panOffset: { x: 0, y: 0 },

    // Timer state
    timerSeconds: 0,
    timerInterval: null,

    // Save state
    unsaved: false,
    autoSaveTimeout: null,
    modifiedFrameIds: new Set(),

    // Track state
    trackNames: {},
    trackCounters: {},
};

export function genId() {
    return 'a' + Math.random().toString(36).substr(2, 8);
}

export function getFrameAnns(fid, cam) {
    return state.annotations[fid]?.[cam] || [];
}

export function setFrameAnns(fid, cam, anns) {
    if (!state.annotations[fid]) state.annotations[fid] = {};
    state.annotations[fid][cam] = anns;
}

export function currentAnns() {
    const f = state.frames[state.currentFrameIdx];
    return f ? getFrameAnns(f.id, state.currentCamera) : [];
}

export function getTrackName(category, trackId) {
    return state.trackNames[`${category}_${trackId}`] || null;
}

export function setTrackName(category, trackId, name) {
    if (name) state.trackNames[`${category}_${trackId}`] = name;
    else delete state.trackNames[`${category}_${trackId}`];
}

export function getNextTrackId(category) {
    let maxId = 0;
    Object.values(state.annotations).forEach(fa => Object.values(fa).forEach(ca => ca.forEach(a => {
        if (a.category === category && a.track_id && a.track_id > maxId) maxId = a.track_id;
    })));
    state.trackCounters[category] = maxId + 1;
    return state.trackCounters[category];
}

export function initTrackCounters() {
    Object.keys(state.trackCounters).forEach(k => delete state.trackCounters[k]);
}

export function markUnsaved(frameId) {
    const fid = frameId !== undefined ? frameId : (state.frames[state.currentFrameIdx]?.id);
    if (fid) {
        state.modifiedFrameIds.add(fid);
    }
    state.unsaved = true;

    if (state.autoSaveTimeout) clearTimeout(state.autoSaveTimeout);

    const saveBtn = document.querySelector('.btn-submit');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tự động lưu...';
        saveBtn.style.background = '#F59E0B';
    }

    state.autoSaveTimeout = setTimeout(async () => {
        if (state.unsaved) {
            // This will trigger saveCurrentFrame via entry point or event listener import
            if (window._saveCurrentFrameFn) {
                await window._saveCurrentFrameFn(false);
                state.unsaved = false;
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Đã lưu';
                    saveBtn.style.background = '#10B981';
                    setTimeout(() => {
                        if (!state.unsaved) {
                            saveBtn.innerHTML = '<i class="bi bi-floppy2-fill"></i> Lưu';
                            saveBtn.style.background = '';
                        }
                    }, 1500);
                }
            }
        }
    }, 1500);
}
