// ============= CONFIG =============
const BASE_URL = 'http://localhost:8000/api';
function getToken() { return localStorage.getItem('access_token'); }

// Auth guard
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'admin') {
    window.location.href = '../login.html';
}

// Project context
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Dashboard';
if (!projectId) {
    window.location.href = 'ManagerProject.html';
}

// Set project name in sidebar
const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) {
    sideProjectNameEl.textContent = projectName;
}

// ============= SIDEBAR TOGGLE =============
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
const toggleBtn = document.getElementById('toggleSidebar');
const floatingBar = document.getElementById('floatingBar');

if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
        if (floatingBar) floatingBar.classList.toggle('expanded-bar');
    });
}

// ============= TABS =============
function switchTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
    if (tabId === 'tab-all-tasks') {
        console.log('Loading all tasks...');
        loadAllTasks();
    }
}

// ============= STATUS HELPERS =============
const STATUS_MAP = {
    pending: { label: 'Chờ xử lý', class: 'st-pending' },
    in_progress: { label: 'Đang làm', class: 'st-in_progress' },
    submitted: { label: 'Đã nộp', class: 'st-submitted' },
    under_review: { label: 'Đang duyệt', class: 'st-under_review' },
    approved: { label: 'Đã duyệt', class: 'st-approved' },
    rejected: { label: 'Bị từ chối', class: 'st-rejected' }
};

function getStatusBadge(status) {
    const info = STATUS_MAP[status] || { label: status, class: 'st-pending' };
    return `<div class="status-badge ${info.class}"><div class="status-dot"></div>${info.label}</div>`;
}

function getActionLink(task) {
    const s = task.status;
    let mainLink = '';
    if (s === 'pending' || s === 'in_progress')
        mainLink = `<span style="color:#94A3B8;font-size:13px;font-style:italic">Đang thực hiện</span>`;
    else if (s === 'submitted')
        mainLink = `<span style="color:#64748B;font-size:12px;font-style:italic"><i class="fa-solid fa-clock"></i> Chờ kiểm tra</span>`;
    else if (s === 'under_review')
        mainLink = `<span style="color:#7C3AED;font-size:12px;font-style:italic"><i class="fa-solid fa-magnifying-glass"></i> Đang kiểm tra</span>`;
    else if (s === 'approved') {
        const adminApproved = JSON.parse(localStorage.getItem('admin_approved_tasks') || '[]');
        if (adminApproved.includes(task.id)) {
            mainLink = `<span style="color:#10B981;font-size:12px;font-weight:600"><i class="fa-solid fa-check-double"></i> Đã phê duyệt</span>`;
        } else {
            mainLink = `<button onclick="showAdminTaskDetail(${task.id})" class="action-link success-link"><i class="fa-solid fa-circle-check"></i> Xem lại</button>`;
        }
    }
    else if (s === 'rejected')
        mainLink = `<button onclick="showAdminTaskDetail(${task.id})" class="action-link rejected-link"><i class="fa-solid fa-eye"></i> Xem lại</button>`;
    else
        mainLink = `<button onclick="showAdminTaskDetail(${task.id})" class="action-link review-link"><i class="fa-solid fa-eye"></i> Xem lại</button>`;

    const deleteBtn = `<button onclick="deleteTask(${task.id})" title="Xóa task"
        style="background:none;border:none;cursor:pointer;color:#CBD5E1;font-size:15px;padding:4px 6px;margin-left:6px;transition:color 0.2s;vertical-align:middle"
        onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='#CBD5E1'">
        <i class="fa-regular fa-trash-can"></i>
    </button>`;
    return mainLink + deleteBtn;
}

function getUserCell(user) {
    if (!user) {
        return `<div class="user-cell"><div class="user-cell-initials">?</div><span class="user-cell-name unassigned">Chưa giao</span></div>`;
    }
    const initials = (user.username || '?').substring(0, 2).toUpperCase();
    const name = user.username || 'N/A';
    return `<div class="user-cell"><div class="user-cell-initials" style="background:#EEF2FF;color:#4F46E5">${initials}</div><span class="user-cell-name">${name}</span></div>`;
}

// ============= LOAD TASKS =============
let allTasks = [];

