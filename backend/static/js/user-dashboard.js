// ============= CONFIG =============
const BASE_URL = '/api';
function getToken() { return localStorage.getItem('access_token'); }

const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}

const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
if (!projectId) window.location.href = 'ManagerProject.html';

const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) sideProjectNameEl.textContent = projectName;

// ============= SIDEBAR TOGGLE =============
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
const toggleBtn = document.getElementById('toggleSidebar');
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
    });
}

// ============= LOAD SIDEBAR PROJECT =============
async function loadSidebarProject() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const project = await res.json();
        if (project.cover_image) {
            const logo = document.getElementById('sideProjectLogo');
            logo.src = project.cover_image;
            logo.style.display = 'block';
            document.getElementById('sideProjectText').style.display = 'none';
        }
        document.getElementById('sideProjectName').textContent = project.name || projectName;
    } catch (e) { /* silent */ }
}

// ============= TABS =============
function switchTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// ============= STATUS HELPERS =============
const STATUS_MAP = {
    pending: { label: 'Chờ xử lý', cls: 'st-pending' },
    in_progress: { label: 'Đang làm', cls: 'st-in_progress' },
    submitted: { label: 'Đợi kiểm tra', cls: 'st-submitted' },
    under_review: { label: 'Đang kiểm tra', cls: 'st-under_review' },
    reviewed: { label: 'Đã kiểm tra', cls: 'st-approved' },
    approved: { label: 'Đạt', cls: 'st-approved' },
    rejected: { label: 'Chưa đạt', cls: 'st-rejected' }
};

function getStatusBadge(status) {
    const info = STATUS_MAP[status] || { label: status, cls: 'st-pending' };
    return `<div class="status-badge ${info.cls}"><div class="status-dot"></div>${info.label}</div>`;
}

function getUserCell(user) {
    if (!user) return `<span style="color:#94A3B8;font-style:italic">—</span>`;
    const initials = (user.username || '?').substring(0, 2).toUpperCase();
    return `<div class="user-cell">
        <div class="user-cell-initials" style="background:#EEF2FF;color:#4F46E5">${initials}</div>
        <span class="user-cell-name">${user.username}</span>
    </div>`;
}

// ============= MY TASKS =============
let myTasks = [];

