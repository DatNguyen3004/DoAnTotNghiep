const BASE_URL = '/api';
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');

if (!taskId) {
    window.location.href = 'dashboard.html';
}

// Ánh xạ danh mục lớp đối tượng
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

// Các biến quản lý trạng thái
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

// Khởi tạo trang
async function initPage() {
    updateLabelTogglesUI();
    try {
        // Tải thông tin chi tiết đối chiếu và đánh giá từ máy chủ
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

        // Gán một ID duy nhất ở phía client cho mỗi hộp AI
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


        // Thiết lập chỗ trống hiển thị ảnh đại diện người dùng
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            avatar.textContent = 'AD';
        }

        // Đi tới khung hình đầu tiên
        if (evaluationData.frames.length > 0) {
            await selectFrame(0);
        }

    } catch (err) {
        console.error(err);
        alert(err.message || 'Có lỗi xảy ra khi tải trang.');
    } finally {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 300);
        }
    }
}

// Các thao tác điều hướng khung hình
function firstFrame() {
    if (selectedFrameIdx > 0) {
        selectFrame(0);
    }
}

// Mở hộp thoại thống kê và đánh giá
document.getElementById('btnNop')?.addEventListener('click', () => {
    showEvaluationStats();
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

// Chọn khung hình hoạt động
async function selectFrame(idx) {
    selectedFrameIdx = idx;
    const frame = evaluationData.frames[idx];

    // Cập nhật bộ chỉ báo trên thanh công cụ
    document.getElementById('frameIndicator').textContent = `${idx + 1}`;

    // Giữ lại camera đã chọn nếu khả dụng, nếu không chọn camera đầu tiên
    if (frame.cameras.length > 0) {
        if (!frame.cameras.includes(selectedCamera)) {
            selectedCamera = frame.cameras[0];
        }
        // Hiển thị danh sách camera ở panel bên trái
        renderCamList();
        // Làm mới hình ảnh và các nhãn dán tương ứng
        await loadComparisonImages();
    } else {
        alert('Không có dữ liệu camera cho khung hình này');
    }
}

// Hiển thị danh sách ảnh thu nhỏ camera theo chiều dọc ở bên trái
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

    // Tải các ảnh thu nhỏ cho các camera đang hoạt động
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

// Chọn camera
async function selectCamera(cam) {
    selectedCamera = cam;
    renderCamList();
    await loadComparisonImages();
}

// Tải hình ảnh cho khung hình và camera hiện tại
async function loadComparisonImages() {
    const frame = evaluationData.frames[selectedFrameIdx];
    const mainImg = document.getElementById('mainImage');

    // Đặt lại tỷ lệ thu phóng và bộ lọc khi đổi camera
    resetZoom();

    mainImg.src = '';
    mainImg.style.display = 'none';

    // Hiển thị các nhãn trùng khớp cho khung hình/camera hiện tại
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
    // Loại bỏ canvas cũ
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

// Hiển thị bảng danh sách các nhãn trùng khớp ở bên phải
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

        // Màu sắc tương đồng dựa trên tỷ lệ IoU
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
            <!-- Dòng tiêu đề: biểu tượng + tên nhãn + huy hiệu IoU -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
                <i class="fa-solid ${cls.icon}" style="color:${cls.color};font-size:12px;flex-shrink:0;"></i>
                <span style="font-size:12px;font-weight:700;color:#1E293B;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</span>
                <span style="font-size:11px;font-weight:800;color:${iouTextColor};background:${barColor}22;border:1px solid ${barColor}55;border-radius:6px;padding:1px 6px;flex-shrink:0;">${pct}%</span>
            </div>
            <!-- Thanh tiến trình -->
            <div style="height:4px;background:#E2E8F0;border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px;transition:width 0.4s;"></div>
            </div>
            <!-- Thông tin phụ -->
            <div style="display:flex;justify-content:space-between;margin-top:4px;">
                <span style="font-size:10px;color:#94A3B8;">AI gốc</span>
                <span style="font-size:10px;color:#94A3B8;">Tỉ lệ IoU</span>
                <span style="font-size:10px;color:#94A3B8;">Người dùng</span>
            </div>
        </div>`;
    }).join('');
}

// Logic vẽ lại nhãn trên Canvas
let selectedAnnId = null;
let currentTool = 'pointer';

// Ghi đè hiển thị AI/Người dùng cho từng mục trùng khớp. Khóa = user_box.id
// { hideAI: bool, hideUser: bool }
let hiddenMatchedItems = new Map();
let collapsedCategories = new Set();

function resetMatchedState() {
    hiddenMatchedItems.clear();
    // Giữ trạng thái thu gọn giữa các lần chuyển đổi camera/khung hình
}

function toggleMatchedAI(userId, event) {
    event.stopPropagation();
    if (!evaluationData) return;
    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera];
    if (!comp) return;
    const entries = getCurrentEntries(comp);
    const item = entries.find(item => String(item.id) === String(userId));
    if (!item) return;

    const cur = hiddenMatchedItems.get(String(userId)) || { hideAI: false, hideUser: false };
    if (item.type === 'matched') {
        if (!cur.hideAI && cur.hideUser) {
            hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: false });
        } else {
            hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: true });
        }
    } else {
        hiddenMatchedItems.set(String(userId), { hideAI: !cur.hideAI, hideUser: false });
    }
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleMatchedUser(userId, event) {
    event.stopPropagation();
    if (!evaluationData) return;
    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera];
    if (!comp) return;
    const entries = getCurrentEntries(comp);
    const item = entries.find(item => String(item.id) === String(userId));
    if (!item) return;

    const cur = hiddenMatchedItems.get(String(userId)) || { hideAI: false, hideUser: false };
    if (item.type === 'matched') {
        if (cur.hideAI && !cur.hideUser) {
            hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: false });
        } else {
            hiddenMatchedItems.set(String(userId), { hideAI: true, hideUser: false });
        }
    } else {
        hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: !cur.hideUser });
    }
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleMatchedVisibility(userId, event) {
    event.stopPropagation();
    if (!evaluationData) return;
    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera];
    if (!comp) return;
    const entries = getCurrentEntries(comp);
    const item = entries.find(item => String(item.id) === String(userId));
    if (!item) return;

    const cur = hiddenMatchedItems.get(String(userId)) || { hideAI: false, hideUser: false };
    const currentlyHidden = (item.type === 'matched' && cur.hideAI && cur.hideUser) ||
        (item.type === 'extra' && cur.hideUser) ||
        (item.type === 'missing' && cur.hideAI);

    if (item.type === 'matched') {
        hiddenMatchedItems.set(String(userId), { hideAI: !currentlyHidden, hideUser: !currentlyHidden });
    } else if (item.type === 'extra') {
        hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: !currentlyHidden });
    } else if (item.type === 'missing') {
        hiddenMatchedItems.set(String(userId), { hideAI: !currentlyHidden, hideUser: false });
    }
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

    const entries = getCurrentEntries(comp).filter(item => item.category === cat);
    const allHidden = entries.every(item => {
        const o = hiddenMatchedItems.get(String(item.id)) || {};
        return (item.type === 'matched' && o.hideAI && o.hideUser) ||
            (item.type === 'extra' && o.hideUser) ||
            (item.type === 'missing' && o.hideAI);
    });

    entries.forEach(item => {
        const idStr = String(item.id);
        if (item.type === 'matched') {
            hiddenMatchedItems.set(idStr, { hideAI: !allHidden, hideUser: !allHidden });
        } else if (item.type === 'extra') {
            hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: !allHidden });
        } else if (item.type === 'missing') {
            hiddenMatchedItems.set(idStr, { hideAI: !allHidden, hideUser: false });
        }
    });

    renderMatchedLabels();
    redrawAnnotations();
}

function toggleCategoryAI(cat, event) {
    event.stopPropagation();
    if (!evaluationData) return;
    const comp = evaluationData.frames[selectedFrameIdx]?.comparison[selectedCamera];
    if (!comp) return;

    const entries = getCurrentEntries(comp).filter(item => item.category === cat);
    if (entries.length === 0) return;

    // Kiểm tra xem hiện tại tất cả các mục có chỉ hiển thị AI hay không
    const allShowOnlyAI = entries.every(item => {
        const o = hiddenMatchedItems.get(String(item.id)) || { hideAI: false, hideUser: false };
        if (item.type === 'matched') return !o.hideAI && o.hideUser;
        if (item.type === 'missing') return !o.hideAI;
        return true; // Mục thừa (extra) được bỏ qua khi kiểm tra "chỉ AI"
    });

    entries.forEach(item => {
        const idStr = String(item.id);
        if (item.type === 'matched') {
            if (allShowOnlyAI) {
                hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
            } else {
                hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: true });
            }
        } else if (item.type === 'missing') {
            hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
        } else if (item.type === 'extra') {
            hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: !allShowOnlyAI });
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

    const entries = getCurrentEntries(comp).filter(item => item.category === cat);
    if (entries.length === 0) return;

    // Kiểm tra xem hiện tại tất cả các mục có chỉ hiển thị Nhãn người dùng hay không
    const allShowOnlyUser = entries.every(item => {
        const o = hiddenMatchedItems.get(String(item.id)) || { hideAI: false, hideUser: false };
        if (item.type === 'matched') return o.hideAI && !o.hideUser;
        if (item.type === 'extra') return !o.hideUser;
        return true; // Mục thiếu (missing) được bỏ qua khi kiểm tra "chỉ người dùng"
    });

    entries.forEach(item => {
        const idStr = String(item.id);
        if (item.type === 'matched') {
            if (allShowOnlyUser) {
                hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
            } else {
                hiddenMatchedItems.set(idStr, { hideAI: true, hideUser: false });
            }
        } else if (item.type === 'extra') {
            hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
        } else if (item.type === 'missing') {
            hiddenMatchedItems.set(idStr, { hideAI: !allShowOnlyUser, hideUser: false });
        }
    });

    renderMatchedLabels();
    redrawAnnotations();
}

// Lấy tất cả các nhãn tùy thuộc vào trạng thái bật/tắt hiện tại (AI / Người dùng / Cả hai)
function getCurrentEntries(comp) {
    if (!comp) return [];
    const matched = comp.matched || [];
    const extra = comp.extra || [];
    const missing = comp.ai_boxes ? comp.ai_boxes.filter(box =>
        !matched.some(m => m.ai_box.id === box.id || (m.ai_box.bbox_x === box.bbox_x && m.ai_box.bbox_y === box.bbox_y))
    ) : [];

    let entries = [];
    if (showAILabels || showUserLabels) {
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
    if (showUserLabels) {
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
    if (showAILabels) {
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

// Hiển thị panel nhãn trùng khớp bên phải (đổi tên thành Danh sách nhãn)
function renderMatchedLabels() {
    renderFrameSimilarityCharts();

    const list = document.getElementById('matchedLabelList');
    const countBadge = document.getElementById('matchedLabelCount');
    if (!list || !evaluationData) return;

    const frame = evaluationData.frames[selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[selectedCamera];
    const entries = getCurrentEntries(comp);

    countBadge.textContent = entries.length;

    if (entries.length === 0) {
        list.innerHTML = `<div style="color:#94A3B8;font-size:12px;text-align:center;padding:20px 0;"><i class="fa-solid fa-magnifying-glass" style="display:block;font-size:18px;margin-bottom:6px;"></i>Không có nhãn nào</div>`;
        return;
    }

    // Nhóm theo danh mục lớp đối tượng
    const groups = {};
    entries.forEach(item => {
        const cat = item.category;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });

    list.innerHTML = Object.entries(groups).map(([cat, items]) => {
        const cls = CLASS_MAP[cat] || { name: cat, color: '#94A3B8', icon: 'fa-tag' };
        const isCollapsed = collapsedCategories.has(cat);
        const allAIHidden = items.every(m => {
            const o = hiddenMatchedItems.get(String(m.id)) || {};
            return m.type === 'extra' || o.hideAI;
        });
        const allUserHidden = items.every(m => {
            const o = hiddenMatchedItems.get(String(m.id)) || {};
            return m.type === 'missing' || o.hideUser;
        });
        const allHidden = items.every(m => {
            const o = hiddenMatchedItems.get(String(m.id)) || {};
            return (m.type === 'matched' && o.hideAI && o.hideUser) ||
                (m.type === 'extra' && o.hideUser) ||
                (m.type === 'missing' && o.hideAI);
        });

        const itemsHtml = items.map((item, i) => {
            const isSel = String(selectedAnnId) === String(item.id);
            const ov = hiddenMatchedItems.get(String(item.id)) || { hideAI: false, hideUser: false };
            const isRowHidden = (item.type === 'matched' && ov.hideAI && ov.hideUser) ||
                (item.type === 'extra' && ov.hideUser) ||
                (item.type === 'missing' && ov.hideAI);

            const trackId = item.trackId != null ? String(item.trackId).padStart(2, '0') : String(i + 1).padStart(2, '0');

            let iouHtml = '';
            if (item.type === 'matched') {
                const pct = Math.round(item.iou * 100);
                let barColor = pct >= 75 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';
                iouHtml = `
                    <div style="flex:1;display:flex;align-items:center;gap:4px;">
                        <div style="flex:1;height:4px;background:#E2E8F0;border-radius:2px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px;"></div>
                        </div>
                        <span style="font-size:10px;font-weight:700;color:${barColor};min-width:28px;text-align:right;">${pct}%</span>
                    </div>
                `;
            } else if (item.type === 'extra') {
                iouHtml = `
                    <div style="flex:1;display:flex;align-items:center;gap:4px;">
                        <span style="font-size:10px;color:#10B981;font-weight:600;">Người dùng</span>
                    </div>
                `;
            } else {
                iouHtml = `
                    <div style="flex:1;display:flex;align-items:center;gap:4px;">
                        <span style="font-size:10px;color:#3B82F6;font-weight:600;">AI dự đoán</span>
                    </div>
                `;
            }

            // Các nút thao tác
            let robotBtn = '';
            if (item.type === 'matched' || item.type === 'missing') {
                const hideAI = ov.hideAI;
                robotBtn = `
                    <button onclick="toggleMatchedAI('${item.id}',event)" title="${hideAI ? 'Hiện nhãn AI' : 'Ẩn nhãn AI'}"
                        style="width:20px;height:20px;border-radius:4px;border:1px solid ${hideAI ? '#E2E8F0' : '#E0E7FF'};
                               background:${hideAI ? '#F1F5F9' : '#EEF2FF'};color:${hideAI ? '#CBD5E1' : '#4F46E5'};
                               font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;">
                        <i class="fa-solid fa-robot"></i>
                    </button>
                `;
            } else {
                robotBtn = `
                    <div style="width:20px;height:20px;flex-shrink:0;"></div>
                `;
            }

            let userBtn = '';
            if (item.type === 'matched' || item.type === 'extra') {
                const hideUser = ov.hideUser;
                userBtn = `
                    <button onclick="toggleMatchedUser('${item.id}',event)" title="${hideUser ? 'Hiện nhãn người dùng' : 'Ẩn nhãn người dùng'}"
                        style="width:20px;height:20px;border-radius:4px;border:1px solid ${hideUser ? '#E2E8F0' : '#D1FAE5'};
                               background:${hideUser ? '#F1F5F9' : '#ECFDF5'};color:${hideUser ? '#CBD5E1' : '#059669'};
                               font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;">
                        <i class="fa-solid fa-user"></i>
                    </button>
                `;
            } else {
                userBtn = `
                    <div style="width:20px;height:20px;flex-shrink:0;"></div>
                `;
            }

            return `<div onclick="selectedAnnId='${item.id}';redrawAnnotations();renderMatchedLabels();"
                style="display:flex;align-items:center;gap:5px;padding:5px 6px;cursor:pointer;
                       border-left:3px solid ${isSel ? '#4F46E5' : 'transparent'};
                       background:${isSel ? '#EEF2FF' : 'transparent'};
                       border-radius:0 6px 6px 0;transition:all 0.15s;margin-bottom:2px;">
                <div style="width:7px;height:7px;border-radius:50%;background:${cls.color};flex-shrink:0;"></div>
                <span style="font-size:11px;font-weight:700;color:#475569;min-width:18px;">${trackId}</span>
                ${iouHtml}
                ${robotBtn}
                ${userBtn}
                <button onclick="toggleMatchedVisibility('${item.id}',event)" title="${isRowHidden ? 'Hiện tất cả nhãn' : 'Ẩn tất cả nhãn'}"
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
    let totalUserAnnotations = 0;
    let totalAIAnnotations = 0;
    CAMERAS.forEach(camKey => {
        const comp = frame.comparison[camKey];
        if (comp) {
            if (typeof comp.similarity === 'number') {
                totalSimilarity += comp.similarity;
            }
            if (comp.user_boxes) totalUserAnnotations += comp.user_boxes.length;
            if (comp.ai_boxes) totalAIAnnotations += comp.ai_boxes.length;
        }
    });

    let averageSimilarity = totalSimilarity / 6;
    if (totalUserAnnotations === 0 && totalAIAnnotations > 0) {
        averageSimilarity = 0;
    }

    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const displayPercent = averageSimilarity;
    const strokeDashoffset = circumference - (displayPercent / 100) * circumference;

    let color = '#EF4444'; // Đỏ
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
        color = '#10B981'; // Xanh lá
        bgCircleColor = '#D1FAE5';
        statusText = 'Độ khớp cao';
        statusColor = '#059669';
        statusBg = '#ECFDF5';
    } else if (displayPercent >= 50) {
        color = '#F59E0B'; // Cam
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

    const entries = getCurrentEntries(comp);

    for (let i = entries.length - 1; i >= 0; i--) {
        const item = entries[i];
        if (item.type === 'matched') {
            const u = item.user_box;
            const ai = item.ai_box;
            if (showUserLabels && px >= u.bbox_x * imgDisplayW && px <= (u.bbox_x + u.bbox_w) * imgDisplayW &&
                py >= u.bbox_y * imgDisplayH && py <= (u.bbox_y + u.bbox_h) * imgDisplayH) {
                selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
            if (showAILabels && px >= ai.bbox_x * imgDisplayW && px <= (ai.bbox_x + ai.bbox_w) * imgDisplayW &&
                py >= ai.bbox_y * imgDisplayH && py <= (ai.bbox_y + ai.bbox_h) * imgDisplayH) {
                selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
        } else if (item.type === 'extra') {
            const ex = item.user_box;
            if (showUserLabels && px >= ex.bbox_x * imgDisplayW && px <= (ex.bbox_x + ex.bbox_w) * imgDisplayW &&
                py >= ex.bbox_y * imgDisplayH && py <= (ex.bbox_y + ex.bbox_h) * imgDisplayH) {
                selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
            }
        } else if (item.type === 'missing') {
            const mi = item.ai_box;
            if (showAILabels && px >= mi.bbox_x * imgDisplayW && px <= (mi.bbox_x + mi.bbox_w) * imgDisplayW &&
                py >= mi.bbox_y * imgDisplayH && py <= (mi.bbox_y + mi.bbox_h) * imgDisplayH) {
                selectedAnnId = item.id; redrawAnnotations(); renderMatchedLabels(); return;
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

    // Tạo tập hợp các mục bị ẩn cho từng hộp
    const hiddenAIKeys = new Set();
    const hiddenUserIds = new Set();

    const entries = getCurrentEntries(comp);
    entries.forEach(item => {
        const ov = hiddenMatchedItems.get(String(item.id));
        if (item.type === 'matched') {
            if (ov?.hideAI) hiddenAIKeys.add(`${item.ai_box.bbox_x}_${item.ai_box.bbox_y}`);
            if (ov?.hideUser) hiddenUserIds.add(item.user_box.id);
        } else if (item.type === 'extra') {
            if (ov?.hideUser) hiddenUserIds.add(item.user_box.id);
        } else if (item.type === 'missing') {
            if (ov?.hideAI) hiddenAIKeys.add(`${item.ai_box.bbox_x}_${item.ai_box.bbox_y}`);
        }
    });

    // 1. Vẽ các hộp AI (nét đứt)
    if (showAILabels) {
        comp.ai_boxes.forEach(box => {
            if (hiddenAIKeys.has(`${box.bbox_x}_${box.bbox_y}`)) return;
            const x = box.bbox_x * width, y = box.bbox_y * height;
            const w = box.bbox_w * width, h = box.bbox_h * height;
            const cls = CLASS_MAP[box.category];
            const color = cls ? cls.color : '#9333EA';
            const isMatchedToSelectedUser = comp.matched.some(m =>
                String(m.user_box.id) === String(selectedAnnId) &&
                (String(m.ai_box.id) === String(box.id) || (m.ai_box.bbox_x === box.bbox_x && m.ai_box.bbox_y === box.bbox_y))
            );
            const sel = String(box.id) === String(selectedAnnId) || isMatchedToSelectedUser;
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.setLineDash([2, 2]);
            annCtx.strokeRect(x, y, w, h);
            annCtx.setLineDash([]);
        });
    }

    // 2. Vẽ các hộp của người dùng
    if (showUserLabels) {
        comp.matched.forEach(m => {
            const u = m.user_box;
            if (hiddenUserIds.has(u.id)) return;
            const x = u.bbox_x * width, y = u.bbox_y * height;
            const w = u.bbox_w * width, h = u.bbox_h * height;
            const cls = CLASS_MAP[u.category];
            const color = cls ? cls.color : '#10B981';
            const sel = String(u.id) === String(selectedAnnId);
            annCtx.globalAlpha = hasSelection ? (sel ? 1.0 : 0.25) : 1.0;
            annCtx.strokeStyle = color;
            annCtx.lineWidth = sel ? 3.5 : 2.0;
            annCtx.strokeRect(x, y, w, h);
            annCtx.fillStyle = color;
            annCtx.globalAlpha = hasSelection ? (sel ? 0.25 : 0.05) : 0.12;
            annCtx.fillRect(x, y, w, h);
        });
        comp.extra.forEach(ex => {
            if (hiddenUserIds.has(ex.id)) return;
            const x = ex.bbox_x * width, y = ex.bbox_y * height;
            const w = ex.bbox_w * width, h = ex.bbox_h * height;
            const cls = CLASS_MAP[ex.category];
            const color = cls ? cls.color : '#3B82F6';
            const sel = String(ex.id) === String(selectedAnnId);
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

// Các điều khiển Thu phóng & Di chuyển (tương tự như trong label_review.js)
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

// Thiết lập chức năng di chuyển vùng nhìn (Panning)
function initPanReview() {
    const canvas = document.querySelector('.center-canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', _panStart, { passive: false });
    canvas.addEventListener('mousemove', _panMove, { passive: false });
    canvas.addEventListener('mouseup', _panEnd);
    canvas.addEventListener('mouseleave', _panEnd);
    canvas.style.cursor = currentTool === 'pan' ? 'grab' : 'default';

    // Thu phóng khi nhấn Ctrl + cuộn chuột
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

// Logic mở các modal và thiết lập hình ảnh
function openTaskInfo() {
    const modal = document.getElementById('modalTaskInfo');
    if (!modal || !evaluationData) return;
    document.getElementById('infoProjectName').textContent = evaluationData.scene_name || '—';
    document.getElementById('infoTaskName').textContent = evaluationData.scene_description || 'Không có mô tả';
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

// Lắng nghe các phím tắt từ bàn phím
window.addEventListener('keydown', (e) => {
    // Bỏ qua các sự kiện phím bên trong các trường nhập liệu hoặc khung văn bản
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();

    // Điều hướng khung hình
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

    // Ánh xạ phím cho các camera
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

    // Chuyển đổi camera bằng phím ArrowUp/ArrowDown hoặc W/S
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

    // Phím tắt thu phóng
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

    // Nhấn phím Esc để đóng các modal
    if (key === 'escape') {
        document.getElementById('modalTaskInfo').style.display = 'none';
        document.getElementById('modalShortcuts').style.display = 'none';
        document.getElementById('modalSettings').style.display = 'none';
        document.getElementById('modalEvaluationChat').style.display = 'none';
        document.getElementById('modalEvaluationHistory').style.display = 'none';
    }
});

// ============= CÁC HÀM TRÒ CHUYỆN VÀ LỊCH SỬ ĐÁNH GIÁ =============
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
                <!-- Dấu chấm mốc thời gian -->
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding-top:2px;align-self:stretch">
                    <div style="width:28px;height:28px;border-radius:50%;background:${cfg.bg};color:${cfg.color};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">
                        <i class="fa-solid ${cfg.icon}"></i>
                    </div>
                    ${idx < history.length - 1 ? `<div style="width:2px;flex:1;background:#E2E8F0;margin-top:4px;margin-bottom:4px"></div>` : ''}
                </div>
                <!-- Nội dung lịch sử -->
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

function showEvaluationStats() {
    const modal = document.getElementById('modalEvaluationStats');
    const container = document.getElementById('statsModalBody');
    if (!modal || !container || !evaluationData) return;

    // 1. Thực hiện các phép tính toán học
    let totalAi = 0;
    let totalUser = 0;
    let totalMatched = 0;
    let totalMissing = 0;
    let totalExtra = 0;
    let totalIoU = 0;
    let matchedIoUCount = 0;
    let aiCorrectCount = 0;


    const classStats = {};
    CLASSES.forEach(c => {
        classStats[c.id] = { matched: 0, missing: 0, extra: 0, sumIoU: 0 };
    });

    const cameraStats = {};
    const confusionMap = {};

    function calculateIoU(boxA, boxB) {
        const ax1 = boxA.bbox_x, ay1 = boxA.bbox_y;
        const ax2 = boxA.bbox_x + boxA.bbox_w, ay2 = boxA.bbox_y + boxA.bbox_h;
        const bx1 = boxB.bbox_x, by1 = boxB.bbox_y;
        const bx2 = boxB.bbox_x + boxB.bbox_w, by2 = boxB.bbox_y + boxB.bbox_h;

        const ix1 = Math.max(ax1, bx1);
        const iy1 = Math.max(ay1, by1);
        const ix2 = Math.min(ax2, bx2);
        const iy2 = Math.min(ay2, by2);

        if (ix2 <= ix1 || iy2 <= iy1) return 0;
        const inter = (ix2 - ix1) * (iy2 - iy1);
        const union = (boxA.bbox_w * boxA.bbox_h) + (boxB.bbox_w * boxB.bbox_h) - inter;
        return union > 0 ? (inter / union) : 0;
    }

    evaluationData.frames.forEach(frame => {
        let totalUserBoxesOnFrame = 0;
        let totalAiBoxesOnFrame = 0;
        frame.cameras.forEach(camKey => {
            const comp = frame.comparison[camKey];
            if (comp) {
                if (comp.user_boxes) totalUserBoxesOnFrame += comp.user_boxes.length;
                if (comp.ai_boxes) totalAiBoxesOnFrame += comp.ai_boxes.length;
            }
        });
        const isFrameUnlabeled = (totalUserBoxesOnFrame === 0 && totalAiBoxesOnFrame > 0);

        frame.cameras.forEach(camKey => {
            if (!cameraStats[camKey]) {
                cameraStats[camKey] = { totalSimilarity: 0, count: 0, totalUser: 0, matched: 0, missing: 0, extra: 0 };
            }

            const comp = frame.comparison[camKey];
            if (!comp) return;

            if (typeof comp.similarity === 'number') {
                const simVal = comp.similarity;
                cameraStats[camKey].totalSimilarity += simVal;
                cameraStats[camKey].count++;
            }

            let matchedCount = 0;
            let missingCount = comp.missing ? comp.missing.length : 0;
            let extraCount = comp.extra ? comp.extra.length : 0;
            if (comp.matched) {
                comp.matched.forEach(m => {
                    if (m.iou >= 0.85) {
                        matchedCount++;
                    } else {
                        missingCount++;
                        extraCount++;
                    }
                });
            }
            const aiCount = comp.ai_boxes ? comp.ai_boxes.length : 0;
            const userCount = comp.user_boxes ? comp.user_boxes.length : 0;

            totalAi += aiCount;
            totalUser += userCount;
            totalMatched += matchedCount;
            totalMissing += missingCount;
            totalExtra += extraCount;



            aiCorrectCount += matchedCount;

            cameraStats[camKey].totalUser += userCount;
            cameraStats[camKey].matched += matchedCount;
            cameraStats[camKey].missing += missingCount;
            cameraStats[camKey].extra += extraCount;

            if (comp.matched) {
                comp.matched.forEach(m => {
                    const cat = m.user_box.category;
                    if (classStats[cat]) {
                        if (m.iou >= 0.85) {
                            classStats[cat].matched++;
                            classStats[cat].sumIoU += m.iou;
                            totalIoU += m.iou;
                            matchedIoUCount++;
                        } else {
                            classStats[cat].missing++;
                            classStats[cat].extra++;
                        }
                    }
                });
            }

            if (comp.missing) {
                comp.missing.forEach(box => {
                    const cat = box.category;
                    if (classStats[cat]) {
                        classStats[cat].missing++;
                    }
                });
            }

            if (comp.extra) {
                comp.extra.forEach(box => {
                    const cat = box.category;
                    if (classStats[cat]) {
                        classStats[cat].extra++;
                    }
                });
            }

            if (comp.missing && comp.extra) {
                comp.missing.forEach(aiBox => {
                    comp.extra.forEach(userBox => {
                        const iouVal = calculateIoU(aiBox, userBox);
                        if (iouVal > 0.3) {
                            const key = `${aiBox.category}::${userBox.category}`;
                            confusionMap[key] = (confusionMap[key] || 0) + 1;
                        }
                    });
                });
            }
        });
    });

    // Tính toán các giá trị chất lượng
    let totalFrameSimSum = 0;
    evaluationData.frames.forEach(frame => {
        let frameSim = 0;
        let totalUserAnnotations = 0;
        let totalAIAnnotations = 0;
        CAMERAS.forEach(camKey => {
            const comp = frame.comparison[camKey];
            if (comp) {
                if (typeof comp.similarity === 'number') {
                    frameSim += comp.similarity;
                }
                if (comp.user_boxes) totalUserAnnotations += comp.user_boxes.length;
                if (comp.ai_boxes) totalAIAnnotations += comp.ai_boxes.length;
            }
        });
        let avgFrameSim = frameSim / 6;
        if (totalUserAnnotations === 0 && totalAIAnnotations > 0) {
            avgFrameSim = 0;
        }
        totalFrameSimSum += avgFrameSim;
    });
    const overallSimilarity = evaluationData.frames.length > 0 ? Math.round(totalFrameSimSum / evaluationData.frames.length) : 0;

    const frameReliabilities = [];
    evaluationData.frames.forEach(frame => {
        let frameFirstCount = 0;
        let frameAiCount = 0;
        let frameFinalCount = 0;
        let frameMatchedCount = 0;

        CAMERAS.forEach(camKey => {
            const comp = frame.comparison[camKey];
            if (comp) {
                const aiCount = comp.ai_boxes ? comp.ai_boxes.length : 0;
                const userCount = comp.user_boxes ? comp.user_boxes.length : 0;

                frameAiCount += aiCount;
                frameFinalCount += userCount;

                if (comp.first_submission && comp.first_submission.has_snapshot) {
                    const firstMatchedList = comp.first_submission.matched ? comp.first_submission.matched : [];
                    const firstExtraList = comp.first_submission.extra ? comp.first_submission.extra : [];

                    frameFirstCount += (firstMatchedList.length + firstExtraList.length);
                    const matchedOverThreshold = firstMatchedList.filter(m => m.iou >= 0.85).length;
                    frameMatchedCount += matchedOverThreshold;
                } else {
                    frameFirstCount += userCount;
                    frameMatchedCount += userCount;
                }
            }
        });

        let frameRel = 100;
        if (frameFirstCount === 0) {
            if (frameAiCount === 0) {
                frameRel = 100;
            } else {
                frameRel = 0;
            }
        } else {
            if (frameFinalCount === 0) {
                frameRel = 0;
            } else {
                frameRel = Math.min(Math.round((frameMatchedCount / frameFinalCount) * 100), 100);
            }
        }
        frameReliabilities.push(frameRel);
    });

    const userPrecision = frameReliabilities.length > 0 ? Math.round(frameReliabilities.reduce((a, b) => a + b, 0) / frameReliabilities.length) : 100;
    const aiPrecision = totalAi > 0 ? Math.min(Math.round((aiCorrectCount / totalAi) * 100), 100) : 100;
    const averageIoUVal = matchedIoUCount > 0 ? Math.round((totalIoU / matchedIoUCount) * 100) : 0;

    const timeSpentSec = evaluationData.time_spent || 0;
    const timeSpentMin = (timeSpentSec / 60).toFixed(1);

    // Hàm hỗ trợ vẽ vòng tròn thanh tiến trình
    function makeProgressRing(percent, size, strokeWidth, strokeColor, trailColor, textColor) {
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent" stroke="${trailColor}" stroke-width="${strokeWidth}" />
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent" stroke="${strokeColor}" stroke-width="${strokeWidth}"
                        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" />
            </svg>
            <div style="position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <span style="font-size:18px;font-weight:800;color:${textColor};font-family:Inter,sans-serif;">${percent}%</span>
            </div>
        `;
    }

    function getMetricColor(percent) {
        if (percent >= 85) {
            return { color: '#10B981', trail: '#D1FAE5' };
        } else if (percent >= 70) {
            return { color: '#3B82F6', trail: '#DBEAFE' };
        } else if (percent >= 50) {
            return { color: '#F59E0B', trail: '#FEF3C7' };
        } else {
            return { color: '#EF4444', trail: '#FEE2E2' };
        }
    }

    const simColors = getMetricColor(overallSimilarity);
    const userColors = getMetricColor(userPrecision);
    const aiColors = getMetricColor(aiPrecision);

    // Determine overall feedback text
    let ratingText = 'Độ lệch lớn';
    let ratingColor = '#EF4444';
    let ratingBg = '#FEF2F2';
    if (overallSimilarity >= 85) {
        ratingText = 'Xuất sắc';
        ratingColor = '#10B981';
        ratingBg = '#ECFDF5';
    } else if (overallSimilarity >= 70) {
        ratingText = 'Đạt yêu cầu';
        ratingColor = '#3B82F6';
        ratingBg = '#EFF6FF';
    } else if (overallSimilarity >= 50) {
        ratingText = 'Cần kiểm tra';
        ratingColor = '#F59E0B';
        ratingBg = '#FFFBEB';
    }

    // Logic gợi ý tự động của hệ thống
    const isTimeTooShort = (timeSpentSec > 0 && timeSpentSec < 120);
    const isSimilarityTooHigh = (overallSimilarity >= 99);

    let suggestionBg = '#F0FDF4';
    let suggestionBorder = '#BBF7D0';
    let suggestionIconBg = '#DCFCE7';
    let suggestionIconColor = '#16A34A';
    let suggestionIcon = 'fa-solid fa-circle-check';
    let suggestionTitleColor = '#166534';
    let suggestionTextColor = '#14532D';
    let suggestionText = 'Hiện không phát hiện có gì bất thường.';

    if (isTimeTooShort && isSimilarityTooHigh) {
        suggestionBg = '#FEF2F2';
        suggestionBorder = '#FCA5A5';
        suggestionIconBg = '#FEE2E2';
        suggestionIconColor = '#EF4444';
        suggestionIcon = 'fa-solid fa-triangle-exclamation';
        suggestionTitleColor = '#991B1B';
        suggestionTextColor = '#7F1D1D';
        suggestionText = `<b>Nghi ngờ gian lận:</b> Người dùng gán nhãn cực nhanh (${timeSpentMin} phút) và kết quả trùng khớp với AI tuyệt đối (${overallSimilarity}%). Rất có thể người này chỉ chạy AI rồi nộp bài luôn.`;
    } else if (isTimeTooShort) {
        suggestionBg = '#FFFBEB';
        suggestionBorder = '#FDE68A';
        suggestionIconBg = '#FEF3C7';
        suggestionIconColor = '#D97706';
        suggestionIcon = 'fa-solid fa-triangle-exclamation';
        suggestionTitleColor = '#92400E';
        suggestionTextColor = '#78350F';
        suggestionText = `<b>Thời gian quá ngắn:</b> Người gán nhãn hoàn thành nhiệm vụ chỉ trong ${timeSpentMin} phút. Vui lòng kiểm tra kỹ xem họ có làm ẩu hoặc bỏ sót nhãn không.`;
    } else if (isSimilarityTooHigh) {
        suggestionBg = '#FFFBEB';
        suggestionBorder = '#FDE68A';
        suggestionIconBg = '#FEF3C7';
        suggestionIconColor = '#D97706';
        suggestionIcon = 'fa-solid fa-triangle-exclamation';
        suggestionTitleColor = '#92400E';
        suggestionTextColor = '#78350F';
        suggestionText = `<b>Độ trùng khớp cực cao:</b> Kết quả trùng khớp gần như hoàn toàn với AI (${overallSimilarity}%). Cần rà soát xem người dùng có thực sự kiểm tra và sửa đổi các nhãn lỗi từ AI hay không.`;
    }

    // Danh sách thống kê theo góc camera
    const cameraRows = Object.keys(cameraStats).map(camKey => {
        const c = cameraStats[camKey];
        const avg = c.count > 0 ? Math.round(c.totalSimilarity / c.count) : 0;
        let camColor = '#10B981';
        if (avg < 50) camColor = '#EF4444';
        else if (avg < 75) camColor = '#F59E0B';
        return {
            name: CAM_LABELS[camKey] || camKey,
            avg: avg,
            color: camColor,
            user: c.totalUser,
            matched: c.matched,
            missing: c.missing,
            extra: c.extra
        };
    }).sort((a, b) => b.avg - a.avg);

    // Danh sách nhầm lẫn nhãn
    const confusionList = Object.keys(confusionMap).map(key => {
        const [aiCat, userCat] = key.split('::');
        const count = confusionMap[key];
        const aiCls = CLASS_MAP[aiCat] || { name: aiCat };
        const userCls = CLASS_MAP[userCat] || { name: userCat };
        return {
            ai: aiCls.name,
            user: userCls.name,
            count: count
        };
    }).sort((a, b) => b.count - a.count);



    // Hiển thị nội dung HTML
    container.innerHTML = `
        <!-- Overview Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px;">
            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#EEF2FF;color:#4F46E5;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-solid fa-robot"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Tổng nhãn <b style="color:black">AI</b></div>
                    <div style="font-size:22px;font-weight:800;color:#0F172A;margin-top:2px;">${totalAi}</div>
                </div>
            </div>
            
            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#EFF6FF;color:#2563EB;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Tổng nhãn Người dùng</div>
                    <div style="font-size:22px;font-weight:800;color:#0F172A;margin-top:2px;">${totalUser}</div>
                </div>
            </div>

            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#ECFDF5;color:#10B981;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-solid fa-circle-check"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Tổng nhãn trùng khớp</div>
                    <div style="font-size:22px;font-weight:800;color:#10B981;margin-top:2px;">${totalMatched}</div>
                </div>
            </div>

            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#FFF7ED;color:#EA580C;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-regular fa-clock"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Thời gian gán nhãn</div>
                    <div style="font-size:22px;font-weight:800;color:#EA580C;margin-top:2px;">${timeSpentMin} phút</div>
                </div>
            </div>

        </div>

        <!-- Vùng hiển thị biểu đồ và các chỉ số chính -->
        <div style="display:grid;grid-template-columns: 1.1fr 0.9fr;gap:24px;margin-bottom:24px;align-items:stretch;">
            <!-- Cột biểu đồ bên trái (Các vòng tròn tiến trình) -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;display:flex;flex-direction:column;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:20px;display:flex;align-items:center;">
                    <span>Chỉ số Đánh giá Chất lượng</span>
                    <span style="margin-left:auto;font-size:11px;padding:2px 10px;border-radius:12px;background:${ratingBg};color:${ratingColor};font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">${ratingText}</span>
                </div>
                
                <div style="display:flex;justify-content:space-around;align-items:center;flex:1;padding:10px 0;">
                    <div style="display:flex;flex-direction:column;align-items:center;position:relative;width:90px;height:90px;justify-content:center;">
                        <div class="stats-circle-container">
                            ${makeProgressRing(overallSimilarity, 88, 7, simColors.color, simColors.trail, simColors.color)}
                        </div>
                        <span style="font-size:12px;font-weight:700;color:#334155;margin-top:8px;white-space:nowrap;">Độ tương đồng</span>
                    </div>

                    <div style="display:flex;flex-direction:column;align-items:center;position:relative;width:90px;height:90px;justify-content:center;">
                        <div class="stats-circle-container">
                            ${makeProgressRing(userPrecision, 88, 7, userColors.color, userColors.trail, userColors.color)}
                        </div>
                        <span style="font-size:12px;font-weight:700;color:#334155;margin-top:8px;white-space:nowrap;">Độ tin cậy Người dùng</span>
                    </div>

                    <div style="display:flex;flex-direction:column;align-items:center;position:relative;width:90px;height:90px;justify-content:center;">
                        <div class="stats-circle-container">
                            ${makeProgressRing(aiPrecision, 88, 7, aiColors.color, aiColors.trail, aiColors.color)}
                        </div>
                        <span style="font-size:12px;font-weight:700;color:#334155;margin-top:8px;white-space:nowrap;">Độ tin cậy AI</span>
                    </div>
                </div>

                <!-- Hệ thống gợi ý -->
                <div style="margin-top:20px;padding:12px 16px;border-radius:10px;background:${suggestionBg};border:1px solid ${suggestionBorder};display:flex;align-items:start;gap:12px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:${suggestionIconBg};color:${suggestionIconColor};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">
                        <i class="${suggestionIcon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:12px;font-weight:800;color:${suggestionTitleColor};text-transform:uppercase;letter-spacing:0.5px;">Hệ thống gợi ý</div>
                        <div style="font-size:12px;color:${suggestionTextColor};margin-top:4px;line-height:1.5;">${suggestionText}</div>
                    </div>
                </div>

            </div>

            <!-- Cột bên phải (Phân tích hiệu suất theo camera) -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;display:flex;flex-direction:column;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:16px;">Hiệu năng theo Góc Camera</div>
                <div style="flex:1;overflow-y:auto;max-height:220px;padding-right:4px;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
                        <thead>
                            <tr style="border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:700;">
                                <th style="padding:6px 0;">Camera</th>
                                <th style="padding:6px 0;text-align:center;">Độ khớp</th>
                                <th style="padding:6px 0;text-align:center;">Nhãn trùng</th>
                                <th style="padding:6px 0;text-align:center;">Nhãn dư</th>
                                <th style="padding:6px 0;text-align:center;">Nhãn thiếu</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cameraRows.map(row => `
                                <tr style="border-bottom:1px solid #F1F5F9;color:#334155;">
                                    <td style="padding:8px 0;font-weight:700;color:#0F172A;">${row.name}</td>
                                    <td style="padding:8px 0;text-align:center;font-weight:700;color:${row.color}">${row.avg}%</td>
                                    <td style="padding:8px 0;text-align:center;color:#10B981;">${row.matched}</td>
                                    <td style="padding:8px 0;text-align:center;color:#EF4444;">${row.extra}</td>
                                    <td style="padding:8px 0;text-align:center;color:#F59E0B;">${row.missing}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Vùng hiển thị hiệu suất theo lớp đối tượng & Ma trận nhầm lẫn -->
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:24px;">
            <!-- Bên trái: Thống kê theo lớp đối tượng -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:16px;">Chi tiết hiệu năng theo Lớp đối tượng</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:700;">
                            <th style="padding:6px 0;">Lớp đối tượng</th>
                            <th style="padding:6px 0;text-align:center;">Trùng khớp</th>
                            <th style="padding:6px 0;text-align:center;">Dư thừa</th>
                            <th style="padding:6px 0;text-align:center;">Thiếu sót</th>
                            <th style="padding:6px 0;text-align:center;">Độ khớp</th>
                            <th style="padding:6px 0;text-align:center;">Độ chính xác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${CLASSES.map(cls => {
        const stat = classStats[cls.id] || { matched: 0, missing: 0, extra: 0, sumIoU: 0 };
        const total = stat.matched + stat.missing + stat.extra;
        const accuracy = total > 0 ? Math.round((stat.matched / total) * 100) : 100;
        const avgIoU = stat.matched > 0 ? Math.round((stat.sumIoU / stat.matched) * 100) : 0;
        return `
                                <tr style="border-bottom:1px solid #F1F5F9;color:#334155;">
                                    <td style="padding:10px 0;font-weight:600;display:flex;align-items:center;gap:8px;">
                                        <div style="width:24px;height:24px;border-radius:6px;background:${cls.color}15;color:${cls.color};display:flex;align-items:center;justify-content:center;">
                                            <i class="fa-solid ${cls.icon}" style="font-size:11px;"></i>
                                        </div>
                                        <span>${cls.name}</span>
                                    </td>
                                    <td style="padding:10px 0;text-align:center;color:#10B981;font-weight:600;">${stat.matched}</td>
                                    <td style="padding:10px 0;text-align:center;color:#EF4444;">${stat.extra}</td>
                                    <td style="padding:10px 0;text-align:center;color:#F59E0B;">${stat.missing}</td>
                                    <td style="padding:10px 0;text-align:center;color:#64748B;">${avgIoU}%</td>
                                    <td style="padding:10px 0;text-align:center;font-weight:700;color:${accuracy >= 85 ? '#10B981' : (accuracy >= 60 ? '#3B82F6' : '#EF4444')}">${accuracy}%</td>
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Bên phải: Danh sách các nhãn bị nhầm lẫn -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;display:flex;flex-direction:column;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:12px;">Phân tích Nhầm lẫn Nhãn</div>
                <p style="font-size:11px;color:#64748B;line-height:1.4;margin:0 0 16px 0;">Đối tượng vẽ trùng vị trí nhưng gán nhầm loại nhãn (IoU > 30%):</p>
                <div style="flex:1;overflow-y:auto;max-height:220px;padding-right:4px;">
                    ${confusionList.length === 0 ? `
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94A3B8;padding:24px 0;">
                            <i class="fa-solid fa-circle-check" style="font-size:24px;color:#10B981;margin-bottom:8px;"></i>
                            <span style="font-size:12px;font-weight:500;">Không phát hiện lỗi nhầm lẫn nhãn nào!</span>
                        </div>
                    ` : `
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            ${confusionList.map(item => `
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:11px;color:#78350F;">
                                    <div style="display:flex;align-items:center;gap:6px;font-weight:600;">
                                        <span style="color:#B45309;">AI: ${item.ai}</span>
                                        <i class="fa-solid fa-arrow-right" style="color:#D97706;font-size:9px;"></i>
                                        <span style="color:#1E3A8A;background:#DBEAFE;padding:2px 6px;border-radius:4px;">Người: ${item.user}</span>
                                    </div>
                                    <div style="font-weight:800;background:#F59E0B;color:#fff;border-radius:12px;padding:1px 8px;">
                                        ${item.count} lần
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>

        <!-- Đánh giá Section -->
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;margin-top:24px;box-shadow: 0 4px 20px rgba(0,0,0,0.02);text-align:left;">
            <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                <div style="width:28px;height:28px;border-radius:8px;background:#EDE9FE;color:#7C3AED;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-stamp" style="font-size:14px;"></i>
                </div>
                <span>Đánh giá chất lượng nhiệm vụ</span>
            </div>
            
            ${(evaluationData.status === 'approved' || evaluationData.status === 'rejected') ? `
                <div style="display:flex;flex-direction:column;gap:16px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:13px;font-weight:600;color:#475569;">Kết quả đánh giá:</span>
                        ${evaluationData.status === 'approved' ? `
                            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:#ECFDF5;color:#059669;border-radius:20px;font-size:13px;font-weight:700;border:1px solid #A7F3D0;">
                                <i class="fa-solid fa-circle-check"></i> Đạt yêu cầu
                            </span>
                        ` : `
                            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:#FEF2F2;color:#DC2626;border-radius:20px;font-size:13px;font-weight:700;border:1px solid #FCA5A5;">
                                <i class="fa-solid fa-circle-xmark"></i> Chưa đạt yêu cầu
                            </span>
                        `}
                    </div>
                    <div>
                        <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;">Nội dung gửi tới người gán nhãn:</div>
                        <div style="padding:12px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:13px;color:#334155;white-space:pre-wrap;min-height:60px;">${evaluationData.feedback || 'Không có nội dung gửi thêm.'}</div>
                    </div>
                </div>
            ` : `
                <div style="display:flex;flex-direction:column;gap:16px;">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <span style="font-size:13px;font-weight:600;color:#475569;">Chọn kết quả:</span>
                        <button id="btnEvalReject" onclick="selectEvalStatus('rejected')" style="height:38px;padding:0 20px;background:#fff;color:#64748B;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fa-solid fa-circle-xmark"></i> Chưa đạt yêu cầu
                        </button>
                        <button id="btnEvalApprove" onclick="selectEvalStatus('approved')" style="height:38px;padding:0 20px;background:#fff;color:#64748B;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fa-solid fa-circle-check"></i> Đạt yêu cầu
                        </button>
                    </div>
                    <div>
                        <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:8px;">Nội dung gửi tới người gán nhãn:</div>
                        <textarea id="evalFeedback" placeholder="Nhập nội dung góp ý, nhận xét cho người gán nhãn..." style="width:100%;min-height:80px;padding:12px 16px;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;font-family:inherit;outline:none;resize:vertical;transition:border-color 0.2s;" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#CBD5E1'"></textarea>
                    </div>
                    <div style="display:flex;justify-content:flex-end;">
                        <button id="btnSubmitEval" onclick="submitEvaluation()" style="height:40px;padding:0 24px;background:#7C3AED;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;" onmouseover="this.style.background='#6D28D9'" onmouseout="this.style.background='#7C3AED'">
                            <i class="fa-solid fa-paper-plane"></i> Gửi đánh giá
                        </button>
                    </div>
                </div>
            `}
        </div>
    `;

    // Hiển thị hộp thoại modal
    modal.style.display = 'flex';
}

let selectedEvalStatusValue = null;
function selectEvalStatus(status) {
    selectedEvalStatusValue = status;
    const btnApprove = document.getElementById('btnEvalApprove');
    const btnReject = document.getElementById('btnEvalReject');

    if (status === 'approved') {
        btnApprove.style.background = '#ECFDF5';
        btnApprove.style.color = '#059669';
        btnApprove.style.borderColor = '#10B981';

        btnReject.style.background = '#fff';
        btnReject.style.color = '#64748B';
        btnReject.style.borderColor = '#CBD5E1';
    } else {
        btnReject.style.background = '#FEF2F2';
        btnReject.style.color = '#DC2626';
        btnReject.style.borderColor = '#EF4444';

        btnApprove.style.background = '#fff';
        btnApprove.style.color = '#64748B';
        btnApprove.style.borderColor = '#CBD5E1';
    }
}

async function submitEvaluation() {
    if (!selectedEvalStatusValue) {
        showToast('Vui lòng chọn trạng thái đánh giá (Đạt yêu cầu hoặc Chưa đạt yêu cầu).', 'error');
        return;
    }
    const feedback = document.getElementById('evalFeedback').value.trim();
    const btn = document.getElementById('btnSubmitEval');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...`;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/admin/override`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: selectedEvalStatusValue,
                feedback: feedback
            })
        });
        if (res.ok) {
            showToast('Đã gửi đánh giá chất lượng thành công!', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1200);
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi gửi đánh giá', 'error');
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Gửi đánh giá`;
        }
    } catch (e) {
        console.error(e);
        showToast('Lỗi kết nối server', 'error');
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Gửi đánh giá`;
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        color: #fff;
        z-index: 20000;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        background: ${type === 'success' ? '#16A34A' : '#DC2626'};
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: Inter, sans-serif;
        animation: toastSlideIn 0.3s ease, toastFadeOut 0.3s ease 2.7s;
    `;

    if (!document.getElementById('toast-keyframes-style')) {
        const style = document.createElement('style');
        style.id = 'toast-keyframes-style';
        style.innerHTML = `
            @keyframes toastSlideIn {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes toastFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Khởi tạo trang khi tải hoàn tất
window.onload = () => {
    initPage();
    initPanReview();
};

// Xử lý vẽ lại nhãn khi thay đổi kích thước cửa sổ
window.onresize = () => {
    const mainImg = document.getElementById('mainImage');
    if (mainImg && mainImg.style.display !== 'none') {
        const container = document.querySelector('.canvas-container');
        setupCanvas(container, mainImg);
        redrawAnnotations();
    }
};
