import { BASE_URL, CLASSES, CLASS_MAP, CAM_LABELS } from './constants.js';
import { state, getFrameAnns, currentAnns, getToken, taskId, saveReviewsToStorage } from './state.js';

export async function loadThumb(frame, cam) {
    const img = document.getElementById(`thumb_${cam}`);
    if (!img) return;
    const nodata = document.getElementById(`nodata_${cam}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}?_=${Date.now()}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok || res.headers.get('X-No-Data') === '1') {
            img.classList.add('hidden');
            if (nodata) nodata.style.display = 'flex';
            return;
        }
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
        img.classList.remove('hidden');
        if (nodata) nodata.style.display = 'none';
    } catch (e) {
        img.classList.add('hidden');
        if (nodata) nodata.style.display = 'flex';
    }
}

export function renderCamList(frame) {
    const list = document.getElementById('camList');
    if (!list) return;
    list.innerHTML = state.CAMERAS.map(cam => {
        const anns = getFrameAnns(frame.id, cam);
        const active = cam === state.currentCamera;
        return `
        <div class="cam-row">
            <div class="cam-item ${active ? 'active' : ''}" onclick="switchCamera('${cam}')">
                <img id="thumb_${cam}" src="" style="width:100%;height:100%;object-fit:cover" class="hidden">
                <div id="nodata_${cam}" style="display:none;position:absolute;inset:0;background:#E2E8F0;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none">
                    <i class="fa-solid fa-camera-slash" style="font-size:28px;color:#000"></i>
                    <div style="font-size:12px;font-weight:700;color:#000;text-align:center;line-height:1.3">Không có<br>dữ liệu</div>
                </div>
                <div class="cam-label">${CAM_LABELS[cam] || cam}</div>
                ${anns.length ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">${anns.length}</div>` : ''}
            </div>
        </div>`;
    }).join('');
    
    state.CAMERAS.forEach(cam => loadThumb(frame, cam));
}

export function renderLabelList() {
    const list = document.getElementById('labelList');
    const badge = document.getElementById('labelsBadge');
    const anns = currentAnns();
    if (badge) badge.textContent = `${anns.length} NHÃN`;
    if (!list) return;
    if (!anns.length) {
        list.innerHTML = '<div style="color:#94A3B8;font-size:13px;padding:8px 0">Chưa có nhãn nào.</div>';
        return;
    }

    const grouped = {};
    CLASSES.forEach(c => grouped[c.id] = []);
    anns.forEach(ann => {
        if (!grouped[ann.category]) {
            grouped[ann.category] = [];
        }
        grouped[ann.category].push(ann);
    });

    let html = '';
    CLASSES.forEach(cls => {
        const groupAnns = grouped[cls.id] || [];
        if (groupAnns.length === 0) return;

        const isCollapsed = state.collapsedCategories[cls.id] || false;
        const isCatHidden = state.hiddenCategories.has(cls.id);
        
        html += `
        <div class="category-group-header" onclick="toggleCategoryCollapse('${cls.id}')" 
             style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin:8px 0 4px 0;cursor:pointer;background:#F1F5F9;border-radius:8px;user-select:none;transition:background 0.2s">
            <div style="display:flex;align-items:center;gap:8px">
                <i class="fa-solid ${cls.icon}" style="color:${cls.color};font-size:13px"></i>
                <span style="font-weight:700;font-size:13px;color:#1E293B">${cls.name}</span>
                <span style="background:${cls.color}15;color:${cls.color};font-size:11px;font-weight:700;padding:1px 6px;border-radius:10px">${groupAnns.length}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px" onclick="event.stopPropagation()">
                <i class="${isCatHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}" 
                   style="color:#64748B;cursor:pointer;font-size:13px" 
                   title="${isCatHidden ? 'Hiện nhóm nhãn' : 'Ẩn nhóm nhãn'}"
                   onclick="toggleCategoryHide('${cls.id}');event.stopPropagation()"></i>
                <i class="fa-solid fa-chevron-down" style="font-size:11px;color:#64748B;transition:transform 0.2s;${isCollapsed ? 'transform:rotate(-90deg)' : ''}" onclick="toggleCategoryCollapse('${cls.id}');event.stopPropagation()"></i>
            </div>
        </div>
        <div class="category-group-content" style="${isCollapsed ? 'display:none' : ''}">
        `;

        html += groupAnns.map((ann) => {
            const color = cls.color;
            const trackNum = ann.track_id ? String(ann.track_id).padStart(2, '0') : '??';
            const label = ann.custom_name ? `${trackNum} - ${ann.custom_name}` : `${trackNum}`;
            const isAnnHidden = state.hiddenIds.has(ann.id);
            const hidden = isAnnHidden || isCatHidden;
            const sel = ann.id === state.selectedAnnId;
            const flagMark = ann.needs_review
                ? ' <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px"></i>' : '';
            
            let similarityText = '';
            if (ann.is_ai_generated && ann.ai_bbox_x !== null && ann.ai_bbox_x !== undefined) {
                const ax1 = ann.ai_bbox_x, ay1 = ann.ai_bbox_y, ax2 = ann.ai_bbox_x + ann.ai_bbox_w, ay2 = ann.ai_bbox_y + ann.ai_bbox_h;
                const bx1 = ann.bbox_x, by1 = ann.bbox_y, bx2 = ann.bbox_x + ann.bbox_w, by2 = ann.bbox_y + ann.bbox_h;
                const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
                const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
                let iou = 0;
                if (ix2 > ix1 && iy2 > iy1) {
                    const inter = (ix2 - ix1) * (iy2 - iy1);
                    const union = ann.ai_bbox_w * ann.ai_bbox_h + ann.bbox_w * ann.bbox_h - inter;
                    iou = union > 0 ? inter / union : 0;
                }
                similarityText = ` (${Math.round(iou * 100)}%)`;
            }
            const aiMark = ann.is_ai_generated
                ? ` <span style="font-size:10px;color:#9333EA">AI${similarityText}</span>` : '';
            return `
            <div class="review-label-item ${sel ? 'active' : ''}" onclick="selectAnn('${ann.id}')">
                <div class="label-info">
                    <div class="label-dot" style="background:${color};opacity:${hidden ? 0.3 : 1}"></div>
                    <div class="label-text">
                        <span class="label-name" style="opacity:${hidden ? 0.4 : 1}">${label}${aiMark}${flagMark}</span>
                    </div>
                </div>
                <i class="${isAnnHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}"
                   style="color:#94A3B8;cursor:pointer;font-size:13px;opacity:${isCatHidden ? 0.4 : 1};pointer-events:${isCatHidden ? 'none' : 'auto'}"
                   title="${isAnnHidden ? 'Hiện nhãn' : 'Ẩn nhãn'}"
                   onclick="toggleHide('${ann.id}');event.stopPropagation()"></i>
            </div>`;
        }).join('');

        html += `</div>`;
    });

    list.innerHTML = html;
}

export function openTaskInfo() {
    const modal = document.getElementById('modalTaskInfo');
    if (!modal || !state.task) return;
    document.getElementById('infoProjectName').textContent = state.task.scene_name || `Nhiệm vụ #${state.task.id}`;
    document.getElementById('infoTaskName').textContent = state.task.scene_description || 'Không có mô tả';
    document.getElementById('infoLabeler').textContent = state.task.assigned_user
        ? (state.task.assigned_user.username + (state.task.assigned_user.full_name ? ' — ' + state.task.assigned_user.full_name : ''))
        : '—';
    document.getElementById('infoReviewer').textContent = state.task.reviewer_user
        ? (state.task.reviewer_user.username + (state.task.reviewer_user.full_name ? ' — ' + state.task.reviewer_user.full_name : ''))
        : 'Chưa phân công';
    modal.style.display = 'flex';
}

export function loadFrameReviewState() {
    const frame = state.frames[state.currentFrameIdx];
    if (!frame) return;
    const review = state.frameReviews[frame.id] || { status: null, feedback: '' };
    document.getElementById('frameFeedback').value = review.feedback || '';
    updateFrameStatusBadge(review.status);
    updateActionButtons(review.status);
}

export function saveFeedbackToState() {
    const frame = state.frames[state.currentFrameIdx];
    if (!frame) return;
    if (!state.frameReviews[frame.id]) state.frameReviews[frame.id] = { status: null, feedback: '' };
    state.frameReviews[frame.id].feedback = document.getElementById('frameFeedback').value;
    saveReviewsToStorage();
}

export function markFrame(status) {
    const frame = state.frames[state.currentFrameIdx];
    if (!frame) return;
    if (!state.frameReviews[frame.id]) state.frameReviews[frame.id] = { status: null, feedback: '' };

    state.frameReviews[frame.id].status = status;
    state.frameReviews[frame.id].feedback = document.getElementById('frameFeedback').value;

    saveReviewsToStorage();
    localStorage.setItem(`review_frame_${taskId}`, state.currentFrameIdx);

    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo === 'FrameList') {
        const frameNum = state.currentFrameIdx + 1;
        localStorage.setItem(`framelist_saved_${taskId}_${frameNum}`, 'true');
        try {
            const reviewKey = `framelist_review_${taskId}`;
            const rs = JSON.parse(localStorage.getItem(reviewKey) || '{}');
            rs[frameNum] = status;
            const fb = document.getElementById('frameFeedback').value.trim();
            if (fb) rs['fb_' + frameNum] = fb;
            else delete rs['fb_' + frameNum];
            localStorage.setItem(reviewKey, JSON.stringify(rs));
        } catch(e) {}
    }

    updateFrameStatusBadge(status);
    updateActionButtons(status);
    updateProgress();
}

export function updateFrameStatusBadge(status) {
    const badge = document.getElementById('frameStatusBadge');
    if (!badge) return;
    if (status === 'correct') {
        badge.className = 'frame-status correct';
        badge.innerHTML = '<i class="fa-solid fa-check"></i> Đúng';
    } else if (status === 'wrong') {
        badge.className = 'frame-status wrong';
        badge.innerHTML = '<i class="fa-solid fa-xmark"></i> Sai';
    } else {
        badge.className = 'frame-status pending';
        badge.innerHTML = 'Chưa đánh giá';
    }
}

export function updateActionButtons(status) {
    const btnC = document.getElementById('btnCorrect');
    const btnW = document.getElementById('btnWrong');
    if (btnC) btnC.style.opacity = status === 'correct' ? '1' : (status === 'wrong' ? '0.4' : '1');
    if (btnW) btnW.style.opacity = status === 'wrong' ? '1' : (status === 'correct' ? '0.4' : '1');
    if (btnC) btnC.style.transform = status === 'correct' ? 'scale(1.03)' : '';
    if (btnW) btnW.style.transform = status === 'wrong' ? 'scale(1.03)' : '';
}

export function updateProgress() {
    const total = state.frames.length;
    const done = Object.values(state.frameReviews).filter(r => r.status !== null).length;
    
    const progText = document.getElementById('progressText');
    if (progText) progText.textContent = `${done} / ${total} khung hình`;
    
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = `${total ? (done / total * 100) : 0}%`;
}
