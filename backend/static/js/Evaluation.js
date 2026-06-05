import { state, taskId, resetMatchedState, getCurrentEntries } from './evaluation/state.js';
import { CLASSES, CLASS_MAP, CAMERAS, CAM_LABELS, BASE_URL } from './evaluation/constants.js';
import { fetchEvaluationDetails, fetchFrameImageBlob } from './evaluation/api.js';
import { setupCanvas, redrawAnnotations, zoomIn, zoomOut, resetZoom, applyZoom, initPanReview, applyImageFilter, resetImageFilter } from './evaluation/canvas.js';
import { openEvaluationChat, loadEvaluationChats, deleteEvaluationChat, openEvaluationHistory, loadEvaluationHistory } from './evaluation/chat.js';
import { showEvaluationStats, selectEvalStatus, submitEvaluation } from './evaluation/stats.js';

if (!taskId) {
    window.location.href = 'dashboard.html';
}

// Global functions that mutate/access state local to this entry or imported state
async function initPage() {
    updateLabelTogglesUI();
    try {
        const data = await fetchEvaluationDetails(taskId);
        state.evaluationData = data;

        // Assign a unique client-side ID to each AI box
        let aiBoxIdCounter = 1000000;
        if (state.evaluationData && state.evaluationData.frames) {
            state.evaluationData.frames.forEach(frame => {
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

        // Setup project name / details in UI
        const projNameEl = document.getElementById('projectName');
        if (projNameEl) {
            projNameEl.textContent = state.evaluationData.scene_name || '...';
        }

        // Setup user avatar placeholder
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            avatar.textContent = 'AD';
        }

        // Go to first frame
        if (state.evaluationData.frames.length > 0) {
            await selectFrame(0);
        }

    } catch (err) {
        console.error(err);
        if (err.message === '403') {
            alert('Bạn không có quyền truy cập trang này.');
            window.location.href = '/static/login.html';
        } else {
            alert(err.message || 'Có lỗi xảy ra khi tải trang.');
        }
    } finally {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 300);
        }
    }
}

function firstFrame() {
    if (state.selectedFrameIdx > 0) {
        selectFrame(0);
    }
}

function lastFrame() {
    if (state.selectedFrameIdx < state.evaluationData.frames.length - 1) {
        selectFrame(state.evaluationData.frames.length - 1);
    }
}

function prevFrame() {
    if (state.selectedFrameIdx > 0) {
        selectFrame(state.selectedFrameIdx - 1);
    }
}

function nextFrame() {
    if (state.selectedFrameIdx < state.evaluationData.frames.length - 1) {
        selectFrame(state.selectedFrameIdx + 1);
    }
}

async function selectFrame(idx) {
    state.selectedFrameIdx = idx;
    const frame = state.evaluationData.frames[idx];

    // Update toolbar indicator
    const frameIndEl = document.getElementById('frameIndicator');
    if (frameIndEl) {
        frameIndEl.textContent = `${idx + 1}`;
    }

    // Keep selectedCamera if available, else pick first camera
    if (frame.cameras.length > 0) {
        if (!frame.cameras.includes(state.selectedCamera)) {
            state.selectedCamera = frame.cameras[0];
        }
        renderCamList();
        await loadComparisonImages();
    } else {
        alert('Không có dữ liệu camera cho khung hình này');
    }
}