async function loadTasks() {
    const tbody = document.getElementById('tasksBody');
    tbody.innerHTML = `
        <tr><td colspan="6" style="text-align:center;padding:40px;">
            <div style="color:#94A3B8">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:12px;display:block"></i>
                Đang tải nhiệm vụ...
            </div>
        </td></tr>`;

    try {
        const res = await fetch(`${BASE_URL}/tasks?project_id=${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) {
            showDemoTasks();
            return;
        }

        allTasks = await res.json();
        renderTasks(allTasks);
        updateStats(allTasks);
    } catch (e) {
        console.warn('Tasks API not available, showing demo data:', e);
        showDemoTasks();
    }
}

function showDemoTasks() {
    allTasks = [];
    renderTasks(allTasks);
    updateStats(allTasks);
}

function renderTasks(tasks) {
    const tbody = document.getElementById('tasksBody');

    if (!tasks.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fa-regular fa-folder-open"></i>
                    <h3>Chưa có nhiệm vụ nào</h3>
                    <p>Nhấn "Phân công" để giao nhiệm vụ cho người thực hiện.</p>
                </div>
            </td></tr>`;
        document.getElementById('showingText').textContent = 'Không có dữ liệu';
        document.getElementById('tabBadgeTasks').textContent = 0;
        return;
    }

    tbody.innerHTML = tasks.map((task, idx) => {
        const sceneName = task.scene_name || `Scene #${task.scene_id || task.id}`;
        const sceneDesc = task.scene_description || '';
        const progress = task.frame_count > 0
            ? Math.round((task.annotated_frames / task.frame_count) * 100)
            : 0;
        const progressColor = progress >= 100 ? 'green' : (progress >= 50 ? 'teal' : 'blue');

        return `
            <tr>
                <td style="text-align:center;font-weight:600;color:#64748B">${idx + 1}</td>
                <td>
                    <div class="scene-name">
                        <div class="scene-icon"><i class="fa-solid fa-film"></i></div>
                        <div>
                            <div>${sceneName}</div>
                            ${sceneDesc ? `<div class="scene-meta">${sceneDesc}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${getUserCell(task.assigned_user)}</td>
                <td>${getStatusBadge(task.status)}</td>
                <td>
                    <div class="progress-cell">
                        <div class="progress-bar">
                            <div class="progress-fill ${progressColor}" style="width:${progress}%"></div>
                        </div>
                        <span class="progress-text">${progress}%</span>
                    </div>
                </td>
                <td>${getActionLink(task)}</td>
            </tr>`;
    }).join('');

    document.getElementById('showingText').textContent = `Hiển thị ${tasks.length} nhiệm vụ`;
    document.getElementById('tabBadgeTasks').textContent = tasks.length;
}

function updateStats(tasks) {
    const totalFrames = tasks.reduce((s, t) => s + (t.frame_count || 0), 0);
    const completedTasks = tasks.filter(t => t.status === 'approved').length;
    const needAttention = tasks.filter(t => t.status === 'rejected' || t.status === 'under_review').length;
    const approvedTasks = tasks.filter(t => t.status === 'approved');
    const totalTime = approvedTasks.reduce((s, t) => s + (t.time_spent || 0), 0);
    const avgTime = approvedTasks.length > 0 ? Math.round(totalTime / approvedTasks.length / 60) : 0;
    const completedPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    document.getElementById('statTotalFrames').textContent = totalFrames.toLocaleString();
    document.getElementById('statTotalScenesText').textContent = `${tasks.length} scenes`;
    document.getElementById('statCompleted').textContent = completedTasks;
    document.getElementById('statCompletedPct').textContent = `${completedPct}%`;
    document.getElementById('statNeedAttention').textContent = needAttention;
    document.getElementById('statNeedAttentionText').textContent = needAttention > 0 ? 'Cần xử lý' : 'Tốt';
    document.getElementById('statNeedAttentionText').style.color = needAttention > 0 ? '#D97706' : '#16A34A';
    document.getElementById('statAvgTime').textContent = avgTime || '—';

    const fp = document.getElementById('floatingProgress');
    if (fp) fp.textContent = `${completedPct}% hoàn thành`;
}

// ============= SEARCH =============
document.getElementById('searchTasks').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    const filtered = allTasks.filter(t => {
        const name = (t.scene_name || '').toLowerCase();
        const user = (t.assigned_user?.username || '').toLowerCase();
        return name.includes(q) || user.includes(q);
    });
    renderTasks(filtered);
});

// ============= LOAD MEMBERS =============
let allProjectMembers = [];
let allSystemUsers = [];

async function loadMembers() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) { allProjectMembers = []; renderMembers([]); return; }
        allProjectMembers = await res.json();
        renderMembers(allProjectMembers);
    } catch (e) {
        allProjectMembers = [];
        renderMembers([]);
    }
}

function renderMembers(members) {
    const grid = document.getElementById('membersGrid');
    document.getElementById('tabBadgeMembers').textContent = members.length;

    const colors = ['#4F46E5', '#0891B2', '#7C3AED', '#059669', '#DC2626', '#D97706'];

    if (!members.length) {
        grid.innerHTML = `<div style="text-align:center;padding:40px;color:#94A3B8;font-size:14px;grid-column:1/-1">
            <i class="fa-solid fa-users" style="font-size:32px;display:block;margin-bottom:12px;color:#CBD5E1"></i>
            Chưa có thành viên nào. Nhấn "Thêm thành viên" để bắt đầu.
        </div>`;
        return;
    }

    grid.innerHTML = members.map((m, i) => {
        const initials = (m.username || '?').substring(0, 2).toUpperCase();
        const color = colors[i % colors.length];
        const bgColor = color + '15';
        const roleBadge = m.role === 'admin'
            ? '<span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">Admin</span>'
            : '<span style="background:#DBEAFE;color:#2563EB;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">Người thực hiện</span>';
        const removeBtn = m.role !== 'admin'
            ? `<button onclick="removeMember(${m.id}, '${m.username}')" title="Xóa khỏi dự án"
                style="background:none;border:none;cursor:pointer;color:#CBD5E1;font-size:14px;padding:4px;transition:color 0.2s"
                onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='#CBD5E1'">
                <i class="fa-solid fa-xmark"></i></button>` : '';

        return `
            <div class="member-card">
                <div class="member-avatar-lg" style="background:${bgColor};color:${color}">${initials}</div>
                <div class="member-info">
                    <div class="member-name">${m.full_name || m.username} ${roleBadge}</div>
                    <div class="member-role">@${m.username}</div>
                </div>
                ${removeBtn}
            </div>`;
    }).join('');
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

// ============= ASSIGN MODAL =============
let availableScenes = [];
let availableLabelers = [];

async function openAssignModal() {
    document.getElementById('assignModal').classList.add('active');
    await loadAssignData();
}

function closeAssignModal() {
    document.getElementById('assignModal').classList.remove('active');
}

document.getElementById('assignModal').addEventListener('click', function (e) {
    if (e.target === this) closeAssignModal();
});

async function loadAssignData() {
    // Load scenes chưa có task
    try {
        const sceneRes = await fetch(`${BASE_URL}/projects/${projectId}/scenes`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (sceneRes.ok) {
            const allScenesData = await sceneRes.json();
            const assignedSceneIds = new Set(allTasks.map(t => t.scene_id).filter(Boolean));
            availableScenes = allScenesData.filter(s => !assignedSceneIds.has(s.id));

            const select = document.getElementById('selectScene');
            if (availableScenes.length === 0) {
                select.innerHTML = '<option value="" disabled>Tất cả scene đã được phân công</option>';
                document.getElementById('sceneHelper').textContent = 'Tất cả scene đã được phân công!';
            } else {
                select.innerHTML = '<option value="">-- Chọn scene --</option>';
                availableScenes.forEach(s => {
                    const name = s.name || s.scene_token || `Scene #${s.id}`;
                    const desc = s.description ? ` — ${s.description}` : '';
                    const frames = s.frame_count ? ` (${s.frame_count} frames)` : '';
                    select.innerHTML += `<option value="${s.id}">${name}${desc}${frames}</option>`;
                });
                document.getElementById('sceneHelper').textContent = `${availableScenes.length} scene chưa phân công`;
            }
        } else {
            document.getElementById('sceneHelper').textContent = 'Không thể tải danh sách scene';
        }
    } catch (e) {
        document.getElementById('sceneHelper').textContent = 'Lỗi tải scene';
    }

    // Load labelers — members của project có role=user
    try {
        const memberRes = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (memberRes.ok) {
            const members = await memberRes.json();
            availableLabelers = members.filter(u => u.role === 'user');
            const select = document.getElementById('selectLabeler');
            select.innerHTML = '<option value="">-- Chọn người thực hiện --</option>';
            availableLabelers.forEach(u => {
                const label = u.full_name ? `${u.username} (${u.full_name})` : u.username;
                select.innerHTML += `<option value="${u.id}">${label}</option>`;
            });
        }
    } catch (e) { console.error('Load members failed:', e); }
}

