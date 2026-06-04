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


async function loadSidebarProject() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const project = await res.json();

        if (project.cover_image) {
            const logo = document.getElementById('sideProjectLogo');
            const text = document.getElementById('sideProjectText');
            if (logo) {
                logo.src = project.cover_image;
                logo.style.display = 'block';
            }
            if (text) text.style.display = 'none';
        }

        const nameEl = document.getElementById('sideProjectName');
        if (nameEl) nameEl.textContent = project.name || projectName;
    } catch (e) {
        console.error('Failed to load project info:', e);
    }
}

// ============= LOAD USERS =============
let allUsers = [];

async function loadUsers() {
    const tbody = document.querySelector('tbody');
    tbody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:40px;">
            <div style="color:#94A3B8">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:12px;display:block"></i>
                Đang tải danh sách người dùng...
            </div>
        </td></tr>`;

    try {
        const res = await fetch(`${BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) {
            showDemoUsers();
            return;
        }

        allUsers = await res.json();
        renderUsers(allUsers);
    } catch (e) {
        console.warn('Users API not available, showing demo data:', e);
        showDemoUsers();
    }
}

function showDemoUsers() {
    allUsers = [
        { id: 1, username: 'labeler01', full_name: 'Nguyễn Văn A', email: 'annotator.a@nulabel.com', role: 'user', created_at: '2026-04-15T00:00:00', is_active: true },
        { id: 2, username: 'labeler02', full_name: 'Trần Thị B', email: 'annotator.b@nulabel.com', role: 'user', created_at: '2026-04-15T00:00:00', is_active: true },
        { id: 3, username: 'labeler03', full_name: 'Lê Minh C', email: 'annotator.c@nulabel.com', role: 'user', created_at: '2026-04-15T00:00:00', is_active: true },
    ];
    renderUsers(allUsers);
}

