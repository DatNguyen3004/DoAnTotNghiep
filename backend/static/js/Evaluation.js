const BASE_URL = '/api';
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');

if (!taskId) {
    window.location.href = 'dashboard.html';
}

// Categories map
const CLASSES = [
    { id: 'vehicle.car', name: 'Xe con', icon: 'fa-car', color: '#3B82F6' },
    { id: 'vehicle.truck', name: 'Xe tải', icon: 'fa-truck', color: '#F59E0B' },
    { id: 'vehicle.bus', name: 'Xe buýt', icon: 'fa-bus', color: '#8B5CF6' },
    { id: 'vehicle.motorcycle', name: 'Xe máy', icon: 'fa-motorcycle', color: '#EC4899' },
    { id: 'vehicle.bicycle', name: 'Xe đạp', icon: 'fa-bicycle', color: '#F97316' },
    { id: 'human.pedestrian', name: 'Người đi bộ', icon: 'fa-person-walking', color: '#10B981' },
];
const CLASS_MAP = {};
CLASSES.forEach(c => CLASS_MAP[c.id] = c);

const CAMERAS = ['CAM_FRONT', 'CAM_FRONT_LEFT', 'CAM_FRONT_RIGHT', 'CAM_BACK', 'CAM_BACK_LEFT', 'CAM_BACK_RIGHT'];
const CAM_LABELS = {
    CAM_FRONT: 'Cam trước',
    CAM_FRONT_LEFT: 'Cam trái trước',
    CAM_FRONT_RIGHT: 'Cam phải trước',
    CAM_BACK: 'Cam sau',
    CAM_BACK_LEFT: 'Cam trái sau',
    CAM_BACK_RIGHT: 'Cam phải sau',
};

// State variables
let evaluationData = null;
let selectedFrameIdx = 0;
let selectedCamera = 'CAM_FRONT';
let zoomScale = 1.0;
let panOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

let annCanvas = null;
let annCtx = null;
let imgDisplayW = 1;
let imgDisplayH = 1;

let showAILabels = true;
let showUserLabels = true;

function toggleAI() {
    if (showAILabels && !showUserLabels) {
        showAILabels = true;
        showUserLabels = true;
    } else {
        showAILabels = true;
        showUserLabels = false;
    }
    updateLabelTogglesUI();
    redrawAnnotations();
}

function toggleUser() {
    if (showUserLabels && !showAILabels) {
        showAILabels = true;
        showUserLabels = true;
    } else {
        showAILabels = false;
        showUserLabels = true;
    }
    updateLabelTogglesUI();
    redrawAnnotations();
}

function updateLabelTogglesUI() {
    const btnAI = document.getElementById('btnToggleAI');
    const btnUser = document.getElementById('btnToggleUser');
    if (btnAI) {
        if (showAILabels) {
            btnAI.style.background = '#EEF2FF';
            btnAI.style.color = '#4F46E5';
            btnAI.style.border = '1px solid #E0E7FF';
        } else {
            btnAI.style.background = '#F1F5F9';
            btnAI.style.color = '#94A3B8';
            btnAI.style.border = '1px solid #E2E8F0';
        }
    }
    if (btnUser) {
        if (showUserLabels) {
            btnUser.style.background = '#ECFDF5';
            btnUser.style.color = '#059669';
            btnUser.style.border = '1px solid #D1FAE5';
        } else {
            btnUser.style.background = '#F1F5F9';
            btnUser.style.color = '#94A3B8';
            btnUser.style.border = '1px solid #E2E8F0';
        }
    }
}

function getToken() {
    return localStorage.getItem('access_token');
}