async function submitAssign() {
    const sceneId = document.getElementById('selectScene').value;
    const labelerId = document.getElementById('selectLabeler').value;

    if (!sceneId || !labelerId) {
        showToast('Vui lòng chọn nhiệm vụ và người thực hiện', 'error');
        return;
    }

    const btn = document.getElementById('btnSubmitAssign');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const res = await fetch(`${BASE_URL}/tasks`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_id: parseInt(projectId),
                scene_id: parseInt(sceneId),
                assigned_to: parseInt(labelerId)
            })
        });

        if (res.ok) {
            showToast('Đã phân công thành công!', 'success');
            closeAssignModal();
            loadTasks();
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi phân công', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối server', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Phân công';
    }
}

// ============= ADD MEMBER MODAL =============
async function openAddMemberModal() {
    document.getElementById('addMemberModal').classList.add('active');
    document.getElementById('memberSearchInput').value = '';

    try {
        const res = await fetch(`${BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (res.ok) allSystemUsers = await res.json();
    } catch (e) { allSystemUsers = []; }

    renderUserPickerList(allSystemUsers);
}

function closeAddMemberModal() {
    document.getElementById('addMemberModal').classList.remove('active');
}

document.getElementById('addMemberModal').addEventListener('click', function (e) {
    if (e.target === this) closeAddMemberModal();
});

function filterUserList(q) {
    const filtered = allSystemUsers.filter(u => {
        const name = (u.full_name || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        return name.includes(q.toLowerCase()) || username.includes(q.toLowerCase());
    });
    renderUserPickerList(filtered);
}

function renderUserPickerList(users) {
    const list = document.getElementById('userPickerList');
    const memberIds = new Set(allProjectMembers.map(m => m.id));
    const available = users.filter(u => !memberIds.has(u.id) && u.role !== 'admin');

    document.getElementById('memberPickerHelper').textContent =
        `${available.length} người dùng chưa trong dự án`;

    if (!available.length) {
        list.innerHTML = `<div style="text-align:center;padding:32px;color:#94A3B8;font-size:14px">
            <i class="fa-solid fa-users" style="font-size:28px;display:block;margin-bottom:8px;color:#CBD5E1"></i>
            Tất cả người dùng đã trong dự án
        </div>`;
        return;
    }

    const colors = ['#4F46E5', '#0891B2', '#7C3AED', '#059669', '#DC2626', '#D97706'];
    list.innerHTML = available.map((u, i) => {
        const initials = (u.username || '?').substring(0, 2).toUpperCase();
        const color = colors[i % colors.length];
        return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #F1F5F9;transition:background 0.15s"
                 onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background=''">
                <div style="width:36px;height:36px;border-radius:10px;background:${color}15;color:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${initials}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:14px;color:#1E293B">${u.full_name || u.username}</div>
                    <div style="font-size:12px;color:#94A3B8">@${u.username}</div>
                </div>
                <button onclick="addMember(${u.id}, '${(u.full_name || u.username).replace(/'/g, "\\'")}')"
                    style="padding:6px 16px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap"
                    onmouseover="this.style.background='#1D4ED8'" onmouseout="this.style.background='#2563EB'">
                    <i class="fa-solid fa-plus"></i> Thêm
                </button>
            </div>`;
    }).join('');
}