async function loadMyTasks() {
    const tbody = document.getElementById('myTasksBody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </td></tr>`;
    try {
        const res = await fetch(`${BASE_URL}/tasks?project_id=${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        myTasks = await res.json();
        renderMyTasks(myTasks);
        updateStats(myTasks);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#EF4444">Không thể tải dữ liệu</td></tr>`;
    }
}

function renderMyTasks(tasks) {
    const tbody = document.getElementById('myTasksBody');
    if (!tasks.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
            <i class="fa-regular fa-folder-open"></i>
            <h3>Chưa có nhiệm vụ nào</h3>
            <p>Admin chưa phân công nhiệm vụ cho bạn trong dự án này.</p>
        </div></td></tr>`;
        document.getElementById('showingMyTasks').textContent = 'Không có dữ liệu';
        document.getElementById('tabBadgeMyTasks').textContent = 0;
        return;
    }
    tbody.innerHTML = tasks.map((task, idx) => {
        const name = task.scene_name || `Nhiệm vụ #${task.id}`;
        const desc = task.scene_description || '';
        const progress = task.frame_count > 0 ? Math.round((task.annotated_frames / task.frame_count) * 100) : 0;
        const progressColor = progress >= 100 ? 'green' : (progress >= 50 ? 'teal' : 'blue');
        return `<tr>
            <td style="text-align:center;font-weight:600;color:#64748B">${idx + 1}</td>
            <td><div class="scene-name">
                <div class="scene-icon"><i class="fa-solid fa-film"></i></div>
                <div><div>${name}</div>${desc ? `<div class="scene-meta">${desc}</div>` : ''}</div>
            </div></td>
            <td>${getStatusBadge(task.status)}</td>
            <td><div class="progress-cell">
                <div class="progress-bar"><div class="progress-fill ${progressColor}" style="width:${progress}%"></div></div>
                <span class="progress-text">${task.frame_count > 0 ? progress + '%' : '—'}</span>
            </div></td>
            <td>${getMyTaskAction(task)}</td>
        </tr>`;
    }).join('');
    document.getElementById('showingMyTasks').textContent = `Hiển thị ${tasks.length} nhiệm vụ`;
    document.getElementById('tabBadgeMyTasks').textContent = tasks.length;
}

function getMyTaskAction(task) {
    const s = task.status;
    if (s === 'approved' || s === 'rejected') {
        const feedbackEscaped = (task.feedback || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const statusText = s === 'approved' ? 'Đạt yêu cầu' : 'Chưa đạt yêu cầu';
        return `<button onclick="showEvaluationDetailPopup('${statusText}', '${feedbackEscaped}')" class="action-link" style="border:none;background:#EEF2FF;color:#4F46E5;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:4px;" title="Xem nhận xét từ Admin">
                <i class="fa-solid fa-eye"></i> Xem đánh giá
            </button>`;
    }
    if (s === 'pending' || s === 'in_progress')
        return `<a href="Label.html?taskId=${task.id}" class="action-link"><i class="fa-solid fa-pen-to-square"></i> Gán nhãn</a>`;
    if (s === 'submitted')
        return `<span style="color:#94A3B8;font-size:12px;font-style:italic"><i class="fa-solid fa-clock"></i> Đợi kiểm tra</span>`;
    if (s === 'under_review')
        return `<span style="color:#7C3AED;font-size:12px;font-style:italic"><i class="fa-solid fa-magnifying-glass"></i> Đang kiểm tra</span>`;
    if (s === 'reviewed')
        return `<span style="color:#2563EB;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã kiểm tra</span>`;
    return '<span style="color:#94A3B8">—</span>';
}

// ============= REVIEW TASKS =============
let reviewTasks = [];

async function loadReviewTasks() {
    const tbody = document.getElementById('reviewTasksBody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </td></tr>`;
    try {
        const res = await fetch(`${BASE_URL}/tasks?project_id=${projectId}&role=reviewer`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        reviewTasks = await res.json();
        renderReviewTasks(reviewTasks);
        // Cập nhật lại stats sau khi có reviewTasks
        updateStats(myTasks);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#EF4444">Không thể tải dữ liệu</td></tr>`;
    }
}

function renderReviewTasks(tasks) {
    const tbody = document.getElementById('reviewTasksBody');
    if (!tasks.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
            <i class="fa-solid fa-magnifying-glass"></i>
            <h3>Không có bài cần kiểm tra</h3>
            <p>Hiện tại không có bài nộp nào đang chờ bạn kiểm duyệt.</p>
        </div></td></tr>`;
        document.getElementById('showingReview').textContent = 'Không có dữ liệu';
        document.getElementById('tabBadgeReview').textContent = 0;
        return;
    }
    tbody.innerHTML = tasks.map((task, idx) => {
        const name = task.scene_name || `Nhiệm vụ #${task.id}`;
        const desc = task.scene_description || '';
        const canReview = task.status === 'under_review';
        
        let actionHtml = '';
        if (task.admin_moderated) {
            actionHtml = `<span style="color:#10B981;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã duyệt</span>`;
        } else if (canReview) {
            actionHtml = task.feedback
                ? `<a href="FrameList.html?taskId=${task.id}&mode=review" class="action-link review-link" onclick="sessionStorage.setItem('projectId',${task.project_id || 'null'})"><i class="fa-solid fa-magnifying-glass"></i> Kiểm tra</a>`
                : `<a href="Label_Review.html?taskId=${task.id}&mode=review" class="action-link review-link"><i class="fa-solid fa-magnifying-glass"></i> Kiểm tra</a>`;
        } else if (task.status === 'reviewed') {
            actionHtml = `<span style="color:#2563EB;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã kiểm tra</span>`;
        } else if (task.status === 'approved') {
            actionHtml = `<span style="color:#10B981;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã duyệt</span>`;
        } else if (task.status === 'rejected') {
            actionHtml = `<span style="color:#EF4444;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-xmark"></i> Chưa đạt</span>`;
        } else {
            actionHtml = `<span style="color:#94A3B8">—</span>`;
        }

        return `<tr>
            <td style="text-align:center;font-weight:600;color:#64748B">${idx + 1}</td>
            <td><div class="scene-name">
                <div class="scene-icon" style="background:#FFF7ED;color:#EA580C"><i class="fa-solid fa-film"></i></div>
                <div><div>${name}</div>${desc ? `<div class="scene-meta">${desc}</div>` : ''}</div>
            </div></td>
            <td>${getUserCell(task.assigned_user)}</td>
            <td>${getStatusBadge(task.status)}</td>
            <td>${actionHtml}</td>
        </tr>`;
    }).join('');
    document.getElementById('showingReview').textContent = `${tasks.length} bài cần kiểm thử`;
    document.getElementById('tabBadgeReview').textContent = tasks.length;
}

// ============= STATS =============
function updateStats(tasks) {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'approved').length;
    const rejected = tasks.filter(t => t.status === 'rejected').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    // Số task reviewer đang chờ mình kiểm thử (under_review)
    const pendingReview = reviewTasks.filter(t => t.status === 'under_review').length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statTotalText').textContent = `${total} nhiệm vụ`;
    document.getElementById('statDone').textContent = done;
    document.getElementById('statDonePct').textContent = `${pct}%`;
    document.getElementById('statRejected').textContent = rejected;
    document.getElementById('statReview').textContent = pendingReview;
    document.getElementById('statReviewText').textContent = pendingReview > 0 ? 'đang chờ' : '';
}

// ============= SEARCH =============
document.getElementById('searchMyTasks').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderMyTasks(myTasks.filter(t => (t.scene_name || '').toLowerCase().includes(q)));
});
document.getElementById('searchReview').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderReviewTasks(reviewTasks.filter(t => (t.scene_name || '').toLowerCase().includes(q)));
});