function renderUsers(users) {
    const tbody = document.querySelector('tbody');
    const showingText = document.querySelector('.showing-text');

    if (!users.length) {
        tbody.innerHTML = `
            <tr><td colspan="7" style="text-align:center;padding:60px;color:#94A3B8">
                <i class="fa-regular fa-user" style="font-size:40px;display:block;margin-bottom:12px;color:#CBD5E1"></i>
                <div style="font-weight:700;color:#475569;margin-bottom:6px">Chưa có người dùng nào</div>
                <div style="font-size:13px">Nhấn "Thêm cộng tác viên" để tạo tài khoản mới.</div>
            </td></tr>`;
        if (showingText) showingText.textContent = 'Không có dữ liệu';
        return;
    }

    tbody.innerHTML = users.map((user, idx) => {
        const name = user.username || 'N/A';
        const initials = name.substring(0, 2).toUpperCase();
        const email = user.email || '—';
        const role = user.role === 'admin' ? 'ADMIN' : 'USER';
        const roleBg = user.role === 'admin' ? '#FEE2E2' : '#DBEAFE';
        const roleColor = user.role === 'admin' ? '#DC2626' : '#2563EB';
        const createdAt = user.created_at
            ? new Date(user.created_at).toLocaleDateString('vi-VN')
            : '—';
        const avatarHtml = user.avatar_url
            ? `<img src="${user.avatar_url}" alt="${name}" class="user-avatar" style="object-fit:cover;border-radius:50%;width:36px;height:36px;flex-shrink:0;">`
            : `<div class="user-avatar">${initials}</div>`;

        // Stats placeholder — sẽ được load async
        const statsId = `stats_${user.id}`;

        return `
            <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td>
                    <div class="user-info">
                        ${avatarHtml}
                        <div>
                            <div class="user-name">${name}</div>
                            ${user.full_name ? `<div style="font-size:12px;color:#94A3B8;margin-top:2px">${user.full_name}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td title="${email}">${email}</td>
                <td>
                    <span class="badge-role" style="background:${roleBg};color:${roleColor}">${role}</span>
                </td>
                <td style="text-align:center;" id="${statsId}">
                    <span style="color:#94A3B8;font-size:12px">—</span>
                </td>
                <td>${createdAt}</td>
                <td style="text-align:center;">
                    ${user.role !== 'admin' ? `
                    <button class="btn-action btn-view" title="Xem thống kê" onclick="openStatsModal(${user.id}, '${name}', '${user.full_name || name}')">
                        <i class="fa-solid fa-chart-bar"></i>
                    </button>` : ''}
                    <button class="btn-action btn-view" title="Xem thông tin" onclick="viewUser(${user.id})">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    ${user.role !== 'admin' ? `
                    <button class="btn-action btn-delete" title="Xóa tài khoản" onclick="deleteUser(${user.id}, '${name}')">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>` : ''}
                </td>
            </tr>`;
    }).join('');

    if (showingText) {
        showingText.textContent = `Hiển thị ${users.length} trên tổng số ${users.length} người dùng`;
    }

    // Load stats cho từng user role=user
    users.filter(u => u.role !== 'admin').forEach(u => loadUserStatsInline(u.id));
}

async function loadUserStatsInline(userId) {
    try {
        const res = await fetch(`${BASE_URL}/users/${userId}/stats?project_id=${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const s = await res.json();

        const taskEl = document.getElementById(`task_${userId}`);
        if (taskEl) {
            taskEl.innerHTML = `<span style="font-weight:600;color:#1E293B">${s.total_tasks}</span>`;
        }

        const statsEl = document.getElementById(`stats_${userId}`);
        if (!statsEl) return;

        if (s.total_tasks === 0 || s.quality_rate === null || s.quality_rate === undefined) {
            statsEl.innerHTML = `<span style="color:#94A3B8;font-size:12px">Chưa đánh giá</span>`;
            return;
        }

        const rate = s.quality_rate;
        const color = rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444';
        const label = rate >= 80 ? 'Tốt' : rate >= 50 ? 'Trung bình' : 'Cần cải thiện';

        statsEl.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
                <div style="font-size:13px;font-weight:700;color:${color}">${rate}%</div>
                <div style="font-size:10px;color:${color};font-weight:600">${label}</div>
            </div>`;
    } catch (e) { /* silent */ }
}

// ============= SEARCH =============
const searchInput = document.querySelector('.search-box input');
if (searchInput) {
    searchInput.addEventListener('input', function () {
        const q = this.value.toLowerCase();
        const filtered = allUsers.filter(u => {
            const name = (u.full_name || '').toLowerCase();
            const username = (u.username || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(q) || username.includes(q) || email.includes(q);
        });
        renderUsers(filtered);
    });
}

// ============= STATS MODAL =============
async function openStatsModal(userId, username, fullName) {
    document.getElementById('statsUserName').textContent = fullName || username;
    document.getElementById('statsUserSub').textContent = `@${username}`;

    const user = allUsers.find(u => u.id === userId);
    const avatarEl = document.getElementById('statsUserAvatar');
    if (avatarEl) {
        if (user && user.avatar_url) {
            avatarEl.innerHTML = `<img src="${user.avatar_url}" alt="${username}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
        } else {
            avatarEl.innerHTML = '';
            avatarEl.textContent = username.substring(0, 2).toUpperCase();
        }
    }

    document.getElementById('statsBody').innerHTML = '<div style="text-align:center;padding:24px;color:#94A3B8"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';
    document.getElementById('statsModal').classList.add('active');

    try {
        const res = await fetch(`${BASE_URL}/users/${userId}/stats?project_id=${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        const s = await res.json();

        // ── Tính màu & nhãn theo % độ tin cậy ──
        const rate = s.quality_rate;
        const hasRate = rate !== null && rate !== undefined;
        
        const rateColor = !hasRate ? '#64748B' : (rate >= 85 ? '#10B981' : rate >= 70 ? '#3B82F6' : '#EF4444');
        const rateLabel = !hasRate ? 'Chưa đánh giá' : (rate >= 85 ? 'Xuất sắc' : rate >= 70 ? 'Khá tốt' : 'Cần cải thiện');
        const rateText = !hasRate ? '—' : `${rate}%`;
        const progressWidth = !hasRate ? 0 : rate;

        // Thời gian trung bình: làm tròn tới phút
        const avgMinutes = s.avg_time_seconds > 0
            ? `${Math.round(s.avg_time_seconds / 60)} phút` : '—';

        // Nhận xét thuê/không thuê
        const hireText = !hasRate ? 'Chưa có đánh giá' : (rate >= 85 ? 'Nên thuê lại' : rate >= 70 ? 'Có thể cân nhắc' : 'Không nên thuê lại');
        const hireIcon = !hasRate ? 'fa-circle-question' : (rate >= 85 ? 'fa-thumbs-up' : rate >= 70 ? 'fa-circle-exclamation' : 'fa-thumbs-down');
        const hireBg = !hasRate ? '#F8FAFC' : (rate >= 85 ? '#F0FDF4' : rate >= 70 ? '#EFF6FF' : '#FEF2F2');
        const hireBorder = !hasRate ? '#E2E8F0' : (rate >= 85 ? '#BBF7D0' : rate >= 70 ? '#BFDBFE' : '#FECACA');
        const hireDesc = !hasRate ? 'Chưa thực hiện nhiệm vụ nào được đánh giá.' : `độ tin cậy gán nhãn trung bình đạt <strong style="color:${rateColor}">${rate}%</strong>`;

        document.getElementById('statsBody').innerHTML = `
        <div id="stPanelLabel" style="display:flex;flex-direction:column;gap:16px;">
            <!-- 2 số tổng quan -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 10px;text-align:center;box-shadow:inset 0 1px 2px rgba(0,0,0,0.01)">
                    <div style="font-size:26px;font-weight:800;color:#0F172A;line-height:1.2">${s.total_tasks}</div>
                    <div style="font-size:11px;font-weight:700;color:#64748B;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Tổng nhiệm vụ</div>
                </div>
                <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 10px;text-align:center;box-shadow:inset 0 1px 2px rgba(0,0,0,0.01)">
                    <div style="font-size:26px;font-weight:800;color:${rateColor};line-height:1.2">${rateText}</div>
                    <div style="font-size:11px;color:${rateColor};font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">${rateLabel}</div>
                </div>
            </div>

            <!-- Thanh tiến trình chất lượng -->
            <div style="padding:0 2px">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#475569;margin-bottom:6px">
                    <span style="font-weight:600">Độ tin cậy trung bình (nhiệm vụ đã duyệt)</span>
                    <span style="font-weight:800;color:${rateColor};font-size:13px">${rateText}</span>
                </div>
                <div style="width:100%;height:8px;background:#F1F5F9;border-radius:10px;overflow:hidden">
                    <div style="width:${progressWidth}%;height:100%;background:${rateColor};border-radius:10px;transition:width 0.6s cubic-bezier(0.4, 0, 0.2, 1)"></div>
                </div>
            </div>

            <!-- Chi tiết dạng lưới 2 cột -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${miniStat('fa-circle-check', '#10B981', 'Đã được đánh giá', s.admin_approved)}
                ${miniStat('fa-paper-plane', '#2563EB', 'Đã nộp', s.reviewer_approved)}
                ${miniStat('fa-check-double', '#059669', 'Đạt yêu cầu', s.approved)}
                ${miniStat('fa-circle-xmark', '#EF4444', 'Không đạt yêu cầu', s.admin_rejected)}
                ${miniStat('fa-pen', '#7C3AED', 'Đang làm', s.in_progress)}
                ${miniStat('fa-hourglass', '#94A3B8', 'Chưa bắt đầu', s.pending)}
            </div>

            <!-- Thời gian trung bình -->
            <div style="padding:12px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;font-size:12px;color:#475569;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;display:flex;align-items:center;gap:8px">
                    <i class="fa-solid fa-stopwatch" style="color:#0EA5E9;font-size:15px"></i>
                    Thời gian trung bình / Nhiệm vụ
                </span>
                <span style="font-weight:800;color:#0F172A;font-size:13px">${avgMinutes}</span>
            </div>

            <!-- Nhận xét và khuyến nghị -->
            <div style="padding:14px 16px;border-radius:12px;background:${hireBg};border:1px solid ${hireBorder};font-size:12px;color:#475569;display:flex;align-items:center;gap:12px;line-height:1.5;box-shadow:0 1px 3px rgba(0,0,0,0.01)">
                <div style="width:30px;height:30px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;color:${rateColor};box-shadow:0 2px 5px rgba(0,0,0,0.05);flex-shrink:0">
                    <i class="fa-solid ${hireIcon}" style="font-size:13px"></i>
                </div>
                <div style="flex:1">
                    <strong style="color:${rateColor};font-size:13px;display:block;margin-bottom:1px">${hireText}</strong>
                    ${hireDesc}
                </div>
            </div>
        </div>`;
    } catch (e) {
        document.getElementById('statsBody').innerHTML = '<div style="text-align:center;padding:24px;color:#EF4444">Không thể tải thống kê</div>';
    }
}

function miniStat(icon, color, label, value) {
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:${color}12;color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fa-solid ${icon}" style="font-size:13px"></i>
        </div>
        <div style="flex:1;min-width:0">
            <div style="font-size:10px;font-weight:600;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:0.3px">${label}</div>
            <div style="font-size:15px;font-weight:800;color:#0F172A;margin-top:1px;line-height:1.2">${value}</div>
        </div>
    </div>`;
}

function closeStatsModal() {
    document.getElementById('statsModal').classList.remove('active');
}

document.getElementById('statsModal').addEventListener('click', function (e) {
    if (e.target === this) closeStatsModal();
});

// ============= VIEW USER → Profile page =============
function viewUser(userId) {
    // Admin xem user → Profile.html với readonly=true
    window.location.href = '../User/Profile.html?userId=' + userId + '&readonly=true';
}

// ============= DELETE USER =============
async function deleteUser(userId, name) {
    showConfirm(`Bạn có chắc muốn xóa tài khoản "${name}"?\nHành động này không thể hoàn tác.`, async () => {
        try {
            const res = await fetch(`${BASE_URL}/users/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                showToast(`Đã xóa tài khoản "${name}"`, 'success');
                loadUsers();
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi khi xóa tài khoản', 'error');
            }
        } catch (e) {
            showToast('Không thể xóa người dùng hiện có trong dự án', 'error');
        }
    }, { title: 'Xóa tài khoản', confirmText: 'Xóa', type: 'danger' });
}

// ============= ADD USER MODAL =============
function openAddModal() {
    document.getElementById('addUserModal').classList.add('active');
    document.getElementById('addUserForm').reset();
}

function closeAddModal() {
    document.getElementById('addUserModal').classList.remove('active');
}

document.getElementById('addUserModal').addEventListener('click', function (e) {
    if (e.target === this) closeAddModal();
});

document.getElementById('addUserForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const username = document.getElementById('newUsername').value.trim();
    const full_name = document.getElementById('newFullName').value.trim();
    const password = document.getElementById('newPassword').value;

    if (!username || !full_name || !password) {
        showToast('Vui lòng điền đầy đủ thông tin', 'error');
        return;
    }

    const btn = document.getElementById('btnSubmitAdd');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';

    try {
        const res = await fetch(`${BASE_URL}/users`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, full_name, password, role: 'user' })
        });

        if (res.ok) {
            showToast(`Đã tạo tài khoản "${full_name}" thành công!`, 'success');
            closeAddModal();
            loadUsers();
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi tạo tài khoản', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối server', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Tạo tài khoản';
    }
});

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
loadUsers();