// Initialize Page
async function initPage() {
    updateLabelTogglesUI();
    try {
        // Fetch evaluation details
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/evaluation-details`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) {
            if (res.status === 403) {
                alert('Bạn không có quyền truy cập trang này.');
                window.location.href = '/static/login.html';
                return;
            }
            throw new Error('Không thể tải thông tin đối chiếu');
        }
        evaluationData = await res.json();

        // Assign a unique client-side ID to each AI box
        let aiBoxIdCounter = 1000000;
        if (evaluationData && evaluationData.frames) {
            evaluationData.frames.forEach(frame => {
                if (frame.comparison) {
                    Object.keys(frame.comparison).forEach(cam => {
                        const comp = frame.comparison[cam];
                        if (comp) {
                            if (comp.ai_boxes) {
                                comp.ai_boxes.forEach(box => {
                                    box.id = `ai_${aiBoxIdCounter++}`;
                                });
                            }
                            if (comp.matched) {
                                comp.matched.forEach(m => {
                                    if (m.ai_box) {
                                        const matchingAiBox = comp.ai_boxes ? comp.ai_boxes.find(b =>
                                            b.bbox_x === m.ai_box.bbox_x && b.bbox_y === m.ai_box.bbox_y
                                        ) : null;
                                        if (matchingAiBox) {
                                            m.ai_box.id = matchingAiBox.id;
                                        } else {
                                            m.ai_box.id = `ai_${aiBoxIdCounter++}`;
                                        }
                                    }
                                });
                            }
                        }
                    });
                }
            });
        }


        // Setup user avatar placeholder
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            avatar.textContent = 'AD';
        }

        // Go to first frame
        if (evaluationData.frames.length > 0) {
            await selectFrame(0);
        }

    } catch (err) {
        console.error(err);
        alert(err.message || 'Có lỗi xảy ra khi tải trang.');
    }
}

// Frame Navigation Actions
function firstFrame() {
    if (selectedFrameIdx > 0) {
        selectFrame(0);
    }
}

// Open Statistics and Evaluation dialog
document.getElementById('btnNop')?.addEventListener('click', () => {
    // Open the statistics popup or call the statistics handler
    if (typeof openEvaluationStats === 'function') {
        openEvaluationStats();
    } else {
        // Standard action if not defined: open modal or alert
        alert('Chức năng thống kê đang được tải.');
    }
});

function lastFrame() {
    if (selectedFrameIdx < evaluationData.frames.length - 1) {
        selectFrame(evaluationData.frames.length - 1);
    }
}

function prevFrame() {
    if (selectedFrameIdx > 0) {
        selectFrame(selectedFrameIdx - 1);
    }
}

function nextFrame() {
    if (selectedFrameIdx < evaluationData.frames.length - 1) {
        selectFrame(selectedFrameIdx + 1);
    }
}

// Select active frame
async function selectFrame(idx) {
    selectedFrameIdx = idx;
    const frame = evaluationData.frames[idx];

    // Update toolbar indicator
    document.getElementById('frameIndicator').textContent = `${idx + 1}`;

    // Keep selectedCamera if available, else pick first camera
    if (frame.cameras.length > 0) {
        if (!frame.cameras.includes(selectedCamera)) {
            selectedCamera = frame.cameras[0];
        }
        // Render camera list panel on the left
        renderCamList();
        // Refresh image and annotations
        await loadComparisonImages();
    } else {
        alert('Không có dữ liệu camera cho khung hình này');
    }
}

// Render vertical camera thumbnails list on the left side
function renderCamList() {
    const list = document.getElementById('camList');
    const frame = evaluationData.frames[selectedFrameIdx];

    list.innerHTML = CAMERAS.map(cam => {
        const hasData = frame.cameras.includes(cam);
        const active = cam === selectedCamera;

        return `
        <div class="cam-row">
            <div class="cam-item ${active ? 'active' : ''}" ${hasData ? `onclick="selectCamera('${cam}')"` : ''}>
                <img id="thumb_${cam}" src="" class="hidden">
                <div id="nodata_${cam}" class="cam-nodata" style="display:${hasData ? 'none' : 'flex'}">
                    <i class="fa-solid fa-camera-slash"></i>
                    <span>Không có</span>
                </div>
                <div class="cam-label">${CAM_LABELS[cam] || cam}</div>
            </div>
        </div>`;
    }).join('');

    // Load thumbnails for active cams
    CAMERAS.forEach(cam => {
        if (frame.cameras.includes(cam)) {
            loadThumb(frame, cam);
        }
    });
}

async function loadThumb(frame, cam) {
    const img = document.getElementById(`thumb_${cam}`);
    if (!img) return;
    const nodata = document.getElementById(`nodata_${cam}`);
    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${cam}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) {
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

// Select camera
async function selectCamera(cam) {
    selectedCamera = cam;
    renderCamList();
    await loadComparisonImages();
}

// Load images for current frame and camera
async function loadComparisonImages() {
    const frame = evaluationData.frames[selectedFrameIdx];
    const mainImg = document.getElementById('mainImage');

    // Reset zoom offset and filter on camera change
    resetZoom();

    mainImg.src = '';
    mainImg.style.display = 'none';

    // Render matched labels for current frame/camera
    renderMatchedLabels();

    try {
        const res = await fetch(`${BASE_URL}/frames/${frame.id}/image/${selectedCamera}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error('Không tải được ảnh');

        const blob = await res.blob();
        mainImg.src = URL.createObjectURL(blob);
        mainImg.style.display = 'block';

        mainImg.onload = () => {
            const container = document.querySelector('.canvas-container');
            setupCanvas(container, mainImg);
            redrawAnnotations();
        };
    } catch (err) {
        console.error(err);
    }
}

function setupCanvas(container, img) {
    // Remove old canvas
    container.querySelectorAll('canvas').forEach(c => c.remove());

    imgDisplayW = img.clientWidth;
    imgDisplayH = img.clientHeight;

    annCanvas = document.createElement('canvas');
    annCanvas.width = imgDisplayW;
    annCanvas.height = imgDisplayH;
    annCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    container.appendChild(annCanvas);
    annCtx = annCanvas.getContext('2d');
}

// Render matched labels panel on the right side
function renderMatchedLabels() {
    const list = document.getElementById('matchedLabelList');
    const countBadge = document.getElementById('matchedLabelCount');
    if (!list || !evaluationData) return;

    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;

    const comp = frame.comparison[selectedCamera];
    const matched = comp ? comp.matched : [];

    countBadge.textContent = matched.length;

    if (matched.length === 0) {
        list.innerHTML = `<div style="color:#94A3B8;font-size:12px;text-align:center;padding:20px 0;">
            <i class="fa-solid fa-magnifying-glass" style="display:block;font-size:18px;margin-bottom:6px;"></i>
            Không có nhãn trùng khớp
        </div>`;
        return;
    }

    list.innerHTML = matched.map((m, idx) => {
        const u = m.user_box;
        const ai = m.ai_box;
        const iou = m.iou;
        const cls = CLASS_MAP[u.category] || { name: u.category, color: '#94A3B8', icon: 'fa-tag' };

        // IoU-based similarity color
        const pct = Math.round(iou * 100);
        let barColor, iouTextColor;
        if (pct >= 75) { barColor = '#10B981'; iouTextColor = '#065F46'; }
        else if (pct >= 50) { barColor = '#F59E0B'; iouTextColor = '#92400E'; }
        else { barColor = '#EF4444'; iouTextColor = '#7F1D1D'; }

        const label = u.custom_name
            ? `${cls.name} — ${u.custom_name}`
            : cls.name;

        return `
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px;cursor:pointer;transition:border-color 0.15s;"
             onmouseover="this.style.borderColor='${cls.color}'" onmouseout="this.style.borderColor='#E2E8F0'"
             onclick="selectedAnnId=${u.id};redrawAnnotations();">
            <!-- Header row: icon + label name + IoU badge -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
                <i class="fa-solid ${cls.icon}" style="color:${cls.color};font-size:12px;flex-shrink:0;"></i>
                <span style="font-size:12px;font-weight:700;color:#1E293B;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</span>
                <span style="font-size:11px;font-weight:800;color:${iouTextColor};background:${barColor}22;border:1px solid ${barColor}55;border-radius:6px;padding:1px 6px;flex-shrink:0;">${pct}%</span>
            </div>
            <!-- Progress bar -->
            <div style="height:4px;background:#E2E8F0;border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px;transition:width 0.4s;"></div>
            </div>
            <!-- Sub-info -->
            <div style="display:flex;justify-content:space-between;margin-top:4px;">
                <span style="font-size:10px;color:#94A3B8;">AI gốc</span>
                <span style="font-size:10px;color:#94A3B8;">Tỉ lệ IoU</span>
                <span style="font-size:10px;color:#94A3B8;">Người dùng</span>
            </div>
        </div>`;
    }).join('');
}

