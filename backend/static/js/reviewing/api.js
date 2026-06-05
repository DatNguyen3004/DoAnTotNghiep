import { BASE_URL } from './constants.js';
import { state, taskId, getToken, currentUser, loadReviewsFromStorage } from './state.js';

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
            id: String(ann.id),
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
    loadReviewsFromStorage();
    state.frames.forEach(f => {
        if (!state.frameReviews[f.id]) state.frameReviews[f.id] = { status: null, feedback: '' };
    });
}

export async function submitReview() {
    const total = state.frames.length;
    const done = Object.values(state.frameReviews).filter(r => r.status !== null).length;
    if (done < total) {
        window.showConfirm(`Còn ${total - done} khung hình chưa đánh giá. Vẫn muốn nộp?`, () => _doSubmitReview(), { title: 'Xác nhận nộp', confirmText: 'Nộp', type: 'warning' });
        return;
    }
    _doSubmitReview();
}

async function _doSubmitReview() {
    const wrongFrames = state.frames.filter(f => state.frameReviews[f.id]?.status === 'wrong');
    const allFeedbacks = wrongFrames
        .map(f => {
            const frameNum = state.frames.indexOf(f) + 1;
            const desc = state.frameReviews[f.id]?.feedback?.trim() || 'Có lỗi cần sửa';
            return `Khung hình ${frameNum}: ${desc}`;
        })
        .join('\n');

    const btn = document.getElementById('btnDaKiemTra');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nộp...';

    const isAdmin = currentUser.role === 'admin';
    const redirectUrl = isAdmin ? '../Admin/dashboard.html' : 'dashboard.html';

    try {
        if (wrongFrames.length > 0) {
            const url = isAdmin
                ? `${BASE_URL}/tasks/${taskId}/admin/override`
                : `${BASE_URL}/tasks/${taskId}/review/reject`;
            const body = isAdmin
                ? { status: 'rejected', feedback: allFeedbacks }
                : { feedback: allFeedbacks };
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Lỗi');
            window.showToast('Đã gửi phản hồi về cho người gán nhãn', 'success');
            localStorage.removeItem(`review_${taskId}`);
            localStorage.removeItem(`review_frame_${taskId}`);
        } else {
            const url = isAdmin
                ? `${BASE_URL}/tasks/${taskId}/admin/override`
                : `${BASE_URL}/tasks/${taskId}/review/approve`;
            const body = isAdmin
                ? { status: 'approved' }
                : { reviewer_time_spent: state.timerSeconds };
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Lỗi');
            const msg = isAdmin ? 'Đã phê duyệt nhiệm vụ' : 'Đã xác nhận — nhiệm vụ chờ admin phê duyệt';
            window.showToast(msg, 'success');
            localStorage.removeItem(`review_${taskId}`);
            localStorage.removeItem(`review_frame_${taskId}`);
        }
        setTimeout(() => window.location.href = redirectUrl, 2000);
    } catch (e) {
        window.showToast(e.message || 'Lỗi kết nối', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã kiểm tra';
    }
}
