import { CLASSES } from './constants.js';

export const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');

export function getToken() {
    return localStorage.getItem('access_token');
}

const urlParams = new URLSearchParams(window.location.search);
export const taskId = urlParams.get('taskId');
export const reviewMode = urlParams.get('mode') === 'review';

export const state = {
    task: null,
    frames: [],
    currentFrameIdx: 0,
    currentCamera: 'CAM_FRONT',
    annotations: {},
    hiddenIds: new Set(),
    hiddenCategories: new Set(),
    selectedAnnId: null,
    collapsedCategories: {},
    frameReviews: {},
    
    // Cameras available
    CAMERAS: ['CAM_FRONT', 'CAM_FRONT_LEFT', 'CAM_FRONT_RIGHT', 'CAM_BACK', 'CAM_BACK_LEFT', 'CAM_BACK_RIGHT'],

    // Zoom & Pan state
    zoomScale: 1,
    currentTool: 'pointer',
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panOffset: { x: 0, y: 0 },

    // Timer state
    timerSeconds: 0,
    timerInterval: null,

    // Image layout dimensions
    imgDisplayW: 1,
    imgDisplayH: 1,
};

export function saveReviewsToStorage() {
    localStorage.setItem(`review_${taskId}`, JSON.stringify(state.frameReviews));
}

export function loadReviewsFromStorage() {
    try {
        const saved = localStorage.getItem(`review_${taskId}`);
        if (saved) state.frameReviews = JSON.parse(saved);
    } catch (e) {
        state.frameReviews = {};
    }
}

export function getFrameAnns(fid, cam) {
    return state.annotations[fid]?.[cam] || [];
}

export function currentAnns() {
    const f = state.frames[state.currentFrameIdx];
    return f ? getFrameAnns(f.id, state.currentCamera) : [];
}