async function addMember(userId, name) {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });

        if (res.ok) {
            showToast(`Đã thêm "${name}" vào dự án`, 'success');
            await loadMembers();
            renderUserPickerList(allSystemUsers);
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi thêm thành viên', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối server', 'error');
    }
}

async function removeMember(userId, username) {
    showConfirm(`Xóa "${username}" khỏi dự án?`, async () => {
        try {
            const res = await fetch(`${BASE_URL}/projects/${projectId}/members/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                showToast(`Đã xóa "${username}" khỏi dự án`, 'success');
                loadMembers();
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi xóa thành viên', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    }, { title: 'Xóa thành viên', confirmText: 'Xóa', type: 'danger' });
}

// ============= DELETE TASK =============
async function deleteTask(taskId) {
    showConfirm('Xóa task này? Toàn bộ annotation sẽ bị xóa theo.', async () => {
        try {
            const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                showToast('Đã xóa nhiệm vụ', 'success');
                loadTasks();
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi xóa nhiệm vụ', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    }, { title: 'Xóa nhiệm vụ', confirmText: 'Xóa', type: 'danger' });
}

// ============= ALL TASKS TAB =============
async function loadAllTasks() {
    const tbody = document.getElementById('allTasksBody');
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </td></tr>`;

    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/scenes`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        const scenes = await res.json();

        if (!scenes.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:#94A3B8">Chưa có nhiệm vụ nào</td></tr>`;
            document.getElementById('showingAllTasks').textContent = '';
            return;
        }

        tbody.innerHTML = scenes.map((scene, idx) => {
            const name = scene.name || scene.scene_token || `Scene #${scene.id}`;
            const desc = scene.description || '—';
            return `<tr>
                <td style="text-align:center;font-weight:600;color:#64748B">${idx + 1}</td>
                <td>
                    <div class="scene-name">
                        <div class="scene-icon"><i class="fa-solid fa-film"></i></div>
                        <div>
                            <div>${name}</div>
                            <div class="scene-meta">${desc}</div>
                        </div>
                    </div>
                </td>
                <td><span style="font-size:12px;color:#64748B">${scene.frame_count || 0} frames</span></td>
                <td>
                    <button onclick='openSceneEditModal({scene_id:${scene.id},scene_name:"${(name).replace(/"/g,'\\"')}",scene_description:"${(scene.description||'').replace(/"/g,'\\"')}",_previewSceneId:${scene.id}})'
                        class="action-link" style="font-size:12px">
                        <i class="fa-solid fa-pen"></i> Sửa tên
                    </button>
                </td>
            </tr>`;
        }).join('');

        document.getElementById('showingAllTasks').textContent = `${scenes.length} nhiệm vụ`;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:#EF4444">Không thể tải dữ liệu</td></tr>`;
    }
}

// ============= SCENE EDIT MODAL =============
let allScenesData = [];

async function loadAllScenes() {
    const grid = document.getElementById('scenesGrid');
    console.log('loadAllScenes called, grid:', grid, 'projectId:', projectId);
    if (!grid) return;
    if (!projectId) {
        grid.innerHTML = `<div style="grid-column:1/-1;color:#EF4444;padding:24px">Không có projectId</div>`;
        return;
    }
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </div>`;

    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/scenes`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        allScenesData = await res.json();
        renderScenesGrid(allScenesData);
    } catch (e) {
        grid.innerHTML = `<div style="grid-column:1/-1;color:#EF4444;padding:24px">Không thể tải danh sách nhiệm vụ</div>`;
    }
}

function renderScenesGrid(scenes) {
    const grid = document.getElementById('scenesGrid');
    if (!scenes.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94A3B8">Chưa có nhiệm vụ nào</div>`;
        return;
    }
    grid.innerHTML = scenes.map(scene => `
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;transition:box-shadow 0.2s"
             onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow=''">
            <div style="height:140px;background:#0F172A;position:relative;cursor:pointer" onclick="openSceneEditModal({scene_id:${scene.id},scene_name:'${(scene.name||'').replace(/'/g,"\\'")}',scene_description:'${(scene.description||'').replace(/'/g,"\\'")}',_previewSceneId:${scene.id}})">
                <img id="sceneThumb_${scene.id}" src="" alt="${scene.name}"
                    style="width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity 0.3s">
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#475569;font-size:12px" id="sceneThumbLoading_${scene.id}">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                </div>
            </div>
            <div style="padding:14px">
                <div style="font-size:14px;font-weight:700;color:#1E293B;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scene.name || 'Chưa đặt tên'}</div>
                <div style="font-size:12px;color:#64748B;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scene.description || '—'}</div>
                <button onclick="openSceneEditModal({scene_id:${scene.id},scene_name:'${(scene.name||'').replace(/'/g,"\\'")}',scene_description:'${(scene.description||'').replace(/'/g,"\\'")}',_previewSceneId:${scene.id}})"
                    style="width:100%;height:34px;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:700;color:#475569;cursor:pointer;transition:all 0.2s"
                    onmouseover="this.style.background='#2563EB';this.style.color='#fff'" onmouseout="this.style.background='#F1F5F9';this.style.color='#475569'">
                    <i class="fa-solid fa-pen" style="margin-right:6px"></i>Sửa tên & mô tả
                </button>
            </div>
        </div>`).join('');

    // Load thumbnails
    scenes.forEach(scene => loadSceneThumb(scene.id));
}

async function loadSceneThumb(sceneId) {
    try {
        const framesRes = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!framesRes.ok) return;
        const frames = await framesRes.json();
        if (!frames.length) return;

        const imgRes = await fetch(`${BASE_URL}/frames/${frames[0].id}/image/CAM_FRONT`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!imgRes.ok) return;
        const blob = await imgRes.blob();
        const img = document.getElementById(`sceneThumb_${sceneId}`);
        const loading = document.getElementById(`sceneThumbLoading_${sceneId}`);
        if (img) { img.src = URL.createObjectURL(blob); img.style.opacity = '1'; }
        if (loading) loading.style.display = 'none';
    } catch (e) { /* silent */ }
}