// Canvas Redrawing logic
let selectedAnnId = null;
let currentTool = 'pointer';

// Per-item AI/User visibility overrides for matched pairs. Key = user_box.id
// { hideAI: bool, hideUser: bool }
let hiddenMatchedItems = new Map();
let collapsedCategories = new Set();

function resetMatchedState() {
    hiddenMatchedItems.clear();
    // keep collapsed state across camera/frame switches
}

function toggleMatchedAI(userId, event) {
    event.stopPropagation();
    const cur = hiddenMatchedItems.get(userId) || { hideAI: false, hideUser: false };
    if (!cur.hideAI && cur.hideUser) {
        hiddenMatchedItems.set(userId, { hideAI: false, hideUser: false });
    } else {
        hiddenMatchedItems.set(userId, { hideAI: false, hideUser: true });
    }
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleMatchedUser(userId, event) {
    event.stopPropagation();
    const cur = hiddenMatchedItems.get(userId) || { hideAI: false, hideUser: false };
    if (cur.hideAI && !cur.hideUser) {
        hiddenMatchedItems.set(userId, { hideAI: false, hideUser: false });
    } else {
        hiddenMatchedItems.set(userId, { hideAI: true, hideUser: false });
    }
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleMatchedVisibility(userId, event) {
    event.stopPropagation();
    const cur = hiddenMatchedItems.get(userId) || { hideAI: false, hideUser: false };
    const currentlyHidden = cur.hideAI && cur.hideUser;
    hiddenMatchedItems.set(userId, { hideAI: !currentlyHidden, hideUser: !currentlyHidden });
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleCategory(cat, event) {
    event.stopPropagation();
    if (collapsedCategories.has(cat)) collapsedCategories.delete(cat);
    else collapsedCategories.add(cat);
    renderMatchedLabels();
}

function toggleCategoryVisibility(cat, event) {
    event.stopPropagation();
    if (!evaluationData) return;
    const comp = evaluationData.frames[selectedFrameIdx]?.comparison[selectedCamera];
    if (!comp) return;
    const items = comp.matched.filter(m => m.user_box.category === cat);
    const allHidden = items.every(m => {
        const o = hiddenMatchedItems.get(m.user_box.id) || {};
        return o.hideAI && o.hideUser;
    });
    items.forEach(m => {
        hiddenMatchedItems.set(m.user_box.id, { hideAI: !allHidden, hideUser: !allHidden });
    });
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleCategoryAI(cat, event) {
    event.stopPropagation();
    if (!evaluationData) return;
    const comp = evaluationData.frames[selectedFrameIdx]?.comparison[selectedCamera];
    if (!comp) return;
    const items = comp.matched.filter(m => m.user_box.category === cat);
    if (items.length === 0) return;

    const allShowOnlyAI = items.every(m => {
        const o = hiddenMatchedItems.get(m.user_box.id) || { hideAI: false, hideUser: false };
        return !o.hideAI && o.hideUser;
    });

    items.forEach(m => {
        if (allShowOnlyAI) {
            hiddenMatchedItems.set(m.user_box.id, { hideAI: false, hideUser: false });
        } else {
            hiddenMatchedItems.set(m.user_box.id, { hideAI: false, hideUser: true });
        }
    });

    renderMatchedLabels();
    redrawAnnotations();
}

function toggleCategoryUser(cat, event) {
    event.stopPropagation();
    if (!evaluationData) return;
    const comp = evaluationData.frames[selectedFrameIdx]?.comparison[selectedCamera];
    if (!comp) return;
    const items = comp.matched.filter(m => m.user_box.category === cat);
    if (items.length === 0) return;

    const allShowOnlyUser = items.every(m => {
        const o = hiddenMatchedItems.get(m.user_box.id) || { hideAI: false, hideUser: false };
        return o.hideAI && !o.hideUser;
    });

    items.forEach(m => {
        if (allShowOnlyUser) {
            hiddenMatchedItems.set(m.user_box.id, { hideAI: false, hideUser: false });
        } else {
            hiddenMatchedItems.set(m.user_box.id, { hideAI: true, hideUser: false });
        }
    });

    renderMatchedLabels();
    redrawAnnotations();
}

// Render matched labels panel on the right side
function renderMatchedLabels() {
    renderFrameSimilarityCharts();

    const list = document.getElementById('matchedLabelList');
    const countBadge = document.getElementById('matchedLabelCount');
    if (!list || !evaluationData) return;

    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera];
    const matched = comp ? comp.matched : [];

    countBadge.textContent = matched.length;

    if (matched.length === 0) {
        list.innerHTML = `<div style="color:#94A3B8;font-size:12px;text-align:center;padding:20px 0;"><i class="fa-solid fa-magnifying-glass" style="display:block;font-size:18px;margin-bottom:6px;"></i>Không có nhãn trùng khớp</div>`;
        return;
    }

    // Group by category
    const groups = {};
    matched.forEach(m => {
        const cat = m.user_box.category;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(m);
    });

    list.innerHTML = Object.entries(groups).map(([cat, items]) => {
        const cls = CLASS_MAP[cat] || { name: cat, color: '#94A3B8', icon: 'fa-tag' };
        const isCollapsed = collapsedCategories.has(cat);
        const allAIHidden = items.every(m => {
            const o = hiddenMatchedItems.get(m.user_box.id) || {};
            return o.hideAI;
        });
        const allUserHidden = items.every(m => {
            const o = hiddenMatchedItems.get(m.user_box.id) || {};
            return o.hideUser;
        });
        const allHidden = items.every(m => {
            const o = hiddenMatchedItems.get(m.user_box.id) || {};
            return o.hideAI && o.hideUser;
        });

        const itemsHtml = items.map((m, i) => {
            const u = m.user_box;
            const pct = Math.round(m.iou * 100);
            const trackId = u.track_id != null ? String(u.track_id).padStart(2, '0') : String(i + 1).padStart(2, '0');
            const isSel = selectedAnnId === u.id;
            const ov = hiddenMatchedItems.get(u.id) || { hideAI: false, hideUser: false };
            const isRowHidden = ov.hideAI && ov.hideUser;

            let barColor = pct >= 75 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';

            return `<div onclick="selectedAnnId=${u.id};redrawAnnotations();renderMatchedLabels();"
                style="display:flex;align-items:center;gap:5px;padding:5px 6px;cursor:pointer;
                       border-left:3px solid ${isSel ? '#4F46E5' : 'transparent'};
                       background:${isSel ? '#EEF2FF' : 'transparent'};
                       border-radius:0 6px 6px 0;transition:all 0.15s;margin-bottom:2px;">
                <div style="width:7px;height:7px;border-radius:50%;background:${cls.color};flex-shrink:0;"></div>
                <span style="font-size:12px;font-weight:800;color:#1E293B;min-width:22px;">${trackId}</span>
                <div style="flex:1;display:flex;align-items:center;gap:4px;">
                    <div style="flex:1;height:4px;background:#E2E8F0;border-radius:2px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px;"></div>
                    </div>
                    <span style="font-size:10px;font-weight:700;color:${barColor};min-width:28px;text-align:right;">${pct}%</span>
                </div>
                <button onclick="toggleMatchedAI(${u.id},event)" title="${ov.hideAI ? 'Hiện nhãn AI' : 'Ẩn nhãn AI'}"
                    style="width:20px;height:20px;border-radius:4px;border:1px solid ${ov.hideAI ? '#E2E8F0' : '#E0E7FF'};
                           background:${ov.hideAI ? '#F1F5F9' : '#EEF2FF'};color:${ov.hideAI ? '#CBD5E1' : '#4F46E5'};
                           font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;">
                    <i class="fa-solid fa-robot"></i>
                </button>
                <button onclick="toggleMatchedUser(${u.id},event)" title="${ov.hideUser ? 'Hiện nhãn người dùng' : 'Ẩn nhãn người dùng'}"
                    style="width:20px;height:20px;border-radius:4px;border:1px solid ${ov.hideUser ? '#E2E8F0' : '#D1FAE5'};
                           background:${ov.hideUser ? '#F1F5F9' : '#ECFDF5'};color:${ov.hideUser ? '#CBD5E1' : '#059669'};
                           font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;">
                    <i class="fa-solid fa-user"></i>
                </button>
                <button onclick="toggleMatchedVisibility(${u.id},event)" title="${isRowHidden ? 'Hiện tất cả nhãn' : 'Ẩn tất cả nhãn'}"
                    style="width:20px;height:20px;border:none;background:none;color:${isRowHidden ? '#CBD5E1' : '#94A3B8'};cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;margin-left:2px;">
                    <i class="fa-${isRowHidden ? 'regular' : 'solid'} fa-eye${isRowHidden ? '-slash' : ''}"></i>
                </button>
            </div>`;
        }).join('');

        return `<div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:6px;">
            <div onclick="toggleCategory('${cat}',event)"
                 style="display:flex;align-items:center;gap:6px;padding:7px 10px;cursor:pointer;background:#F8FAFC;border-bottom:${isCollapsed ? 'none' : '1px solid #E2E8F0'};">
                <i class="fa-solid ${cls.icon}" style="color:${cls.color};font-size:12px;flex-shrink:0;"></i>
                <span style="font-size:12px;font-weight:700;color:#1E293B;flex:1;">${cls.name}</span>
                <span style="font-size:10px;font-weight:800;color:#fff;background:#4F46E5;border-radius:9px;padding:1px 6px;">${items.length}</span>
                <button onclick="toggleCategoryAI('${cat}',event)" title="${allAIHidden ? 'Hiện tất cả nhãn AI' : 'Ẩn tất cả nhãn AI'}"
                    style="width:20px;height:20px;border-radius:4px;border:1px solid ${allAIHidden ? '#E2E8F0' : '#E0E7FF'};
                           background:${allAIHidden ? '#F1F5F9' : '#EEF2FF'};color:${allAIHidden ? '#CBD5E1' : '#4F46E5'};
                           font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;margin-left:6px;margin-right:2px;">
                    <i class="fa-solid fa-robot"></i>
                </button>
                <button onclick="toggleCategoryUser('${cat}',event)" title="${allUserHidden ? 'Hiện tất cả nhãn người dùng' : 'Ẩn tất cả nhãn người dùng'}"
                    style="width:20px;height:20px;border-radius:4px;border:1px solid ${allUserHidden ? '#E2E8F0' : '#D1FAE5'};
                           background:${allUserHidden ? '#F1F5F9' : '#ECFDF5'};color:${allUserHidden ? '#CBD5E1' : '#059669'};
                           font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;margin-right:2px;">
                    <i class="fa-solid fa-user"></i>
                </button>
                <button onclick="toggleCategoryVisibility('${cat}',event)" title="${allHidden ? 'Hiện tất cả nhãn' : 'Ẩn tất cả nhãn'}"
                    style="width:20px;height:20px;border:none;background:none;color:${allHidden ? '#CBD5E1' : '#94A3B8'};cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;margin-right:4px;">
                    <i class="fa-${allHidden ? 'regular' : 'solid'} fa-eye${allHidden ? '-slash' : ''}"></i>
                </button>
                <i class="fa-solid fa-chevron-${isCollapsed ? 'down' : 'up'}" style="font-size:10px;color:#94A3B8;flex-shrink:0;"></i>
            </div>
            ${isCollapsed ? '' : `<div style="padding:4px 6px;">${itemsHtml}</div>`}
        </div>`;
    }).join('');
}

function renderFrameSimilarityCharts() {
    const container = document.getElementById('similarityChartContainer');
    if (!container || !evaluationData) return;

    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;

    let totalSimilarity = 0;
    let cameraCount = 0;

    frame.cameras.forEach(camKey => {
        const comp = frame.comparison[camKey];
        if (comp && typeof comp.similarity === 'number') {
            totalSimilarity += comp.similarity;
            cameraCount++;
        }
    });

    const averageSimilarity = cameraCount > 0 ? (totalSimilarity / cameraCount) : null;

    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const displayPercent = averageSimilarity !== null ? averageSimilarity : 0;
    const strokeDashoffset = circumference - (displayPercent / 100) * circumference;

    let color = '#EF4444'; // Red
    let bgCircleColor = '#FEE2E2';
    let statusText = 'Độ khớp thấp';
    let statusColor = '#EF4444';
    let statusBg = '#FEE2E2';

    if (averageSimilarity === null) {
        color = '#CBD5E1';
        bgCircleColor = '#F1F5F9';
        statusText = 'Chưa đối chiếu';
        statusColor = '#64748B';
        statusBg = '#F1F5F9';
    } else if (displayPercent >= 75) {
        color = '#10B981'; // Green
        bgCircleColor = '#D1FAE5';
        statusText = 'Độ khớp cao';
        statusColor = '#059669';
        statusBg = '#ECFDF5';
    } else if (displayPercent >= 50) {
        color = '#F59E0B'; // Orange
        bgCircleColor = '#FEF3C7';
        statusText = 'Độ tương đồng trung bình';
        statusColor = '#D97706';
        statusBg = '#FFFBEB';
    }

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;width:100%;flex:1;box-sizing:border-box;box-shadow:inset 0 1px 2px rgba(0,0,0,0.02);">
            <div style="position:relative;width:110px;height:110px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <svg width="110" height="110" viewBox="0 0 110 110" style="transform: rotate(-90deg);">
                    <circle cx="55" cy="55" r="${radius}" fill="transparent" stroke="${bgCircleColor}" stroke-width="8" />
                    <circle cx="55" cy="55" r="${radius}" fill="transparent" stroke="${color}" stroke-width="8"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" />
                </svg>
                <div style="position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <span style="font-size:24px;font-weight:800;color:${color};font-family:'Outfit', 'Inter', sans-serif;">
                        ${averageSimilarity !== null ? `${Math.round(averageSimilarity)}%` : '—'}
                    </span>
                </div>
            </div>
            <div style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:12px;background:${statusBg};color:${statusColor};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                ${statusText}
            </div>
        </div>
    `;
}

function setActiveTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tools-section .tool-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tool-${tool}`);
    if (activeBtn) activeBtn.classList.add('active');
    const canvas = document.querySelector('.center-canvas');
    if (canvas) canvas.style.cursor = tool === 'pan' ? 'grab' : 'default';
}

function selectAt(clientX, clientY) {
    const img = document.getElementById('mainImage');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = ((clientX - rect.left) / rect.width) * imgDisplayW;
    const py = ((clientY - rect.top) / rect.height) * imgDisplayH;
    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera] || { ai_boxes: [], matched: [], extra: [] };

    if (showUserLabels) {
        for (let i = comp.extra.length - 1; i >= 0; i--) {
            const ex = comp.extra[i];
            if (px >= ex.bbox_x * imgDisplayW && px <= (ex.bbox_x + ex.bbox_w) * imgDisplayW &&
                py >= ex.bbox_y * imgDisplayH && py <= (ex.bbox_y + ex.bbox_h) * imgDisplayH) {
                selectedAnnId = ex.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
        }
        for (let i = comp.matched.length - 1; i >= 0; i--) {
            const u = comp.matched[i].user_box;
            if (px >= u.bbox_x * imgDisplayW && px <= (u.bbox_x + u.bbox_w) * imgDisplayW &&
                py >= u.bbox_y * imgDisplayH && py <= (u.bbox_y + u.bbox_h) * imgDisplayH) {
                selectedAnnId = u.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
        }
    }
    if (showAILabels) {
        for (let i = comp.ai_boxes.length - 1; i >= 0; i--) {
            const box = comp.ai_boxes[i];
            if (px >= box.bbox_x * imgDisplayW && px <= (box.bbox_x + box.bbox_w) * imgDisplayW &&
                py >= box.bbox_y * imgDisplayH && py <= (box.bbox_y + box.bbox_h) * imgDisplayH) {
                // Find if this AI box is part of a matched pair
                const match = comp.matched.find(m =>
                    m.ai_box.id === box.id ||
                    (m.ai_box.bbox_x === box.bbox_x && m.ai_box.bbox_y === box.bbox_y)
                );
                if (match) {
                    selectedAnnId = match.user_box.id;
                } else {
                    selectedAnnId = box.id;
                }
                redrawAnnotations();
                renderMatchedLabels();
                return;
            }
        }
    }
    selectedAnnId = null; redrawAnnotations(); renderMatchedLabels();
}

function redrawAnnotations() {
    if (!annCtx || !evaluationData) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);

    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera] || { ai_boxes: [], matched: [], extra: [] };

    const width = imgDisplayW;
    const height = imgDisplayH;
    const hasSelection = selectedAnnId !== null;

    // Build per-item hidden sets
    const hiddenAIKeys = new Set();
    const hiddenUserIds = new Set();
    comp.matched.forEach(m => {
        const ov = hiddenMatchedItems.get(m.user_box.id);
        if (ov?.hideAI) hiddenAIKeys.add(`${m.ai_box.bbox_x}_${m.ai_box.bbox_y}`);
        if (ov?.hideUser) hiddenUserIds.add(m.user_box.id);
    });

    // 1. Draw AI boxes (dashed)
    if (showAILabels) {
        comp.ai_boxes.forEach(box => {
            if (hiddenAIKeys.has(`${box.bbox_x}_${box.bbox_y}`)) return;
            const x = box.bbox_x * width, y = box.bbox_y * height;
            const w = box.bbox_w * width, h = box.bbox_h * height;
            const cls = CLASS_MAP[box.category];
            const color = cls ? cls.color : '#9333EA';
            const isMatchedToSelectedUser = comp.matched.some(m =>
                m.user_box.id === selectedAnnId &&
                (m.ai_box.id === box.id || (m.ai_box.bbox_x === box.bbox_x && m.ai_box.bbox_y === box.bbox_y))
            );
            const sel = box.id === selectedAnnId || isMatchedToSelectedUser;
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.setLineDash([2, 2]);
            annCtx.strokeRect(x, y, w, h);
            annCtx.setLineDash([]);
        });
    }

    // 2. Draw user boxes
    if (showUserLabels) {
        comp.matched.forEach(m => {
            const u = m.user_box;
            if (hiddenUserIds.has(u.id)) return;
            const x = u.bbox_x * width, y = u.bbox_y * height;
            const w = u.bbox_w * width, h = u.bbox_h * height;
            const cls = CLASS_MAP[u.category];
            const color = cls ? cls.color : '#10B981';
            const sel = u.id === selectedAnnId;
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.strokeRect(x, y, w, h);
            annCtx.fillStyle = color;
            annCtx.globalAlpha = hasSelection ? (sel ? 0.25 : 0.05) : 0.12;
            annCtx.fillRect(x, y, w, h);
        });
        comp.extra.forEach(ex => {
            const x = ex.bbox_x * width, y = ex.bbox_y * height;
            const w = ex.bbox_w * width, h = ex.bbox_h * height;
            const cls = CLASS_MAP[ex.category];
            const color = cls ? cls.color : '#3B82F6';
            const sel = ex.id === selectedAnnId;
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.strokeRect(x, y, w, h);
            annCtx.fillStyle = color;
            annCtx.globalAlpha = hasSelection ? (sel ? 0.25 : 0.05) : 0.12;
            annCtx.fillRect(x, y, w, h);
        });
    }

    annCtx.globalAlpha = 1.0;
}

// Zoom & Pan controls (same as label_review.js)
function zoomIn() {
    zoomScale = Math.min(zoomScale + 0.25, 4);
    applyZoom();
}

function zoomOut() {
    zoomScale = Math.max(zoomScale - 0.25, 0.5);
    applyZoom();
}

function resetZoom() {
    zoomScale = 1.0;
    panOffset = { x: 0, y: 0 };
    applyZoom();
}

function applyZoom() {
    const container = document.querySelector('.canvas-container');
    if (container) {
        container.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`;
    }
    document.getElementById('zoomLevel').textContent = `${Math.round(zoomScale * 100)}%`;
}

// Panning setup
function initPanReview() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', _panStart, { passive: false });
    canvas.addEventListener('mousemove', _panMove, { passive: false });
    canvas.addEventListener('mouseup', _panEnd);
    canvas.addEventListener('mouseleave', _panEnd);
    canvas.style.cursor = currentTool === 'pan' ? 'grab' : 'default';

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
    if (currentTool !== 'pan') {
        selectAt(e.clientX, e.clientY);
        return;
    }
    e.preventDefault();
    isPanning = true;
    panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    e.currentTarget.style.cursor = 'grabbing';
    e.currentTarget.style.userSelect = 'none';
}

function _panMove(e) {
    if (currentTool !== 'pan' || !isPanning) return;
    e.preventDefault();
    panOffset.x = e.clientX - panStart.x;
    panOffset.y = e.clientY - panStart.y;
    applyZoom();
}

function _panEnd(e) {
    if (currentTool !== 'pan') return;
    isPanning = false;
    e.currentTarget.style.cursor = 'grab';
    e.currentTarget.style.userSelect = '';
}

// Modals opening and image settings logic
function openTaskInfo() {
    const modal = document.getElementById('modalTaskInfo');
    if (!modal || !evaluationData) return;
    document.getElementById('infoProjectName').textContent = evaluationData.scene_name || '—';
    document.getElementById('infoTaskName').textContent = `Nhiệm vụ #${evaluationData.task_id}`;
    document.getElementById('infoLabeler').textContent = evaluationData.labeler
        ? (evaluationData.labeler.username + (evaluationData.labeler.full_name ? ' — ' + evaluationData.labeler.full_name : ''))
        : '—';
    document.getElementById('infoReviewer').textContent = evaluationData.reviewer
        ? (evaluationData.reviewer.username + (evaluationData.reviewer.full_name ? ' — ' + evaluationData.reviewer.full_name : ''))
        : 'Chưa phân công';
    modal.style.display = 'flex';
}

function applyImageFilter() {
    const brightness = document.getElementById('brightnessSlider')?.value || 100;
    const contrast = document.getElementById('contrastSlider')?.value || 100;
    document.getElementById('brightnessVal').textContent = brightness + '%';
    document.getElementById('contrastVal').textContent = contrast + '%';
    const img = document.getElementById('mainImage');
    if (img) img.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
}

function resetImageFilter() {
    const bs = document.getElementById('brightnessSlider');
    const cs = document.getElementById('contrastSlider');
    if (bs) bs.value = 100;
    if (cs) cs.value = 100;
    applyImageFilter();
}

// Keyboard shortcuts listener
window.addEventListener('keydown', (e) => {
    // Ignore keypresses inside input fields or textareas
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();

    // Navigation
    if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        nextFrame();
    } else if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        prevFrame();
    } else if (key === 'home') {
        e.preventDefault();
        firstFrame();
    } else if (key === 'end') {
        e.preventDefault();
        lastFrame();
    }

    // Camera mapping
    const camShortcuts = {
        '1': 'CAM_FRONT',
        '2': 'CAM_FRONT_LEFT',
        '3': 'CAM_FRONT_RIGHT',
        '4': 'CAM_BACK',
        '5': 'CAM_BACK_LEFT',
        '6': 'CAM_BACK_RIGHT'
    };
    if (camShortcuts[key]) {
        e.preventDefault();
        const targetCam = camShortcuts[key];
        const frame = evaluationData?.frames[selectedFrameIdx];
        if (frame && frame.cameras.includes(targetCam)) {
            selectCamera(targetCam);
        }
    }

    // Camera switching with ArrowUp/ArrowDown or W/S
    if ((key === 'arrowup' && !e.ctrlKey) || key === 'w') {
        e.preventDefault();
        const curIdx = CAMERAS.indexOf(selectedCamera);
        if (curIdx > -1) {
            const frame = evaluationData?.frames[selectedFrameIdx];
            if (frame) {
                for (let i = 1; i <= CAMERAS.length; i++) {
                    const prevCam = CAMERAS[(curIdx - i + CAMERAS.length) % CAMERAS.length];
                    if (frame.cameras.includes(prevCam)) {
                        selectCamera(prevCam);
                        break;
                    }
                }
            }
        }
    } else if ((key === 'arrowdown' && !e.ctrlKey) || key === 's') {
        e.preventDefault();
        const curIdx = CAMERAS.indexOf(selectedCamera);
        if (curIdx > -1) {
            const frame = evaluationData?.frames[selectedFrameIdx];
            if (frame) {
                for (let i = 1; i <= CAMERAS.length; i++) {
                    const nextCam = CAMERAS[(curIdx + i) % CAMERAS.length];
                    if (frame.cameras.includes(nextCam)) {
                        selectCamera(nextCam);
                        break;
                    }
                }
            }
        }
    }

    // Zoom mapping
    if (key === '+' || key === '=' || (e.ctrlKey && key === 'arrowup')) {
        e.preventDefault();
        zoomIn();
    } else if (key === '-' || (e.ctrlKey && key === 'arrowdown')) {
        e.preventDefault();
        zoomOut();
    } else if (key === '0') {
        e.preventDefault();
        resetZoom();
    }

    // Esc to close modals
    if (key === 'escape') {
        document.getElementById('modalTaskInfo').style.display = 'none';
        document.getElementById('modalShortcuts').style.display = 'none';
        document.getElementById('modalSettings').style.display = 'none';
        document.getElementById('modalEvaluationChat').style.display = 'none';
        document.getElementById('modalEvaluationHistory').style.display = 'none';
    }
});

