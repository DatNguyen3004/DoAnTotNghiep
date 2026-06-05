import { BASE_URL } from './constants.js';
import { state, taskId, getToken, currentUser, setFrameAnns, currentAnns, getFrameAnns, getTrackName, initTrackCounters, genId, markUnsaved } from './state.js';

export async function fetchTask() {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('Không thể tải nhiệm vụ');
    return await res.json();
}

export async function fetchFrames(sceneId) {
    const res = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('Không thể tải khung hình');
    return await res.json();
}

export async function fetchAllAnnotations() {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}/annotations`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(ann => {
        const fid = ann.frame_id;
        const cam = ann.camera;
        if (!state.annotations[fid]) state.annotations[fid] = {};
        if (!state.annotations[fid][cam]) state.annotations[fid][cam] = [];
        state.annotations[fid][cam].push({
            id: String(ann.id || genId()),
            category: ann.category,
            bbox_x: ann.bbox_x, bbox_y: ann.bbox_y,
            bbox_w: ann.bbox_w, bbox_h: ann.bbox_h,
            confidence: ann.confidence,
            is_ai_generated: ann.is_ai_generated || false,
            ai_bbox_x: ann.ai_bbox_x !== undefined ? ann.ai_bbox_x : null,
            ai_bbox_y: ann.ai_bbox_y !== undefined ? ann.ai_bbox_y : null,
            ai_bbox_w: ann.ai_bbox_w !== undefined ? ann.ai_bbox_w : null,
            ai_bbox_h: ann.ai_bbox_h !== undefined ? ann.ai_bbox_h : null,
            needs_review: ann.needs_review || false,
            hidden: false,
            track_id: ann.track_id || null,
            custom_name: ann.custom_name || null,
        });
    });
}

export async function saveCurrentFrame(showMsg = false) {
    const fids = Array.from(state.modifiedFrameIds);
    state.modifiedFrameIds.clear();

    if (fids.length === 0) {
        const frame = state.frames[state.currentFrameIdx];
        if (frame) fids.push(frame.id);
    }

    let hasError = false;
    for (const fid of fids) {
        const frame = state.frames.find(f => f.id === parseInt(fid));
        if (!frame) continue;
        const allAnns = [];
        state.CAMERAS.forEach(cam => {
            getFrameAnns(frame.id, cam).forEach(ann => {
                allAnns.push({
                    camera: cam,
                    category: ann.category,
                    bbox_x: ann.bbox_x, bbox_y: ann.bbox_y,
                    bbox_w: ann.bbox_w, bbox_h: ann.bbox_h,
                    confidence: ann.confidence,
                    is_ai_generated: ann.is_ai_generated || false,
                    ai_bbox_x: ann.ai_bbox_x !== undefined ? ann.ai_bbox_x : null,
                    ai_bbox_y: ann.ai_bbox_y !== undefined ? ann.ai_bbox_y : null,
                    ai_bbox_w: ann.ai_bbox_w !== undefined ? ann.ai_bbox_w : null,
                    ai_bbox_h: ann.ai_bbox_h !== undefined ? ann.ai_bbox_h : null,
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
        } catch (e) {
            hasError = true;
            state.modifiedFrameIds.add(fid); // Trả lại để lưu lại lần sau
        }
    }
    if (showMsg) {
        if (hasError) window.showToast('Lỗi lưu', 'error');
        else window.showToast('Đã lưu', 'success');
    }
}

export async function saveAnnotations(showMsg = true) {
    state.modifiedFrameIds.clear();
    const frameIds = Object.keys(state.annotations);
    for (const fid of frameIds) {
        const frame = state.frames.find(f => f.id === parseInt(fid));
        if (!frame) continue;
        const allAnns = [];
        state.CAMERAS.forEach(cam => {
            getFrameAnns(frame.id, cam).forEach(ann => {
                allAnns.push({
                    camera: cam,
                    category: ann.category,
                    bbox_x: ann.bbox_x, bbox_y: ann.bbox_y,
                    bbox_w: ann.bbox_w, bbox_h: ann.bbox_h,
                    confidence: ann.confidence,
                    is_ai_generated: ann.is_ai_generated || false,
                    ai_bbox_x: ann.ai_bbox_x !== undefined ? ann.ai_bbox_x : null,
                    ai_bbox_y: ann.ai_bbox_y !== undefined ? ann.ai_bbox_y : null,
                    ai_bbox_w: ann.ai_bbox_w !== undefined ? ann.ai_bbox_w : null,
                    ai_bbox_h: ann.ai_bbox_h !== undefined ? ann.ai_bbox_h : null,
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
    state.unsaved = false;
    localStorage.setItem(`lastFrame_${taskId}`, state.currentFrameIdx);
    
    // Nếu đến từ FrameList → đánh dấu frame này đã lưu
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo === 'FrameList') {
        const frameNum = state.currentFrameIdx + 1;
        localStorage.setItem(`framelist_saved_${taskId}_${frameNum}`, 'true');
    }
    if (showMsg) window.showToast('Đã lưu tất cả nhãn', 'success');
}

export async function submitTask() {
    if (state.task && state.task.status === 'rejected') {
        window.showToast('Vui lòng sửa từng khung hình qua danh sách khung hình rồi nộp lại', 'info');
        return;
    }

    let totalAnns = 0;
    Object.values(state.annotations).forEach(fa => Object.values(fa).forEach(ca => totalAnns += ca.length));

    if (totalAnns === 0) {
        window.showToast('Không thể nộp vì nhiệm vụ chưa có đối tượng nào đã được gán nhãn', 'error');
        return;
    }

    window.showConfirm('Nộp bài? Bài sẽ được giao cho người kiểm tra.', async () => {
        await saveAnnotations(false);

        const btn = document.getElementById('btnNop') || document.querySelector('.btn-phe-duyet');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang nộp...'; }

        try {
            const res = await fetch(`${BASE_URL}/tasks/${taskId}/submit`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ time_spent: state.timerSeconds })
            });
            if (res.ok) {
                clearInterval(state.timerInterval);
                localStorage.removeItem(`timer_${taskId}`);
                window.showToast('Nộp bài thành công!', 'success');
                setTimeout(() => window.location.href = 'dashboard.html', 1800);
            } else {
                const err = await res.json();
                window.showToast(err.detail || 'Lỗi nộp bài', 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Nộp'; }
            }
        } catch (e) {
            window.showToast('Lỗi kết nối', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Nộp'; }
        }
    }, { title: 'Nộp bài', confirmText: 'Nộp', type: 'info' });
}

export async function runAI() {
    const frame = state.frames[state.currentFrameIdx];
    if (!frame) return;
    const btn = document.querySelector('.btn-ai-auto');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang phân tích...</span>'; }

    const threshold = parseFloat(localStorage.getItem('ai_threshold') || '0.25');
    const reviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');

    try {
        const res = await fetch(`${BASE_URL}/ai/predict`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ frame_id: frame.id, camera: state.currentCamera, threshold })
        });
        if (!res.ok) { window.showToast('AI không khả dụng', 'error'); return; }
        const result = await res.json();
        const preds = result.predictions || [];
        if (!preds.length) { window.showToast('AI không phát hiện đối tượng', 'info'); return; }

        const existingManualAnns = currentAnns().filter(a => !a.is_ai_generated);
        const newAnns = [...existingManualAnns];

        preds.forEach(p => {
            let nextId = 1;
            while (newAnns.some(a => a.category === p.category && a.track_id === nextId)) {
                nextId++;
            }
            newAnns.push({
                id: genId(),
                category: p.category,
                track_id: nextId,
                bbox_x: p.bbox_x, bbox_y: p.bbox_y,
                bbox_w: p.bbox_w, bbox_h: p.bbox_h,
                confidence: p.confidence,
                is_ai_generated: true,
                ai_bbox_x: p.bbox_x,
                ai_bbox_y: p.bbox_y,
                ai_bbox_w: p.bbox_w,
                ai_bbox_h: p.bbox_h,
                needs_review: p.confidence < reviewThreshold,
                hidden: false,
                custom_name: null,
            });
        });
        setFrameAnns(frame.id, state.currentCamera, newAnns);
        window.redrawAnnotations();
        window.renderLabelList();
        window.updateCamBadge();
        markUnsaved();
        window.showToast(`AI phát hiện ${preds.length} đối tượng`, 'success');
    } catch (e) {
        window.showToast('Lỗi kết nối AI', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-robot"></i> <span>AI TỰ ĐỘNG GÁN NHÃN</span>'; }
    }
}

// Bind saveCurrentFrame function to window so state auto-save timeout can find it
window._saveCurrentFrameFn = saveCurrentFrame;