// ============= SCENE EDIT MODAL =============
async function openSceneEditModal(task) {
    const sceneId = task.scene_id || task._previewSceneId;
    document.getElementById('sceneEditId').value = sceneId;
    document.getElementById('sceneEditName').value = task.scene_name || '';
    document.getElementById('sceneEditDesc').value = task.scene_description || '';

    // Load preview ảnh CAM_FRONT của frame đầu tiên
    const previewImg = document.getElementById('scenePreviewImg');
    previewImg.src = '';
    try {
        const framesRes = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (framesRes.ok) {
            const frames = await framesRes.json();
            if (frames.length > 0) {
                const imgRes = await fetch(`${BASE_URL}/frames/${frames[0].id}/image/CAM_FRONT`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                });
                if (imgRes.ok) {
                    const blob = await imgRes.blob();
                    previewImg.src = URL.createObjectURL(blob);
                }
            }
        }
    } catch (e) { /* silent */ }

    document.getElementById('sceneEditModal').classList.add('active');
}

function closeSceneEditModal() {
    document.getElementById('sceneEditModal').classList.remove('active');
}

document.getElementById('sceneEditModal').addEventListener('click', function(e) {
    if (e.target === this) closeSceneEditModal();
});

async function saveSceneEdit() {
    const sceneId = document.getElementById('sceneEditId').value;
    const name = document.getElementById('sceneEditName').value.trim();
    const description = document.getElementById('sceneEditDesc').value.trim();

    if (!name) { showToast('Tên không được để trống', 'error'); return; }

    try {
        const res = await fetch(`${BASE_URL}/scenes/${sceneId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (res.ok) {
            showToast('Đã cập nhật tên nhiệm vụ', 'success');
            closeSceneEditModal();
            loadTasks();
            // Reload scenes grid nếu đang ở tab đó
            if (allScenesData.length > 0) loadAllScenes();
        } else {
            showToast('Lỗi cập nhật', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối', 'error');
    }
}

// ============= ADMIN TASK DETAIL MODAL =============
async function showAdminTaskDetail(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const labeler = task.assigned_user;
    const reviewer = task.reviewer_user;
    const s = task.status;

    const statusColor = s === 'approved' ? '#10B981' : s === 'rejected' ? '#EF4444' : '#7C3AED';
    const statusLabel = { approved: 'Đã hoàn thành', rejected: 'Có lỗi', under_review: 'Đang kiểm tra', submitted: 'Đã nộp' }[s] || s;

    const canApprove = s === 'under_review' || s === 'submitted';
    // Kiểm tra đã kiểm tra không lỗi: reviewer đã approve (status = approved từ reviewer)
    const reviewerApproved = s === 'approved';

    const existing = document.getElementById('adminTaskDetailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminTaskDetailModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:460px;box-shadow:0 8px 32px rgba(0,0,0,0.15);font-family:Inter,sans-serif">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
                <div style="font-size:16px;font-weight:800;color:#1E293B">Chi tiết nhiệm vụ</div>
                <button onclick="document.getElementById('adminTaskDetailModal').remove()"
                    style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:20px">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div style="font-size:14px;font-weight:700;color:#1E293B;margin-bottom:16px">${task.scene_name || 'Nhiệm vụ #' + taskId}</div>

            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F8FAFC;border-radius:8px">
                    <span style="font-size:13px;color:#64748B"><i class="fa-solid fa-user" style="margin-right:6px"></i>Người gán nhãn</span>
                    <span style="font-size:13px;font-weight:700;color:#1E293B">${labeler?.username || '—'}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F8FAFC;border-radius:8px">
                    <span style="font-size:13px;color:#64748B"><i class="fa-solid fa-magnifying-glass" style="margin-right:6px"></i>Người kiểm thử</span>
                    <span style="font-size:13px;font-weight:700;color:#1E293B">${reviewer?.username || '—'}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F8FAFC;border-radius:8px">
                    <span style="font-size:13px;color:#64748B"><i class="fa-solid fa-circle-dot" style="margin-right:6px"></i>Trạng thái</span>
                    <span style="font-size:13px;font-weight:700;color:${statusColor}">${statusLabel}</span>
                </div>
                ${reviewerApproved ? `
                <div style="padding:10px 14px;background:#F0FDF4;border-radius:8px;border-left:3px solid #10B981">
                    <div style="font-size:12px;font-weight:700;color:#065F46"><i class="fa-solid fa-circle-check" style="margin-right:6px"></i>Đã kiểm thử — Không có lỗi</div>
                    <div style="font-size:12px;color:#16A34A;margin-top:2px">Reviewer đã xác nhận bài làm đúng</div>
                </div>` : ''}
                ${task.feedback ? `
                <div style="padding:10px 14px;background:#FEF2F2;border-radius:8px;border-left:3px solid #EF4444">
                    <div style="font-size:12px;font-weight:700;color:#991B1B;margin-bottom:4px"><i class="fa-solid fa-comment-dots" style="margin-right:6px"></i>Phản hồi từ reviewer</div>
                    <div style="font-size:12px;color:#7F1D1D;white-space:pre-line">${task.feedback}</div>
                </div>` : ''}
            </div>

            <div style="display:flex;gap:10px">
                ${reviewerApproved ? `
                <button onclick="adminApproveTask(${taskId})"
                    style="flex:1;height:42px;background:#10B981;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
                    <i class="fa-solid fa-check-double"></i> Phê duyệt
                </button>` : `
                <span style="flex:1;height:42px;background:#F1F5F9;color:#94A3B8;border-radius:8px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">
                    <i class="fa-solid fa-clock"></i> Chờ kiểm thử xong
                </span>`}
                <button onclick="document.getElementById('adminTaskDetailModal').remove()"
                    style="height:42px;padding:0 16px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
                    Đóng
                </button>
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

// ============= ADMIN TASK DETAIL MODAL =============
async function showAdminTaskDetail(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    const labeler = task.assigned_user;
    const reviewer = task.reviewer_user;
    const s = task.status;
    const statusColor = s === 'approved' ? '#10B981' : s === 'rejected' ? '#EF4444' : '#7C3AED';
    const statusLabel = { approved: 'Đã hoàn thành', rejected: 'Có lỗi', under_review: 'Đang kiểm tra', submitted: 'Đã nộp' }[s] || s;
    const reviewerApproved = s === 'approved';

    const existing = document.getElementById('adminTaskDetailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminTaskDetailModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:460px;box-shadow:0 8px 32px rgba(0,0,0,0.15);font-family:Inter,sans-serif">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
            <div style="font-size:16px;font-weight:800;color:#1E293B">Chi tiết nhiệm vụ</div>
            <button onclick="document.getElementById('adminTaskDetailModal').remove()" style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:20px"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div style="font-size:14px;font-weight:700;color:#1E293B;margin-bottom:16px">${task.scene_name || 'Nhiệm vụ #' + taskId}</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F8FAFC;border-radius:8px">
                <span style="font-size:13px;color:#64748B"><i class="fa-solid fa-user" style="margin-right:6px"></i>Người gán nhãn</span>
                <span style="font-size:13px;font-weight:700;color:#1E293B">${labeler?.username || '—'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F8FAFC;border-radius:8px">
                <span style="font-size:13px;color:#64748B"><i class="fa-solid fa-magnifying-glass" style="margin-right:6px"></i>Người kiểm thử</span>
                <span style="font-size:13px;font-weight:700;color:#1E293B">${reviewer?.username || '—'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F8FAFC;border-radius:8px">
                <span style="font-size:13px;color:#64748B"><i class="fa-solid fa-circle-dot" style="margin-right:6px"></i>Trạng thái</span>
                <span style="font-size:13px;font-weight:700;color:${statusColor}">${statusLabel}</span>
            </div>
            ${reviewerApproved ? `<div style="padding:10px 14px;background:#F0FDF4;border-radius:8px;border-left:3px solid #10B981">
                <div style="font-size:12px;font-weight:700;color:#065F46"><i class="fa-solid fa-circle-check" style="margin-right:6px"></i>Đã kiểm thử — Không có lỗi</div>
                <div style="font-size:12px;color:#16A34A;margin-top:2px">Reviewer đã xác nhận bài làm đúng</div>
            </div>` : ''}
            ${task.feedback ? `<div style="padding:10px 14px;background:#FEF2F2;border-radius:8px;border-left:3px solid #EF4444">
                <div style="font-size:12px;font-weight:700;color:#991B1B;margin-bottom:4px"><i class="fa-solid fa-comment-dots" style="margin-right:6px"></i>Phản hồi từ reviewer</div>
                <div style="font-size:12px;color:#7F1D1D;white-space:pre-line">${task.feedback}</div>
            </div>` : ''}
        </div>
        <div style="display:flex;gap:10px">
            ${reviewerApproved
                ? `<button onclick="adminApproveTask(${taskId})" style="flex:1;height:42px;background:#10B981;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:Inter,sans-serif">
                    <i class="fa-solid fa-check-double"></i> Phê duyệt
                   </button>`
                : `<span style="flex:1;height:42px;background:#F1F5F9;color:#94A3B8;border-radius:8px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">
                    <i class="fa-solid fa-clock"></i> Chờ kiểm thử xong
                   </span>`
            }
            <button onclick="document.getElementById('adminTaskDetailModal').remove()" style="height:42px;padding:0 16px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Đóng</button>
        </div>
    </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

async function adminApproveTask(taskId) {
    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/admin/override`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' })
        });
        if (res.ok) {
            showToast('Đã phê duyệt nhiệm vụ', 'success');
            document.getElementById('adminTaskDetailModal')?.remove();
            // Đánh dấu admin đã phê duyệt task này
            try {
                const approved = JSON.parse(localStorage.getItem('admin_approved_tasks') || '[]');
                if (!approved.includes(taskId)) approved.push(taskId);
                localStorage.setItem('admin_approved_tasks', JSON.stringify(approved));
            } catch(e) {}
            loadTasks();
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi phê duyệt', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối', 'error');
    }
}

// ============= TOAST =============
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}" style="margin-right:8px"></i>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function adminApproveTask(taskId) {
    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/admin/override`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' })
        });
        if (res.ok) {
            showToast('Đã phê duyệt nhiệm vụ', 'success');
            document.getElementById('adminTaskDetailModal')?.remove();
            try {
                const approved = JSON.parse(localStorage.getItem('admin_approved_tasks') || '[]');
                if (!approved.includes(taskId)) approved.push(taskId);
                localStorage.setItem('admin_approved_tasks', JSON.stringify(approved));
            } catch(e) {}
            loadTasks();
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi phê duyệt', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối', 'error');
    }
}

// ============= TOAST =============
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}" style="margin-right:8px"></i>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============= INIT =============
loadSidebarProject();
loadTasks();
loadMembers();