// ============= CHAT & HISTORY FUNCTIONS =============
function getToken() { return localStorage.getItem('access_token'); }

async function openEvaluationChat() {
    const modal = document.getElementById('modalEvaluationChat');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadEvaluationChats();
}

async function loadEvaluationChats() {
    const container = document.getElementById('evaluationChatList');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>`;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/peer-chats`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) throw new Error();
        const chats = await res.json();

        if (!chats.length) {
            container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">
                Chưa có trao đổi nào giữa gán nhãn và kiểm duyệt.
            </div>`;
            return;
        }

        container.innerHTML = chats.map(c => {
            const date = new Date(c.created_at);
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const timeStr = `${hh}:${mm} ${d}-${m}`;

            const isLabeler = evaluationData && evaluationData.labeler && c.sender_id === evaluationData.labeler.id;
            const senderName = c.sender_full_name || c.sender_username;

            if (isLabeler) {
                return `
                <div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:12px;font-family:Inter,sans-serif">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                        <span style="font-size:11px;font-weight:600;color:#64748B">${senderName}</span>
                        <span style="font-size:9px;font-weight:700;background:#EFF6FF;color:#2563EB;padding:1px 4px;border-radius:4px;text-transform:uppercase">USER</span>
                    </div>
                    <div style="background:#4F46E5;color:#fff;padding:8px 12px;border-radius:14px 14px 2px 14px;max-width:80%;font-size:13px;word-break:break-word">
                        ${c.message}
                    </div>
                    <span style="font-size:10px;color:#94A3B8;margin-top:2px">${timeStr}</span>
                </div>`;
            } else {
                return `
                <div style="display:flex;flex-direction:column;align-items:flex-start;margin-bottom:12px;font-family:Inter,sans-serif">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                        <span style="font-size:11px;font-weight:600;color:#64748B">${senderName}</span>
                        <span style="font-size:9px;font-weight:700;background:#F1F5F9;color:#475569;padding:1px 4px;border-radius:4px;text-transform:uppercase">USER</span>
                    </div>
                    <div style="background:#EBF0F6;color:#1E293B;padding:8px 12px;border-radius:14px 14px 14px 2px;max-width:80%;font-size:13px;word-break:break-word">
                        ${c.message}
                    </div>
                    <span style="font-size:10px;color:#94A3B8;margin-top:2px">${timeStr}</span>
                </div>`;
            }
        }).join('');

        container.scrollTop = container.scrollHeight;

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#EF4444;font-size:13px">Không thể tải nội dung trao đổi</div>`;
    }
}