// ============= INIT =============
loadSidebarProject();
loadMyTasks();
loadReviewTasks();

function showEvaluationDetailPopup(statusText, feedbackText) {
    const existing = document.getElementById('evalDetailPopupModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'evalDetailPopupModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);';

    const isApprove = statusText.includes('Đạt');
    const badgeBg = isApprove ? '#ECFDF5' : '#FEF2F2';
    const badgeColor = isApprove ? '#059669' : '#DC2626';
    const badgeBorder = isApprove ? '#A7F3D0' : '#FCA5A5';
    const icon = isApprove ? 'fa-circle-check' : 'fa-circle-xmark';

    modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:440px;box-shadow:0 20px 40px rgba(0,0,0,0.18);font-family:Inter,sans-serif;display:flex;flex-direction:column;animation:popupScaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);box-sizing:border-box;">
        <style>
            @keyframes popupScaleUp {
                from { transform: scale(0.96); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        </style>
        <!-- Header -->
        <div style="padding:20px 24px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;">
            <div style="font-size:16px;font-weight:800;color:#1E293B;display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-stamp" style="color:#7C3AED;"></i>
                Đánh giá từ Admin
            </div>
            <button onclick="document.getElementById('evalDetailPopupModal').remove()" style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:20px;padding:4px;"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Body -->
        <div style="padding:24px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:12px;box-sizing:border-box;">
                <span style="font-size:13px;font-weight:600;color:#475569;">Trạng thái:</span>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:${badgeBg};color:${badgeColor};border-radius:20px;font-size:13px;font-weight:700;border:1px solid ${badgeBorder};box-sizing:border-box;">
                    <i class="fa-solid ${icon}"></i> ${statusText}
                </span>
            </div>
            <div style="box-sizing:border-box;">
                <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;">Nội dung nhận xét:</div>
                <div style="padding:12px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:13px;color:#334155;white-space:pre-wrap;min-height:60px;line-height:1.5;box-sizing:border-box;">${feedbackText || 'Không có nhận xét thêm từ Admin.'}</div>
            </div>
        </div>

        <!-- Footer -->
        <div style="padding:16px 24px;border-top:1px solid #F1F5F9;display:flex;justify-content:flex-end;box-sizing:border-box;">
            <button onclick="document.getElementById('evalDetailPopupModal').remove()" style="height:38px;padding:0 20px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">Đóng</button>
        </div>
    </div>`;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}