function renderCamList() {
    const list = document.getElementById('camList');
    if (!list) return;
    const frame = state.evaluationData.frames[state.selectedFrameIdx];

    list.innerHTML = CAMERAS.map(cam => {
        const hasData = frame.cameras.includes(cam);
        const active = cam === state.selectedCamera;

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
        const blob = await fetchFrameImageBlob(frame.id, cam);
        img.src = URL.createObjectURL(blob);
        img.classList.remove('hidden');
        if (nodata) nodata.style.display = 'none';
    } catch (e) {
        img.classList.add('hidden');
        if (nodata) nodata.style.display = 'flex';
    }
}

async function selectCamera(cam) {
    state.selectedCamera = cam;
    renderCamList();
    await loadComparisonImages();
}

async function loadComparisonImages() {
    const frame = state.evaluationData.frames[state.selectedFrameIdx];
    const mainImg = document.getElementById('mainImage');
    if (!mainImg) return;

    resetZoom();

    mainImg.src = '';
    mainImg.style.display = 'none';

    renderMatchedLabels();

    try {
        const blob = await fetchFrameImageBlob(frame.id, state.selectedCamera);
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

export function renderMatchedLabels() {
    renderFrameSimilarityCharts();

    const list = document.getElementById('matchedLabelList');
    const countBadge = document.getElementById('matchedLabelCount');
    if (!list || !state.evaluationData) return;

    const frame = state.evaluationData.frames[state.selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[state.selectedCamera];
    const entries = getCurrentEntries(comp);

    if (countBadge) {
        countBadge.textContent = entries.length;
    }

    if (entries.length === 0) {
        list.innerHTML = `<div style="color:#94A3B8;font-size:12px;text-align:center;padding:20px 0;"><i class="fa-solid fa-magnifying-glass" style="display:block;font-size:18px;margin-bottom:6px;"></i>Không có nhãn nào</div>`;
        return;
    }

    // Group by category
    const groups = {};
    entries.forEach(item => {
        const cat = item.category;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });

    list.innerHTML = Object.entries(groups).map(([cat, items]) => {
        const cls = CLASS_MAP[cat] || { name: cat, color: '#94A3B8', icon: 'fa-tag' };
        const isCollapsed = state.collapsedCategories.has(cat);
        const allAIHidden = items.every(m => {
            const o = state.hiddenMatchedItems.get(String(m.id)) || {};
            return m.type === 'extra' || o.hideAI;
        });
        const allUserHidden = items.every(m => {
            const o = state.hiddenMatchedItems.get(String(m.id)) || {};
            return m.type === 'missing' || o.hideUser;
        });
        const allHidden = items.every(m => {
            const o = state.hiddenMatchedItems.get(String(m.id)) || {};
            return (m.type === 'matched' && o.hideAI && o.hideUser) ||
                (m.type === 'extra' && o.hideUser) ||
                (m.type === 'missing' && o.hideAI);
        });

        const itemsHtml = items.map((item, i) => {
            const isSel = String(state.selectedAnnId) === String(item.id);
            const ov = state.hiddenMatchedItems.get(String(item.id)) || { hideAI: false, hideUser: false };
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

            // Buttons
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

            return `<div onclick="window.selectedAnnId='${item.id}';window.redrawAnnotations();window.renderMatchedLabels();"
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
    if (!container || !state.evaluationData) return;

    const frame = state.evaluationData.frames[state.selectedFrameIdx];
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
    state.currentTool = tool;
    document.querySelectorAll('.tools-section .tool-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tool-${tool}`);
    if (activeBtn) activeBtn.classList.add('active');
    const canvas = document.querySelector('.center-canvas');
    if (canvas) canvas.style.cursor = tool === 'pan' ? 'grab' : 'default';
}

function toggleAI() {
    if (state.showAILabels && !state.showUserLabels) {
        state.showAILabels = true;
        state.showUserLabels = true;
    } else {
        state.showAILabels = true;
        state.showUserLabels = false;
    }
    updateLabelTogglesUI();
    redrawAnnotations();
}

function toggleUser() {
    if (state.showUserLabels && !state.showAILabels) {
        state.showAILabels = true;
        state.showUserLabels = true;
    } else {
        state.showAILabels = false;
        state.showUserLabels = true;
    }
    updateLabelTogglesUI();
    redrawAnnotations();
}

function updateLabelTogglesUI() {
    const btnAI = document.getElementById('btnToggleAI');
    const btnUser = document.getElementById('btnToggleUser');
    if (btnAI) {
        if (state.showAILabels) {
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
        if (state.showUserLabels) {
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

function toggleMatchedAI(userId, event) {
    event.stopPropagation();
    if (!state.evaluationData) return;
    const frame = state.evaluationData.frames[state.selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[state.selectedCamera];
    if (!comp) return;
    const entries = getCurrentEntries(comp);
    const item = entries.find(item => String(item.id) === String(userId));
    if (!item) return;

    const cur = state.hiddenMatchedItems.get(String(userId)) || { hideAI: false, hideUser: false };
    if (item.type === 'matched') {
        if (!cur.hideAI && cur.hideUser) {
            state.hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: false });
        } else {
            state.hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: true });
        }
    } else {
        state.hiddenMatchedItems.set(String(userId), { hideAI: !cur.hideAI, hideUser: false });
    }
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleMatchedUser(userId, event) {
    event.stopPropagation();
    if (!state.evaluationData) return;
    const frame = state.evaluationData.frames[state.selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[state.selectedCamera];
    if (!comp) return;
    const entries = getCurrentEntries(comp);
    const item = entries.find(item => String(item.id) === String(userId));
    if (!item) return;

    const cur = state.hiddenMatchedItems.get(String(userId)) || { hideAI: false, hideUser: false };
    if (item.type === 'matched') {
        if (cur.hideAI && !cur.hideUser) {
            state.hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: false });
        } else {
            state.hiddenMatchedItems.set(String(userId), { hideAI: true, hideUser: false });
        }
    } else {
        state.hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: !cur.hideUser });
    }
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleMatchedVisibility(userId, event) {
    event.stopPropagation();
    if (!state.evaluationData) return;
    const frame = state.evaluationData.frames[state.selectedFrameIdx];
    if (!frame) return;
    const comp = frame.comparison[state.selectedCamera];
    if (!comp) return;
    const entries = getCurrentEntries(comp);
    const item = entries.find(item => String(item.id) === String(userId));
    if (!item) return;

    const cur = state.hiddenMatchedItems.get(String(userId)) || { hideAI: false, hideUser: false };
    const currentlyHidden = (item.type === 'matched' && cur.hideAI && cur.hideUser) ||
        (item.type === 'extra' && cur.hideUser) ||
        (item.type === 'missing' && cur.hideAI);

    if (item.type === 'matched') {
        state.hiddenMatchedItems.set(String(userId), { hideAI: !currentlyHidden, hideUser: !currentlyHidden });
    } else if (item.type === 'extra') {
        state.hiddenMatchedItems.set(String(userId), { hideAI: false, hideUser: !currentlyHidden });
    } else if (item.type === 'missing') {
        state.hiddenMatchedItems.set(String(userId), { hideAI: !currentlyHidden, hideUser: false });
    }
    renderMatchedLabels();
    redrawAnnotations();
}

function toggleCategory(cat, event) {
    event.stopPropagation();
    if (state.collapsedCategories.has(cat)) state.collapsedCategories.delete(cat);
    else state.collapsedCategories.add(cat);
    renderMatchedLabels();
}

function toggleCategoryVisibility(cat, event) {
    event.stopPropagation();
    if (!state.evaluationData) return;
    const comp = state.evaluationData.frames[state.selectedFrameIdx]?.comparison[state.selectedCamera];
    if (!comp) return;

    const entries = getCurrentEntries(comp).filter(item => item.category === cat);
    const allHidden = entries.every(item => {
        const o = state.hiddenMatchedItems.get(String(item.id)) || {};
        return (item.type === 'matched' && o.hideAI && o.hideUser) ||
            (item.type === 'extra' && o.hideUser) ||
            (item.type === 'missing' && o.hideAI);
    });

    entries.forEach(item => {
        const idStr = String(item.id);
        if (item.type === 'matched') {
            state.hiddenMatchedItems.set(idStr, { hideAI: !allHidden, hideUser: !allHidden });
        } else if (item.type === 'extra') {
            state.hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: !allHidden });
        } else if (item.type === 'missing') {
            state.hiddenMatchedItems.set(idStr, { hideAI: !allHidden, hideUser: false });
        }
    });

    renderMatchedLabels();
    redrawAnnotations();
}

function toggleCategoryAI(cat, event) {
    event.stopPropagation();
    if (!state.evaluationData) return;
    const comp = state.evaluationData.frames[state.selectedFrameIdx]?.comparison[state.selectedCamera];
    if (!comp) return;

    const entries = getCurrentEntries(comp).filter(item => item.category === cat);
    if (entries.length === 0) return;

    const allShowOnlyAI = entries.every(item => {
        const o = state.hiddenMatchedItems.get(String(item.id)) || { hideAI: false, hideUser: false };
        if (item.type === 'matched') return !o.hideAI && o.hideUser;
        if (item.type === 'missing') return !o.hideAI;
        return true;
    });

    entries.forEach(item => {
        const idStr = String(item.id);
        if (item.type === 'matched') {
            if (allShowOnlyAI) {
                state.hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
            } else {
                state.hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: true });
            }
        } else if (item.type === 'missing') {
            state.hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
        } else if (item.type === 'extra') {
            state.hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: !allShowOnlyAI });
        }
    });

    renderMatchedLabels();
    redrawAnnotations();
}

function toggleCategoryUser(cat, event) {
    event.stopPropagation();
    if (!state.evaluationData) return;
    const comp = state.evaluationData.frames[state.selectedFrameIdx]?.comparison[state.selectedCamera];
    if (!comp) return;

    const entries = getCurrentEntries(comp).filter(item => item.category === cat);
    if (entries.length === 0) return;

    const allShowOnlyUser = entries.every(item => {
        const o = state.hiddenMatchedItems.get(String(item.id)) || { hideAI: false, hideUser: false };
        if (item.type === 'matched') return o.hideAI && !o.hideUser;
        if (item.type === 'extra') return !o.hideUser;
        return true;
    });

    entries.forEach(item => {
        const idStr = String(item.id);
        if (item.type === 'matched') {
            if (allShowOnlyUser) {
                state.hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
            } else {
                state.hiddenMatchedItems.set(idStr, { hideAI: true, hideUser: false });
            }
        } else if (item.type === 'extra') {
            state.hiddenMatchedItems.set(idStr, { hideAI: false, hideUser: false });
        } else if (item.type === 'missing') {
            state.hiddenMatchedItems.set(idStr, { hideAI: !allShowOnlyUser, hideUser: false });
        }
    });

    renderMatchedLabels();
    redrawAnnotations();
}

function openTaskInfo() {
    const modal = document.getElementById('modalTaskInfo');
    if (!modal || !state.evaluationData) return;
    document.getElementById('infoProjectName').textContent = state.evaluationData.scene_name || '—';
    document.getElementById('infoTaskName').textContent = state.evaluationData.scene_description || 'Không có mô tả';
    document.getElementById('infoLabeler').textContent = state.evaluationData.labeler
        ? (state.evaluationData.labeler.username + (state.evaluationData.labeler.full_name ? ' — ' + state.evaluationData.labeler.full_name : ''))
        : '—';
    document.getElementById('infoReviewer').textContent = state.evaluationData.reviewer
        ? (state.evaluationData.reviewer.username + (state.evaluationData.reviewer.full_name ? ' — ' + state.evaluationData.reviewer.full_name : ''))
        : 'Chưa phân công';
    modal.style.display = 'flex';
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

export function showToast(message, type = 'success') {
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

// Bind methods to window object for inline HTML event handlers
window.firstFrame = firstFrame;
window.lastFrame = lastFrame;
window.prevFrame = prevFrame;
window.nextFrame = nextFrame;
window.selectFrame = selectFrame;
window.selectCamera = selectCamera;
window.toggleAI = toggleAI;
window.toggleUser = toggleUser;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.resetZoom = resetZoom;
window.openTaskInfo = openTaskInfo;
window.openEvaluationChat = openEvaluationChat;
window.deleteEvaluationChat = deleteEvaluationChat;
window.openEvaluationHistory = openEvaluationHistory;
window.applyImageFilter = applyImageFilter;
window.resetImageFilter = resetImageFilter;
window.showEvaluationStats = showEvaluationStats;
window.selectEvalStatus = selectEvalStatus;
window.submitEvaluation = submitEvaluation;
window.toggleSectionCollapse = toggleSectionCollapse;
window.setActiveTool = setActiveTool;

window.toggleMatchedAI = toggleMatchedAI;
window.toggleMatchedUser = toggleMatchedUser;
window.toggleMatchedVisibility = toggleMatchedVisibility;
window.toggleCategory = toggleCategory;
window.toggleCategoryVisibility = toggleCategoryVisibility;
window.toggleCategoryAI = toggleCategoryAI;
window.toggleCategoryUser = toggleCategoryUser;

// We also expose selection variables so the inline functions on items can set them
Object.defineProperty(window, 'selectedAnnId', {
    get: () => state.selectedAnnId,
    set: (val) => { state.selectedAnnId = val; }
});
window.redrawAnnotations = redrawAnnotations;
window.renderMatchedLabels = renderMatchedLabels;

// Keyboard shortcuts listener
window.addEventListener('keydown', (e) => {
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
        const frame = state.evaluationData?.frames[state.selectedFrameIdx];
        if (frame && frame.cameras.includes(targetCam)) {
            selectCamera(targetCam);
        }
    }

    // Camera switching with ArrowUp/ArrowDown or W/S
    if ((key === 'arrowup' && !e.ctrlKey) || key === 'w') {
        e.preventDefault();
        const curIdx = CAMERAS.indexOf(state.selectedCamera);
        if (curIdx > -1) {
            const frame = state.evaluationData?.frames[state.selectedFrameIdx];
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
        const curIdx = CAMERAS.indexOf(state.selectedCamera);
        if (curIdx > -1) {
            const frame = state.evaluationData?.frames[state.selectedFrameIdx];
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

// Event listener for Nop button
document.getElementById('btnNop')?.addEventListener('click', () => {
    showEvaluationStats();
});

// Init on run
initPage();
initPanReview();

window.onresize = () => {
    const mainImg = document.getElementById('mainImage');
    if (mainImg && mainImg.style.display !== 'none') {
        const container = document.querySelector('.canvas-container');
        setupCanvas(container, mainImg);
        redrawAnnotations();
    }
};