async function deleteEvaluationChat() {
    if (!confirm('Bạn có chắc chắn muốn xóa (ẩn) cuộc trò chuyện này ở phía Admin? Người dùng vẫn sẽ nhìn thấy cuộc trò chuyện này bình thường.')) {
        return;
    }

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/peer-chats`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (res.ok) {
            await loadEvaluationChats();
        } else {
            alert('Không thể xóa cuộc trò chuyện');
        }
    } catch (e) {
        alert('Lỗi kết nối');
    }
}

async function openEvaluationHistory() {
    const modal = document.getElementById('modalEvaluationHistory');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadEvaluationHistory();
}

async function loadEvaluationHistory() {
    const container = document.getElementById('evaluationHistoryList');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>`;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/history`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) throw new Error();
        const history = await res.json();

        if (!history.length) {
            container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">
                Chưa có lịch sử nộp bài.
            </div>`;
            return;
        }

        const ACTION_CONFIG = {
            submitted: { icon: 'fa-paper-plane', color: '#2563EB', bg: '#EFF6FF', label: 'Nộp bài' },
            rejected: { icon: 'fa-circle-xmark', color: '#EF4444', bg: '#FEF2F2', label: 'Từ chối' },
            approved: { icon: 'fa-circle-check', color: '#10B981', bg: '#F0FDF4', label: 'Kiểm tra xong' },
            admin_approved: { icon: 'fa-check-double', color: '#7C3AED', bg: '#F5F3FF', label: 'Admin phê duyệt' },
            admin_rejected: { icon: 'fa-triangle-exclamation', color: '#DC2626', bg: '#FEF2F2', label: 'Admin từ chối' },
        };

        container.innerHTML = history.map((h, idx) => {
            const cfg = ACTION_CONFIG[h.action] || { icon: 'fa-circle', color: '#64748B', bg: '#F8FAFC', label: h.action };
            const actor = h.actor_full_name ? `${h.actor_full_name} (@${h.actor_username})` : (h.actor_username ? `@${h.actor_username}` : '—');

            let timeStr = '—';
            if (h.created_at) {
                const date = new Date(h.created_at);
                const hh = String(date.getHours()).padStart(2, '0');
                const mm = String(date.getMinutes()).padStart(2, '0');
                const ss = String(date.getSeconds()).padStart(2, '0');
                const d = date.getDate();
                const m = date.getMonth() + 1;
                const y = date.getFullYear();
                timeStr = `${hh}:${mm}:${ss} ${d}/${m}/${y}`;
            }

            return `
            <div style="display:flex;gap:10px;align-items:flex-start">
                <!-- Timeline dot -->
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding-top:2px;align-self:stretch">
                    <div style="width:28px;height:28px;border-radius:50%;background:${cfg.bg};color:${cfg.color};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">
                        <i class="fa-solid ${cfg.icon}"></i>
                    </div>
                    ${idx < history.length - 1 ? `<div style="width:2px;flex:1;background:#E2E8F0;margin-top:4px;margin-bottom:4px"></div>` : ''}
                </div>
                <!-- Content -->
                <div style="flex:1;padding-bottom:${idx < history.length - 1 ? '16px' : '0'}">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                        <span style="font-size:13px;font-weight:700;color:${cfg.color}">${cfg.label}</span>
                        <span style="font-size:11px;color:#94A3B8">${timeStr}</span>
                    </div>
                    <div style="font-size:12px;color:#64748B;margin-top:2px">${actor}</div>
                    ${h.feedback ? `<div style="margin-top:6px;padding:8px 10px;background:#FEF2F2;border-radius:6px;font-size:12px;color:#7F1D1D;white-space:pre-line;border-left:2px solid #EF4444">${h.feedback}</div>` : ''}
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#EF4444;font-size:13px">Không thể tải lịch sử nộp bài</div>`;
    }
}

