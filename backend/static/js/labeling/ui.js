import { BASE_URL, CLASSES, CLASS_MAP, CAM_LABELS } from './constants.js';
import { state, getFrameAnns, currentAnns, getToken, taskId, currentUser } from './state.js';

const _imgCache = new Map();
const _IMG_CACHE_MAX = 20;

function _getCacheKey(frameId, cam) { return `${frameId}_${cam}`; }

function _cacheSet(key, url) {
    if (_imgCache.size >= _IMG_CACHE_MAX) {
        const firstKey = _imgCache.keys().next().value;
        URL.revokeObjectURL(_imgCache.get(firstKey));
        _imgCache.delete(firstKey);
    }
    _imgCache.set(key, url);
}

export function renderCamList(frame) {
    if (window._isSingleCam) {
        renderFrameStrip(frame);
        return;
    }
    const list = document.getElementById('camList');
    if (!list) return;
    list.innerHTML = state.CAMERAS.map((cam, i) => {
        const count = getFrameAnns(frame.id, cam).length;
        return `
        <div class="cam-row">
            <div class="cam-item ${cam === state.currentCamera ? 'active' : ''}" onclick="switchCamera('${cam}')">
                <img id="thumb_${cam}" src="" alt="${cam}" class="hidden">
                <div id="nodata_${cam}" style="display:none;position:absolute;inset:0;background:#E2E8F0;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none">
                    <i class="fa-solid fa-camera-slash" style="font-size:28px;color:#000"></i>
                    <div style="font-size:12px;font-weight:700;color:#000;text-align:center;line-height:1.3">Không có<br>dữ liệu</div>
                </div>
                <div class="cam-label">${CAM_LABELS[cam]}</div>
                ${count > 0 ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px">${count}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    state.CAMERAS.forEach(cam => loadThumb(frame, cam));
}

export function renderFrameStrip(currentFrame) {
    const list = document.getElementById('camList');
    if (!list) return;

    const STRIP_COUNT = 6;
    const half = Math.floor(STRIP_COUNT / 2);
    let startIdx = Math.max(0, state.currentFrameIdx - half);
    let endIdx = Math.min(state.frames.length - 1, startIdx + STRIP_COUNT - 1);
    startIdx = Math.max(0, endIdx - STRIP_COUNT + 1);

    list.innerHTML = state.frames.slice(startIdx, endIdx + 1).map((f, i) => {
        const idx = startIdx + i;
        const isActive = f.id === currentFrame.id;
        const count = getFrameAnns(f.id, 'CAM_FRONT').length;
        return `
        <div class="cam-row">
            <div class="cam-item ${isActive ? 'active' : ''}" onclick="goToFrame(${idx})">
                <img id="strip_thumb_${f.id}" src="" alt="frame${idx}" class="hidden">
                <div id="strip_nodata_${f.id}" style="display:none;position:absolute;inset:0;background:#E2E8F0;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none">
                    <i class="fa-solid fa-image" style="font-size:20px;color:#94A3B8"></i>
                </div>
                <div class="cam-label" style="font-size:9px">#${idx + 1}</div>
                ${count > 0 ? `<div style="position:absolute;top:4px;right:4px;background:#2563EB;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px">${count}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    state.frames.slice(startIdx, endIdx + 1).forEach(f => loadStripThumb(f));
}

export async function loadStripThumb(frame) {
    const img = document.getElementById(`strip_thumb_${frame.id}`);
    if (!img) return;
    const nodata = document.getElementById(`strip_nodata_${frame.id}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/thumb/CAM_FRONT?width=200`, {
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

export async function loadThumb(frame, cam) {
    const img = document.getElementById(`thumb_${cam}`);
    if (!img) return;
    const nodata = document.getElementById(`nodata_${cam}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/thumb/${cam}?width=200`, {
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

export function prefetchNextFrame(currentIdx) {
    const idxList = [currentIdx + 1, currentIdx + 2, currentIdx + 3, currentIdx - 1];
    idxList.forEach(idx => {
        if (idx < 0 || idx >= state.frames.length) return;
        const f = state.frames[idx];
        const key = _getCacheKey(f.id, state.currentCamera);
        if (_imgCache.has(key)) return;
        fetch(`${BASE_URL}/frames/${f.id}/image/${state.currentCamera}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        }).then(res => res.blob()).then(blob => {
            const url = URL.createObjectURL(blob);
            _cacheSet(key, url);
        }).catch(() => { });
    });
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
            
            const aiMark = ann.is_ai_generated ? ` <span style="font-size:10px;color:#9333EA">AI</span>` : '';
            const needsFlag = ann.needs_review === true;
            const flagMark = needsFlag ? ' <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px" title="Độ tin cậy thấp, cần kiểm tra"></i>' : '';
            const sel = ann.id === state.selectedAnnId;
            const hidden = ann.hidden || isCatHidden;
            return `
            <div class="label-item ${sel ? 'active' : ''}" onclick="selectAnn('${ann.id}')">
                <div class="label-info">
                    <div class="label-dot" style="background:${color};opacity:${hidden ? 0.3 : 1}"></div>
                    <div class="label-text">
                        <span class="label-name" style="opacity:${hidden ? 0.4 : 1};cursor:pointer${needsFlag ? ';border-left:3px solid #EF4444;padding-left:6px' : ''}"
                              ondblclick="renameAnn('${ann.id}');event.stopPropagation()"
                              title="Nhấp đúp để đổi tên">${label}${aiMark}${flagMark}</span>
                        <div class="label-actions">
                            <i class="${hidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}" 
                               title="${hidden ? 'Hiện nhãn' : 'Ẩn nhãn'}" 
                               onclick="toggleAnnVisibility('${ann.id}');event.stopPropagation()"></i>
                            <i class="fa-solid fa-tag" title="Đổi loại"
                               onclick="changeAnnCategory('${ann.id}');event.stopPropagation()"
                               style="color:#0891B2"></i>
                            <i class="fa-regular fa-trash-can" title="Xóa" onclick="deleteAnn('${ann.id}');event.stopPropagation()"></i>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        html += `</div>`;
    });

    list.innerHTML = html;
    renderAttentionList();
}

export function renderAttentionList() {
    const list = document.getElementById('attentionList');
    const countEl = document.getElementById('attentionCount');
    if (!list) return;

    const flagged = currentAnns().filter(ann => ann.needs_review === true);

    if (countEl) {
        if (flagged.length > 0) {
            countEl.textContent = flagged.length;
            countEl.style.display = 'inline-block';
        } else {
            countEl.style.display = 'none';
        }
    }

    if (!flagged.length) {
        list.innerHTML = '<div style="color:#94A3B8;font-size:13px;padding:8px 0">Không có nhãn nào cần chú ý.</div>';
        return;
    }

    list.innerHTML = flagged.map(ann => {
        const cls = CLASS_MAP[ann.category];
        const color = cls ? cls.color : '#14B8A6';
        const label = cls ? cls.name : ann.category;
        const conf = ann.confidence != null ? `${Math.round(ann.confidence * 100)}%` : '';
        const sel = ann.id === state.selectedAnnId;
        return `
        <div class="label-item ${sel ? 'active' : ''}" onclick="selectAnn('${ann.id}')" style="border-left:3px solid #EF4444">
            <div class="label-info">
                <div class="label-dot" style="background:${color}"></div>
                <div class="label-text">
                    <span class="label-name" style="cursor:pointer">
                        ${label} <i class="fa-solid fa-flag" style="color:#EF4444;font-size:10px"></i>
                        <span style="font-size:10px;color:#EF4444;margin-left:4px">${conf}</span>
                    </span>
                    <div class="label-actions">
                        <i class="fa-solid fa-check" title="Đánh dấu đã kiểm tra"
                           onclick="markReviewed('${ann.id}');event.stopPropagation()"
                           style="color:#10B981"></i>
                        <i class="fa-regular fa-trash-can" title="Xóa" onclick="deleteAnn('${ann.id}');event.stopPropagation()"></i>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
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
