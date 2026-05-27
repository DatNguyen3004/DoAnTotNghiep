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
    approved: { label: 'Đã duyệt', cls: 'st-approved' },
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
    if (task.admin_moderated) {
        return `<span style="color:#10B981;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã duyệt</span>`;
    }
    const s = task.status;
    if (s === 'pending' || s === 'in_progress')
        return `<a href="Label.html?taskId=${task.id}" class="action-link"><i class="fa-solid fa-pen-to-square"></i> Gán nhãn</a>`;
    if (s === 'submitted')
        return `<span style="color:#94A3B8;font-size:12px;font-style:italic"><i class="fa-solid fa-clock"></i> Đợi kiểm tra</span>`;
    if (s === 'under_review')
        return `<span style="color:#7C3AED;font-size:12px;font-style:italic"><i class="fa-solid fa-magnifying-glass"></i> Đang kiểm tra</span>`;
    if (s === 'rejected')
        return `<a href="FrameList.html?taskId=${task.id}&mode=fix" class="action-link rejected-link"><i class="fa-solid fa-triangle-exclamation"></i> Sửa lại</a>`;
    if (s === 'reviewed')
        return `<span style="color:#2563EB;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã kiểm tra</span>`;
    if (s === 'approved')
        return `<span style="color:#10B981;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã duyệt</span>`;
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