function toggleSectionCollapse(id) {
    const body = document.getElementById('section-body-' + id);
    const icon = document.getElementById('collapse-icon-' + id);
    if (!body || !icon) return;

    const isCollapsed = body.style.display === 'none';

    if (isCollapsed) {
        body.style.display = '';
        icon.className = 'fa-solid fa-chevron-up';

        const container = document.getElementById('section-container-' + id);
        if (container) {
            if (id === 'tools') {
                container.style.flexShrink = '0';
            } else {
                container.style.flex = '1';
                container.style.overflowY = 'auto';
            }
        }
    } else {
        body.style.display = 'none';
        icon.className = 'fa-solid fa-chevron-down';

        const container = document.getElementById('section-container-' + id);
        if (container) {
            if (id === 'tools') {
                container.style.flexShrink = '0';
            } else {
                container.style.flex = 'none';
                container.style.overflowY = 'visible';
            }
        }
    }
}

// Initialize on load
window.onload = () => {
    initPage();
    initPanReview();
};

// Resize redraw handler
window.onresize = () => {
    const mainImg = document.getElementById('mainImage');
    if (mainImg && mainImg.style.display !== 'none') {
        const container = document.querySelector('.canvas-container');
        setupCanvas(container, mainImg);
        redrawAnnotations();
    }
};
