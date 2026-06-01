// ============= CONFIG =============
const BASE_URL = '/api';
function getToken() { return localStorage.getItem('access_token'); }

// Auth guard
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'admin') {
    window.location.href = '../login.html';
}

// Project context
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
if (!projectId) {
    window.location.href = 'ManagerProject.html';
}

// Set project name in sidebar
const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) {
    sideProjectNameEl.textContent = projectName;
}

// Load topnav avatar from localStorage
const topnavAvatarEl = document.getElementById('topnavAvatar');
if (topnavAvatarEl && currentUser.avatar_url) {
    topnavAvatarEl.src = currentUser.avatar_url;
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
    submitted: { label: 'Đợi kiểm tra', class: 'st-submitted' },
    under_review: { label: 'Đang kiểm tra', class: 'st-under_review' },
    reviewed: { label: 'Đã kiểm tra', class: 'st-approved' },
    approved: { label: 'Đã duyệt', class: 'st-approved' },
    rejected: { label: 'Có lỗi', class: 'st-rejected' }
};

function getStatusBadge(status) {
    const info = STATUS_MAP[status] || { label: status, class: 'st-pending' };
    return `<div class="status-badge ${info.class}"><div class="status-dot"></div>${info.label}</div>`;
}

function getActionLink(task) {
    const s = task.status;
    let mainLink = '';
    if (s === 'pending' || s === 'in_progress')
        mainLink = `<span style="color:#94A3B8;font-size:13px;font-style:italic"></span>`;
    else if (s === 'submitted')
        mainLink = `<span style="color:#64748B;font-size:12px;font-style:italic"><i class="fa-solid fa-clock"></i> Chờ kiểm tra</span>`;
    else if (s === 'under_review')
        mainLink = `<span style="color:#7C3AED;font-size:12px;font-style:italic"><i class="fa-solid fa-magnifying-glass"></i> Đang kiểm tra</span>`;
    else if (s === 'reviewed')
        mainLink = `<a href="Evaluation.html?taskId=${task.id}" class="action-link review-link" style="text-decoration:none"><i class="fa-solid fa-eye"></i> Đánh giá</a>`;
    else if (s === 'approved')
        mainLink = `<button onclick="showAdminTaskDetail(${task.id})" class="action-link success-link" style="padding:6px 10px" title="Xem chi tiết"><i class="fa-solid fa-eye"></i></button>`;
    else if (s === 'rejected')
        mainLink = `<button onclick="showAdminTaskDetail(${task.id})" class="action-link rejected-link" style="padding:6px 10px" title="Xem chi tiết"><i class="fa-solid fa-eye"></i></button>`;

    const deleteBtn = `<button onclick="deleteTask(${task.id})" title="Xóa nhiệm vụ"
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
                Đang tải...
            </div>
        </td></tr>`;

    try {
        const tasksRes = await fetch(`${BASE_URL}/tasks?project_id=${projectId}&t=${Date.now()}`, { headers: { Authorization: `Bearer ${getToken()}` } });

        if (!tasksRes.ok) {
            showDemoTasks();
            return;
        }

        allTasks = await tasksRes.json();
        console.log("DEBUG - Dữ liệu nhiệm vụ nhận được:", allTasks); // Dòng này để soi lỗi
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
        const sceneName = task.scene_name || `Nhiệm vụ #${task.scene_id || task.id}`;
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

    // Hiệu suất: tính trên các task đã hoàn thành (approved hoặc reviewed)
    const doneTasks = tasks.filter(t => (t.status === 'approved' || t.status === 'reviewed'));
    let avgTimeDisplay = 0;
    if (doneTasks.length > 0) {
        // Tổng thời gian = labeler time + reviewer time
        const totalTimeSeconds = doneTasks.reduce((s, t) => s + (t.time_spent || 0) + (t.reviewer_time_spent || 0), 0);
        if (totalTimeSeconds > 0) {
            // Tính trung bình Phút / Nhiệm vụ
            const avgMinutes = (totalTimeSeconds / doneTasks.length) / 60;
            avgTimeDisplay = Math.max(1, Math.round(avgMinutes)); // Tối thiểu 1 phút nếu có thời gian
        }
    }

    const completedPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    document.getElementById('statTotalFrames').textContent = totalFrames.toLocaleString();
    document.getElementById('statTotalScenesText').textContent = `${tasks.length} nhiệm vụ`;
    document.getElementById('statCompleted').textContent = completedTasks;
    document.getElementById('statCompletedPct').textContent = `${completedPct}%`;
    document.getElementById('statNeedAttention').textContent = needAttention;
    document.getElementById('statNeedAttentionText').textContent = needAttention > 0 ? 'Cần xử lý' : 'Tốt';
    document.getElementById('statNeedAttentionText').style.color = needAttention > 0 ? '#D97706' : '#16A34A';
    document.getElementById('statAvgTime').textContent = avgTimeDisplay;

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
                select.innerHTML = '<option value="" disabled>Tất cả nhiệm vụ đã được phân công</option>';
                document.getElementById('sceneHelper').textContent = 'Tất cả nhiệm vụ đã được phân công!';
            } else {
                select.innerHTML = '<option value="">-- Chọn nhiệm vụ --</option>';
                availableScenes.forEach(s => {
                    const name = s.name || s.scene_token || `Nhiệm vụ #${s.id}`;
                    const desc = s.description ? ` — ${s.description}` : '';
                    const frames = s.frame_count ? ` (${s.frame_count} khung hình)` : '';
                    select.innerHTML += `<option value="${s.id}">${name}${desc}${frames}</option>`;
                });
                document.getElementById('sceneHelper').textContent = `${availableScenes.length} nhiệm vụ chưa phân công`;
            }
        } else {
            document.getElementById('sceneHelper').textContent = 'Không thể tải danh sách nhiệm vụ';
        }
    } catch (e) {
        document.getElementById('sceneHelper').textContent = 'Lỗi tải nhiệm vụ';
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
    showConfirm('Xóa nhiệm vụ này? Toàn bộ file nhãn sẽ bị xóa theo.', async () => {
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
        const res = await fetch(`${BASE_URL}/projects/${projectId}/scenes?t=${Date.now()}`, {
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
            const name = scene.name || scene.scene_token || `Nhiệm vụ #${scene.id}`;
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
                <td><span style="font-size:12px;color:#64748B">${scene.frame_count || 0} khung hình</span></td>
                <td>
                    <button onclick='openSceneEditModal({scene_id:${scene.id},scene_name:"${(name).replace(/"/g, '\\"')}",scene_description:"${(scene.description || '').replace(/"/g, '\\"')}",_previewSceneId:${scene.id}})'
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
        const res = await fetch(`${BASE_URL}/projects/${projectId}/scenes?t=${Date.now()}`, {
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
            <div style="height:140px;background:#0F172A;position:relative;cursor:pointer" onclick="openSceneEditModal({scene_id:${scene.id},scene_name:'${(scene.name || '').replace(/'/g, "\\'")}',scene_description:'${(scene.description || '').replace(/'/g, "\\'")}',_previewSceneId:${scene.id}})">
                <img id="sceneThumb_${scene.id}" src="" alt="${scene.name}"
                    style="width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity 0.3s">
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#475569;font-size:12px" id="sceneThumbLoading_${scene.id}">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                </div>
            </div>
            <div style="padding:14px">
                <div style="font-size:14px;font-weight:700;color:#1E293B;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scene.name || 'Chưa đặt tên'}</div>
                <div style="font-size:12px;color:#64748B;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scene.description || '—'}</div>
                <button onclick="openSceneEditModal({scene_id:${scene.id},scene_name:'${(scene.name || '').replace(/'/g, "\\'")}',scene_description:'${(scene.description || '').replace(/'/g, "\\'")}',_previewSceneId:${scene.id}})"
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

        const imgRes = await fetch(`${BASE_URL}/frames/${frames[0].id}/thumb/CAM_FRONT`, {
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
let _previewFrames = [];
let _previewFrameIdx = 0;

async function openSceneEditModal(task) {
    const sceneId = task.scene_id || task._previewSceneId;
    document.getElementById('sceneEditId').value = sceneId;
    document.getElementById('sceneEditName').value = task.scene_name || '';
    document.getElementById('sceneEditDesc').value = task.scene_description || '';

    // Reset preview state
    _previewFrames = [];
    _previewFrameIdx = 0;
    document.getElementById('scenePreviewImg').src = '';
    document.getElementById('previewFrameCounter').textContent = '... / ...';

    document.getElementById('sceneEditModal').classList.add('active');

    // Load all frames
    try {
        const framesRes = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (framesRes.ok) {
            _previewFrames = await framesRes.json();
            if (_previewFrames.length > 0) {
                await _loadPreviewFrame(0);
            }
        }
    } catch (e) { /* silent */ }
}

async function _loadPreviewFrame(idx) {
    if (!_previewFrames.length) return;
    idx = Math.max(0, Math.min(_previewFrames.length - 1, idx));
    _previewFrameIdx = idx;

    const loading = document.getElementById('previewLoading');
    const counter = document.getElementById('previewFrameCounter');
    const img = document.getElementById('scenePreviewImg');

    loading.style.display = 'flex';
    counter.textContent = `${idx + 1} / ${_previewFrames.length}`;

    try {
        const res = await fetch(`${BASE_URL}/frames/${_previewFrames[idx].id}/thumb/CAM_FRONT`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (res.ok) {
            const blob = await res.blob();
            img.src = URL.createObjectURL(blob);
        }
    } catch (e) { /* silent */ }
    finally {
        loading.style.display = 'none';
    }
}

async function previewNavFrame(dir) {
    await _loadPreviewFrame(_previewFrameIdx + dir);
}

function closeSceneEditModal() {
    document.getElementById('sceneEditModal').classList.remove('active');
}

document.getElementById('sceneEditModal').addEventListener('click', function (e) {
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
            loadAllTasks(); // Tải lại bảng dữ liệu trong tab Tất cả các nhiệm vụ
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
    const statusLabel = {
        approved: 'Đã phê duyệt',
        reviewed: 'Đã kiểm tra',
        rejected: 'Có lỗi',
        under_review: 'Đang kiểm tra',
        submitted: 'Chờ kiểm tra',
        in_progress: 'Đang làm',
        pending: 'Chờ xử lý'
    }[s] || s;
    const reviewerApproved = s === 'reviewed';

    const existing = document.getElementById('adminTaskDetailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminTaskDetailModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';

    modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:560px;box-shadow:0 8px 40px rgba(0,0,0,0.18);font-family:Inter,sans-serif;display:flex;flex-direction:column;max-height:90vh">

        <!-- Header -->
        <div style="padding:20px 24px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <div>
                <div style="font-size:16px;font-weight:800;color:#1E293B">Chi tiết nhiệm vụ</div>
                <div style="font-size:13px;color:#64748B;margin-top:2px">${task.scene_name || 'Nhiệm vụ #' + taskId}</div>
            </div>
            <button onclick="document.getElementById('adminTaskDetailModal').remove()" style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:20px;padding:4px"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Body scrollable -->
        <div style="overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px">

            <!-- Thông tin cơ bản -->
            <div style="display:flex;flex-direction:column;gap:8px">
                <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Thông tin nhiệm vụ</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <div style="padding:10px 14px;background:#F8FAFC;border-radius:8px">
                        <div style="font-size:11px;color:#94A3B8;margin-bottom:3px"><i class="fa-solid fa-user" style="margin-right:4px"></i>Người gán nhãn</div>
                        <div style="font-size:13px;font-weight:700;color:#1E293B">${labeler?.full_name || labeler?.username || '—'}</div>
                        ${labeler?.full_name ? `<div style="font-size:11px;color:#94A3B8">@${labeler.username}</div>` : ''}
                    </div>
                    <div style="padding:10px 14px;background:#F8FAFC;border-radius:8px">
                        <div style="font-size:11px;color:#94A3B8;margin-bottom:3px"><i class="fa-solid fa-magnifying-glass" style="margin-right:4px"></i>Người kiểm thử</div>
                        <div style="font-size:13px;font-weight:700;color:#1E293B">${reviewer?.full_name || reviewer?.username || '—'}</div>
                        ${reviewer?.full_name ? `<div style="font-size:11px;color:#94A3B8">@${reviewer.username}</div>` : ''}
                    </div>
                </div>
                <div style="padding:10px 14px;background:#F8FAFC;border-radius:8px">
                    <div style="font-size:11px;color:#94A3B8;margin-bottom:3px"><i class="fa-solid fa-circle-dot" style="margin-right:4px"></i>Trạng thái</div>
                    <div style="font-size:13px;font-weight:700;color:${statusColor}">${statusLabel}</div>
                </div>
                ${task.feedback ? `
                <div style="padding:10px 14px;background:#FEF2F2;border-radius:8px;border-left:3px solid #EF4444">
                    <div style="font-size:11px;font-weight:700;color:#991B1B;margin-bottom:4px"><i class="fa-solid fa-comment-dots" style="margin-right:4px"></i>Phản hồi từ chối gần nhất</div>
                    <div style="font-size:12px;color:#7F1D1D;white-space:pre-line">${task.feedback}</div>
                </div>` : ''}
            </div>

            <!-- Tỉ lệ tương đồng với AI -->
            <div id="aiSimilaritySection" style="padding:12px 14px;background:#F5F3FF;border-radius:8px;border-left:4px solid #8B5CF6;display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:10px">
                    <div id="aiSimilarityIcon" style="width:36px;height:36px;border-radius:50%;background:#EDE9FE;color:#8B5CF6;display:flex;align-items:center;justify-content:center;font-size:16px">
                        <i class="fa-solid fa-robot"></i>
                    </div>
                    <div>
                        <div id="aiSimilarityTitle" style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.5px">Tỉ lệ tương đồng với AI</div>
                        <div id="aiSimilaritySubtitle" style="font-size:12px;color:#6D28D9">So sánh giữa nhãn người dùng sửa cuối cùng và nhãn gốc của AI</div>
                    </div>
                </div>
                <div id="aiSimilarityValue" style="font-size:16px;font-weight:800;color:#7C3AED">
                    <i class="fa-solid fa-spinner fa-spin"></i> Đang tính...
                </div>
            </div>

            <!-- Lịch sử nộp bài -->
            <div>
                <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Lịch sử nộp bài</div>
                <div id="taskHistoryList" style="display:flex;flex-direction:column;gap:6px">
                    <div style="text-align:center;padding:16px;color:#94A3B8;font-size:13px">
                        <i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch sử...
                    </div>
                </div>
            </div>


        </div>

        <!-- Footer -->
        <div style="padding:16px 24px;border-top:1px solid #F1F5F9;display:flex;gap:10px;flex-shrink:0">
            ${s === 'reviewed'
            ? `
               <a href="Evaluation.html?taskId=${taskId}" style="flex:1;height:42px;background:#EEF2FF;color:#4F46E5;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:Inter,sans-serif;text-decoration:none">
                   <i class="fa-solid fa-eye"></i> Đánh giá chất lượng
               </a>
               <button onclick="document.getElementById('adminTaskDetailModal').remove()" style="height:42px;padding:0 16px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Đóng</button>
              `
            : (s === 'approved' || s === 'rejected')
            ? `
               <a href="Evaluation.html?taskId=${taskId}" style="flex:1;height:42px;background:#EEF2FF;color:#4F46E5;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:Inter,sans-serif;text-decoration:none">
                   <i class="fa-solid fa-eye"></i> Xem chất lượng gán nhãn
               </a>
               <button onclick="document.getElementById('adminTaskDetailModal').remove()" style="height:42px;padding:0 16px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Đóng</button>
              `
            : `
               <a href="../User/Label_Review.html?taskId=${taskId}" target="_blank"
                  style="height:42px;padding:0 16px;background:#EEF2FF;color:#4F46E5;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;white-space:nowrap">
                   <i class="fa-solid fa-eye"></i> Xem nhãn hiện tại
               </a>
               <span style="flex:1;height:42px;background:#F1F5F9;color:#94A3B8;border-radius:8px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">
                   <i class="fa-solid fa-clock"></i> Chờ kiểm thử xong
               </span>
               <button onclick="document.getElementById('adminTaskDetailModal').remove()" style="height:42px;padding:0 16px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Đóng</button>
              `
            }
        </div>
    </div>`;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    // Tải thông tin
    loadTaskHistory(taskId);
    loadAiSimilarity(taskId);
}

async function loadTaskHistory(taskId) {
    const container = document.getElementById('taskHistoryList');
    if (!container) return;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/history`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) throw new Error();
        const history = await res.json();

        if (!history.length) {
            container.innerHTML = `<div style="text-align:center;padding:16px;color:#94A3B8;font-size:13px;background:#F8FAFC;border-radius:8px">
                Chưa có lịch sử nộp bài nào được ghi lại.
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
            const time = h.created_at ? new Date(h.created_at).toLocaleString('vi-VN') : '—';

            return `
            <div style="display:flex;gap:10px;align-items:flex-start">
                <!-- Timeline dot -->
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding-top:2px">
                    <div style="width:28px;height:28px;border-radius:50%;background:${cfg.bg};color:${cfg.color};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">
                        <i class="fa-solid ${cfg.icon}"></i>
                    </div>
                    ${idx < history.length - 1 ? `<div style="width:2px;flex:1;min-height:12px;background:#E2E8F0;margin-top:4px"></div>` : ''}
                </div>
                <!-- Content -->
                <div style="flex:1;padding-bottom:${idx < history.length - 1 ? '8px' : '0'}">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                        <span style="font-size:13px;font-weight:700;color:${cfg.color}">${cfg.label}</span>
                        <span style="font-size:11px;color:#94A3B8">${time}</span>
                    </div>
                    <div style="font-size:12px;color:#64748B;margin-top:2px">${actor}</div>
                    ${h.feedback ? `<div style="margin-top:6px;padding:8px 10px;background:#FEF2F2;border-radius:6px;font-size:12px;color:#7F1D1D;white-space:pre-line;border-left:2px solid #EF4444">${h.feedback}</div>` : ''}
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:16px;color:#EF4444;font-size:13px">Không thể tải lịch sử</div>`;
    }
}

async function loadAdminTaskChats(taskId) {
    const container = document.getElementById('adminTaskChatList');
    if (!container) return;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/chats`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) throw new Error();
        const chats = await res.json();
        const task = allTasks.find(t => t.id === taskId);

        if (!chats.length) {
            container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">
                Chưa có trao đổi nào giữa labeler và reviewer.
            </div>`;
            return;
        }

        container.innerHTML = chats.map(c => {
            const date = new Date(c.created_at);
            const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + 
                            date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            
            let roleName = 'Labeler';
            let roleStyle = 'background:#E0F2FE;color:#0369A1';
            if (c.sender_role === 'admin') {
                roleName = 'Admin';
                roleStyle = 'background:#FEE2E2;color:#DC2626';
            } else if (task && c.sender_id === task.reviewer_id) {
                roleName = 'Reviewer';
                roleStyle = 'background:#F5F3FF;color:#7C3AED';
            }
            
            const senderName = c.sender_full_name || c.sender_username;
            
            return `
            <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:8px;border-bottom:1px dashed #E2E8F0;padding-bottom:6px">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                    <div style="font-weight:700;font-size:12px;color:#334155;display:flex;align-items:center;gap:6px">
                        <span>${senderName}</span>
                        <span style="font-size:9px;font-weight:700;text-transform:uppercase;padding:1px 4px;border-radius:4px;${roleStyle}">${roleName}</span>
                    </div>
                    <div style="font-size:10px;color:#94A3B8;margin-left:auto">${timeStr}</div>
                </div>
                <div style="font-size:13px;color:#475569;margin-top:2px;word-break:break-word">${c.message}</div>
            </div>`;
        }).join('');

        container.scrollTop = container.scrollHeight;

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#EF4444;font-size:13px">Không thể tải nội dung trao đổi</div>`;
    }
}

async function sendAdminChatMessage(event, taskId) {
    event.preventDefault();
    const input = document.getElementById(`adminChatInput_${taskId}`);
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    input.disabled = true;

    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/chats`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: msg })
        });

        if (res.ok) {
            loadAdminTaskChats(taskId);
        } else {
            showToast('Không thể gửi tin nhắn', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối', 'error');
    } finally {
        input.disabled = false;
        input.focus();
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

function showConfirmModal(options) {
    const { title, message, confirmText, confirmColor, icon, onConfirm } = options;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);animation:fadeIn 0.2s ease';
    
    const iconColor = confirmColor === 'danger' ? '#EF4444' : '#10B981';
    const iconBg = confirmColor === 'danger' ? '#FEE2E2' : '#D1FAE5';
    const btnBg = confirmColor === 'danger' ? '#EF4444' : '#10B981';

    overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:380px;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:24px;font-family:Inter,sans-serif;transform:scale(0.95);animation:scaleIn 0.2s forwards ease-out">
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
            <div style="width:54px;height:54px;border-radius:50%;background:${iconBg};color:${iconColor};display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">
                <i class="fa-solid ${icon}"></i>
            </div>
            <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1E293B">${title}</h3>
            <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.5">${message}</p>
        </div>
        <div style="display:flex;gap:12px">
            <button class="cancel-btn" style="flex:1;height:44px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s">Hủy bỏ</button>
            <button class="confirm-btn" style="flex:1;height:44px;background:${btnBg};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity 0.2s">${confirmText}</button>
        </div>
    </div>
    <style>
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { transform: scale(0.95) } to { transform: scale(1) } }
        .cancel-btn:hover { background: #E2E8F0 !important }
        .confirm-btn:hover { opacity: 0.9 !important }
    </style>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.cancel-btn').onclick = () => overlay.remove();
    overlay.querySelector('.confirm-btn').onclick = () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    };
}

function adminApproveTask(taskId) {
    showConfirmModal({
        title: 'Đạt yêu cầu',
        message: 'Bạn có chắc chắn muốn phê duyệt nhiệm vụ này là Đạt yêu cầu?',
        confirmText: 'Xác nhận Đạt',
        confirmColor: 'success',
        icon: 'fa-circle-check',
        onConfirm: async () => {
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
                    } catch (e) { }
                    loadTasks();
                } else {
                    const err = await res.json();
                    showToast(err.detail || 'Lỗi phê duyệt', 'error');
                }
            } catch (e) {
                showToast('Lỗi kết nối', 'error');
            }
        }
    });
}

function adminRejectTask(taskId) {
    showConfirmModal({
        title: 'Chưa đạt yêu cầu',
        message: 'Bạn có chắc chắn muốn đánh giá nhiệm vụ này là Chưa đạt yêu cầu?',
        confirmText: 'Xác nhận',
        confirmColor: 'danger',
        icon: 'fa-triangle-exclamation',
        onConfirm: async () => {
            try {
                const res = await fetch(`${BASE_URL}/tasks/${taskId}/admin/override`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'rejected', feedback: '' })
                });
                if (res.ok) {
                    showToast('Đã đánh giá: Chưa đạt', 'success');
                    document.getElementById('adminTaskDetailModal')?.remove();
                    loadTasks();
                } else {
                    const err = await res.json();
                    showToast(err.detail || 'Lỗi từ chối', 'error');
                }
            } catch (e) {
                showToast('Lỗi kết nối', 'error');
            }
        }
    });
}

async function loadAiSimilarity(taskId) {
    const valueEl = document.getElementById('aiSimilarityValue');
    const sectionEl = document.getElementById('aiSimilaritySection');
    const iconEl = document.getElementById('aiSimilarityIcon');
    const titleEl = document.getElementById('aiSimilarityTitle');
    const subtitleEl = document.getElementById('aiSimilaritySubtitle');
    if (!valueEl) return;
    try {
        const res = await fetch(`${BASE_URL}/tasks/${taskId}/similarity-stats`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.similarity_percent !== null && data.similarity_percent !== undefined) {
                const percent = data.similarity_percent;
                valueEl.textContent = `${percent}%`;
                
                let theme = {};
                let noteText = '';
                
                if (percent <= 50) {
                    theme = { bg: '#FEF2F2', border: '#EF4444', iconBg: '#FEE2E2', iconColor: '#EF4444', text: '#DC2626', subText: '#B91C1C' };
                    noteText = 'Tỉ lệ tương đồng thấp, chưa đạt yêu cầu.';
                } else if (percent <= 65) {
                    theme = { bg: '#FFFBEB', border: '#F59E0B', iconBg: '#FEF3C7', iconColor: '#F59E0B', text: '#D97706', subText: '#B45309' };
                    noteText = 'Tỉ lệ tương đồng khá thấp, có thể cân nhắc kiểm tra.';
                } else if (percent <= 75) {
                    theme = { bg: '#EFF6FF', border: '#3B82F6', iconBg: '#DBEAFE', iconColor: '#3B82F6', text: '#2563EB', subText: '#1D4ED8' };
                    noteText = 'Tỉ lệ tương đồng ở mức trung bình, có thể chấp nhận đạt yêu cầu.';
                } else if (percent <= 92) {
                    theme = { bg: '#F0FDF4', border: '#10B981', iconBg: '#DCFCE7', iconColor: '#10B981', text: '#059669', subText: '#047857' };
                    noteText = 'Tỉ lệ tương đồng cao, đạt yêu cầu.';
                } else if (percent <= 98) {
                    theme = { bg: '#FFFBEB', border: '#F59E0B', iconBg: '#FEF3C7', iconColor: '#F59E0B', text: '#D97706', subText: '#B45309' };
                    noteText = 'Tỉ lệ tương đồng khá cao, có thể cân nhắc kiểm tra.';
                } else {
                    theme = { bg: '#FEF2F2', border: '#EF4444', iconBg: '#FEE2E2', iconColor: '#EF4444', text: '#DC2626', subText: '#B91C1C' };
                    noteText = 'tỉ lệ tương đồng rất cao, có thể người gán nhãn chỉ dùng AI không kiểm tra lại.';
                }
                
                if (sectionEl) {
                    sectionEl.style.background = theme.bg;
                    sectionEl.style.borderLeft = `4px solid ${theme.border}`;
                }
                if (iconEl) {
                    iconEl.style.background = theme.iconBg;
                    iconEl.style.color = theme.iconColor;
                }
                if (titleEl) titleEl.style.color = theme.text;
                if (subtitleEl) {
                    subtitleEl.textContent = noteText;
                    subtitleEl.style.color = theme.subText;
                    subtitleEl.style.fontWeight = '600';
                }
                if (valueEl) valueEl.style.color = theme.text;
            } else {
                valueEl.textContent = 'Không có dữ liệu AI';
            }
        } else {
            valueEl.textContent = 'Lỗi tải dữ liệu';
        }
    } catch (e) {
        valueEl.textContent = 'Lỗi kết nối';
    }
}

// ============= INIT =============
loadSidebarProject();
loadTasks();
loadMembers();

