// ==========================================
// CẤU HÌNH & XÁC THỰC CƠ BẢN
// ==========================================
const BASE_URL = '/api'; // Đường dẫn gốc kết nối với API backend

// Hàm lấy token xác thực (JWT) từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// KIỂM TRA QUYỀN TRUY CẬP (Auth guard)
// Đọc thông tin người dùng từ localStorage. 
// Nếu không đăng nhập hoặc vai trò không phải 'admin', chuyển hướng về login.html
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'admin') {
    window.location.href = '../login.html';
}

// BỐI CẢNH DỰ ÁN (Project context)
// Lấy ID dự án và tên dự án từ sessionStorage.
// Nếu chưa có dự án được chọn, buộc quay về trang danh sách dự án ManagerProject.html
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
if (!projectId) {
    window.location.href = 'ManagerProject.html';
}

// Thiết lập tên dự án lên thanh menu bên trái (Sidebar)
const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) {
    sideProjectNameEl.textContent = projectName;
}

// ==========================================
// ĐỒNG BỘ GIAO DIỆN & TƯƠNG TÁC SIDEBAR
// ==========================================
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
const toggleBtn = document.getElementById('toggleSidebar');

if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
    });
}

// Hàm tải logo/ảnh bìa dự án hiển thị trên Sidebar
async function loadSidebarProject() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const project = await res.json();

        // Nếu dự án có ảnh bìa (cover_image)
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
        console.error('Lỗi khi tải thông tin dự án trên sidebar:', e);
    }
}

// ==========================================
// TẢI DANH SÁCH NGƯỜI DÙNG & HIỆU SUẤT
// ==========================================
let allUsers = []; // Biến toàn cục lưu danh sách tất cả người dùng

async function loadUsers() {
    const tbody = document.querySelector('tbody');
    tbody.innerHTML = `
        <tr><td colspan="8" style="text-align:center;padding:40px;">
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
            showDemoUsers(); // Nếu API lỗi hoặc chưa có, dùng dữ liệu giả lập (Demo)
            return;
        }

        const rawUsers = await res.json();
        
        // Gọi song song (Parallel pre-fetching) API lấy thống kê hiệu suất cho từng Labeler
        const userPromises = rawUsers.map(async (u) => {
            if (u.role === 'admin') {
                u.total_tasks = 0;
                u.quality_rate = null;
                return u;
            }
            try {
                const statsRes = await fetch(`${BASE_URL}/users/${u.id}/stats?project_id=${projectId}`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                });
                if (statsRes.ok) {
                    const s = await statsRes.json();
                    u.total_tasks = s.total_tasks || 0;
                    u.quality_rate = s.quality_rate;
                } else {
                    u.total_tasks = 0;
                    u.quality_rate = null;
                }
            } catch (e) {
                u.total_tasks = 0;
                u.quality_rate = null;
            }
            return u;
        });

        allUsers = await Promise.all(userPromises);
        applyFilters(); // Áp dụng bộ lọc tìm kiếm
    } catch (e) {
        console.warn('API người dùng không khả dụng, chuyển sang chế độ dữ liệu thử nghiệm:', e);
        showDemoUsers();
    }
}

// Hàm hiển thị dữ liệu thử nghiệm khi không kết nối được backend
function showDemoUsers() {
    allUsers = [
        { id: 1, username: 'labeler01', full_name: 'Nguyễn Văn A', email: 'annotator.a@nulabel.com', role: 'user', created_at: '2026-04-15T00:00:00', is_active: true, gender: 'Nam', total_tasks: 12, quality_rate: 88 },
        { id: 2, username: 'labeler02', full_name: 'Trần Thị B', email: 'annotator.b@nulabel.com', role: 'user', created_at: '2026-04-15T00:00:00', is_active: true, gender: 'Nữ', total_tasks: 5, quality_rate: 64 },
        { id: 3, username: 'labeler03', full_name: 'Lê Minh C', email: 'annotator.c@nulabel.com', role: 'user', created_at: '2026-04-15T00:00:00', is_active: true, gender: 'Nam', total_tasks: 0, quality_rate: null },
    ];
    applyFilters();
}

// Hàm kết xuất (render) danh sách người dùng ra bảng HTML
function renderUsers(users, startIndex = 0, totalItems = 0) {
    const tbody = document.querySelector('tbody');
    const showingText = document.querySelector('.showing-text');

    if (!users.length) {
        tbody.innerHTML = `
            <tr><td colspan="8" style="text-align:center;padding:60px;color:#94A3B8">
                <i class="fa-regular fa-user" style="font-size:40px;display:block;margin-bottom:12px;color:#CBD5E1"></i>
                <div style="font-weight:700;color:#475569;margin-bottom:6px">Chưa có người dùng nào</div>
                <div style="font-size:13px">Không tìm thấy người dùng phù hợp với tiêu chí lọc.</div>
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
        
        // Cấu hình avatar (Ảnh đại diện hoặc chữ viết tắt)
        const avatarHtml = user.avatar_url
            ? `<img src="${user.avatar_url}" alt="${name}" class="user-avatar" style="object-fit:cover;border-radius:50%;width:36px;height:36px;flex-shrink:0;">`
            : `<div class="user-avatar">${initials}</div>`;

        // Định dạng cột số lượng nhiệm vụ
        const tasksHtml = user.role === 'admin' 
            ? `<span style="color:#94A3B8;font-size:12px">—</span>`
            : `<span style="font-weight:600;color:#1E293B">${user.total_tasks}</span>`;

        // Định dạng cột chất lượng/độ tin cậy gán nhãn
        let qualityHtml = `<span style="color:#94A3B8;font-size:12px">—</span>`;
        if (user.role !== 'admin') {
            if (user.total_tasks === 0 || user.quality_rate === null || user.quality_rate === undefined) {
                qualityHtml = `<span style="color:#94A3B8;font-size:12px">Chưa đánh giá</span>`;
            } else {
                const rate = user.quality_rate;
                const color = rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444';
                const label = rate >= 80 ? 'Tốt' : rate >= 50 ? 'Trung bình' : 'Cần cải thiện';
                qualityHtml = `
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
                        <div style="font-size:13px;font-weight:700;color:${color}">${rate}%</div>
                        <div style="font-size:10px;color:${color};font-weight:600">${label}</div>
                    </div>`;
            }
        }

        return `
            <tr>
                <td style="text-align:center;">${startIndex + idx + 1}</td>
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
                <td style="text-align:center;">
                    ${tasksHtml}
                </td>
                <td style="text-align:center;">
                    ${qualityHtml}
                </td>
                <td>${createdAt}</td>
                <td style="text-align:center; white-space:nowrap;">
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
        showingText.textContent = `Hiển thị ${startIndex + 1} - ${startIndex + users.length} trên tổng số ${totalItems} người dùng`;
    }
}

// ==========================================
// LOGIC BỘ LỌC TÌM KIẾM & PHÂN TRANG
// ==========================================
let currentPage = 1;
const itemsPerPage = 5; // Số dòng trên mỗi trang

// Bật/tắt bảng điều khiển bộ lọc nâng cao
function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel');
    const btn = document.getElementById('btnFilterToggle');
    panel.classList.toggle('active');
    btn.classList.toggle('active');
}

// Hàm áp dụng các bộ lọc, sắp xếp và phân trang
function applyFilters(keepPage = false) {
    if (!keepPage) {
        currentPage = 1;
    }

    const searchInputEl = document.querySelector('.search-box input');
    const q = (searchInputEl ? searchInputEl.value : '').toLowerCase();
    const gender = document.getElementById('filterGender').value;
    const role = document.getElementById('filterRole').value;
    const sortQuality = document.getElementById('sortQuality').value;
    const sortCreatedAt = document.getElementById('sortCreatedAt').value;
    const sortTotalTasks = document.getElementById('sortTotalTasks').value;

    let filtered = allUsers.filter(u => {
        // Lọc theo từ khóa tìm kiếm (họ tên, username, email)
        const name = (u.full_name || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const matchesSearch = name.includes(q) || username.includes(q) || email.includes(q);
        if (!matchesSearch) return false;

        // Lọc theo vai trò (admin/user)
        if (role !== 'all' && u.role !== role) return false;

        // Lọc theo giới tính
        if (gender !== 'all') {
            const userGender = (u.gender || '').toLowerCase();
            const targetGender = gender.toLowerCase();
            if (userGender !== targetGender) return false;
        }

        return true;
    });

    // ── Thực hiện sắp xếp (Sorting) ──
    // Sắp xếp theo tỷ lệ chất lượng (độ tin cậy)
    if (sortQuality !== 'none') {
        filtered.sort((a, b) => {
            const aVal = a.role === 'admin' ? -1 : (a.quality_rate !== null && a.quality_rate !== undefined ? a.quality_rate : -1);
            const bVal = b.role === 'admin' ? -1 : (b.quality_rate !== null && b.quality_rate !== undefined ? b.quality_rate : -1);

            if (sortQuality === 'desc') {
                return bVal - aVal;
            } else {
                return aVal - bVal;
            }
        });
    }

    // Sắp xếp theo ngày tạo tài khoản
    if (sortCreatedAt !== 'none') {
        filtered.sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (sortCreatedAt === 'desc') {
                return bTime - aTime;
            } else {
                return aTime - bTime;
            }
        });
    }

    // Sắp xếp theo tổng số lượng nhiệm vụ được giao
    if (sortTotalTasks !== 'none') {
        filtered.sort((a, b) => {
            const aTasks = a.role === 'admin' ? -1 : (a.total_tasks || 0);
            const bTasks = b.role === 'admin' ? -1 : (b.total_tasks || 0);
            if (sortTotalTasks === 'desc') {
                return bTasks - aTasks;
            } else {
                return aTasks - bTasks;
            }
        });
    }

    // Cập nhật thẻ đếm số lượng bộ lọc đang hoạt động
    let activeFiltersCount = 0;
    if (gender !== 'all') activeFiltersCount++;
    if (role !== 'all') activeFiltersCount++;
    if (sortQuality !== 'none') activeFiltersCount++;
    if (sortCreatedAt !== 'none') activeFiltersCount++;
    if (sortTotalTasks !== 'none') activeFiltersCount++;

    const badge = document.getElementById('filterBadge');
    if (badge) {
        if (activeFiltersCount > 0) {
            badge.textContent = activeFiltersCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // Phân trang dữ liệu
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageUsers = filtered.slice(startIndex, startIndex + itemsPerPage);

    renderUsers(pageUsers, startIndex, totalItems);
    renderPaginationControls(totalPages);
}

// Tạo giao diện các nút bấm phân trang (Pagination)
function renderPaginationControls(totalPages) {
    const container = document.getElementById('userPagination');
    if (!container) return;

    let html = '';
    // Nút mũi tên trái
    const prevDisabledClass = currentPage === 1 ? 'disabled' : '';
    html += `<i class="fa-solid fa-angle-left ${prevDisabledClass}" onclick="${currentPage === 1 ? '' : 'changePage(' + (currentPage - 1) + ')'}"></i>`;

    // Sinh các số trang
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<span class="page-num ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</span>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="page-ellipsis">...</span>`;
        }
    }

    // Nút mũi tên phải
    const nextDisabledClass = currentPage === totalPages ? 'disabled' : '';
    html += `<i class="fa-solid fa-angle-right ${nextDisabledClass}" onclick="${currentPage === totalPages ? '' : 'changePage(' + (currentPage + 1) + ')'}"></i>`;

    container.innerHTML = html;
}

// Chuyển sang trang được chọn
function changePage(page) {
    currentPage = page;
    applyFilters(true);
}

// Reset xóa sạch bộ lọc và đưa trang về đầu tiên
function resetFilters() {
    document.getElementById('filterGender').value = 'all';
    document.getElementById('filterRole').value = 'all';
    document.getElementById('sortQuality').value = 'none';
    document.getElementById('sortCreatedAt').value = 'none';
    document.getElementById('sortTotalTasks').value = 'none';
    currentPage = 1;
    applyFilters(true);
}

// Lắng nghe sự kiện gõ ô tìm kiếm tìm nhanh
const searchInput = document.querySelector('.search-box input');
if (searchInput) {
    searchInput.addEventListener('input', function () {
        applyFilters(false);
    });
}

// ==========================================
// MODAL CHI TIẾT HIỆU SUẤT LABELER
// ==========================================
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

        // ── Tính màu sắc & nhận xét chất lượng dựa trên độ tin cậy ──
        const rate = s.quality_rate;
        const hasRate = rate !== null && rate !== undefined;
        
        const rateColor = !hasRate ? '#64748B' : (rate >= 85 ? '#10B981' : rate >= 70 ? '#3B82F6' : '#EF4444');
        const rateLabel = !hasRate ? 'Chưa đánh giá' : (rate >= 85 ? 'Xuất sắc' : rate >= 70 ? 'Khá tốt' : 'Cần cải thiện');
        const rateText = !hasRate ? '—' : `${rate}%`;
        const progressWidth = !hasRate ? 0 : rate;

        // Thời gian làm trung bình trên một nhiệm vụ
        const avgMinutes = s.avg_time_seconds > 0
            ? `${Math.round(s.avg_time_seconds / 60)} phút` : '—';

        // Nhận xét đánh giá khả năng thuê lại nhân sự gán nhãn
        const hireText = !hasRate ? 'Chưa có đánh giá' : (rate >= 85 ? 'Nên thuê lại' : rate >= 70 ? 'Có thể cân nhắc' : 'Không nên thuê lại');
        const hireIcon = !hasRate ? 'fa-circle-question' : (rate >= 85 ? 'fa-thumbs-up' : rate >= 70 ? 'fa-circle-exclamation' : 'fa-thumbs-down');
        const hireBg = !hasRate ? '#F8FAFC' : (rate >= 85 ? '#F0FDF4' : rate >= 70 ? '#EFF6FF' : '#FEF2F2');
        const hireBorder = !hasRate ? '#E2E8F0' : (rate >= 85 ? '#BBF7D0' : rate >= 70 ? '#BFDBFE' : '#FECACA');
        const hireDesc = !hasRate ? 'Chưa thực hiện nhiệm vụ nào được đánh giá.' : `độ tin cậy gán nhãn trung bình đạt <strong style="color:${rateColor}">${rate}%</strong>`;

        document.getElementById('statsBody').innerHTML = `
        <div id="stPanelLabel" style="display:flex;flex-direction:column;gap:16px;">
            <!-- 2 khối số liệu tổng quan nhanh -->
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

            <!-- Thanh tiến trình hiển thị chất lượng nhãn -->
            <div style="padding:0 2px">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#475569;margin-bottom:6px">
                    <span style="font-weight:600">Độ tin cậy trung bình (nhiệm vụ đã duyệt)</span>
                    <span style="font-weight:800;color:${rateColor};font-size:13px">${rateText}</span>
                </div>
                <div style="width:100%;height:8px;background:#F1F5F9;border-radius:10px;overflow:hidden">
                    <div style="width:${progressWidth}%;height:100%;background:${rateColor};border-radius:10px;transition:width 0.6s cubic-bezier(0.4, 0, 0.2, 1)"></div>
                </div>
            </div>

            <!-- Chi tiết trạng thái nhiệm vụ dạng lưới 2 cột -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${miniStat('fa-circle-check', '#10B981', 'Đã được đánh giá', s.admin_approved)}
                ${miniStat('fa-paper-plane', '#2563EB', 'Đã nộp', s.reviewer_approved)}
                ${miniStat('fa-check-double', '#059669', 'Đạt yêu cầu', s.approved)}
                ${miniStat('fa-circle-xmark', '#EF4444', 'Không đạt yêu cầu', s.admin_rejected)}
                ${miniStat('fa-pen', '#7C3AED', 'Đang làm', s.in_progress)}
                ${miniStat('fa-hourglass', '#94A3B8', 'Chưa bắt đầu', s.pending)}
            </div>

            <!-- Thời gian trung bình hoàn thành -->
            <div style="padding:12px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;font-size:12px;color:#475569;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;display:flex;align-items:center;gap:8px">
                    <i class="fa-solid fa-stopwatch" style="color:#0EA5E9;font-size:15px"></i>
                    Thời gian trung bình / Nhiệm vụ
                </span>
                <span style="font-weight:800;color:#0F172A;font-size:13px">${avgMinutes}</span>
            </div>

            <!-- Nhận xét chất lượng & khuyến nghị thuê lại -->
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

// Khối thống kê nhỏ hiển thị số lượng nhiệm vụ theo trạng thái
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

// ==========================================
// XEM CHI TIẾT THÔNG TIN NGƯỜI DÙNG
// ==========================================
function viewUser(userId) {
    // Chuyển hướng tới trang Profile ở chế độ chỉ đọc readonly=true
    window.location.href = '../User/Profile.html?userId=' + userId + '&readonly=true';
}

// ==========================================
// XÓA TÀI KHOẢN NGƯỜI DÙNG (SOFT DELETE)
// ==========================================
async function deleteUser(userId, name) {
    showConfirm(`Bạn có chắc muốn xóa tài khoản "${name}"?\nHành động này không thể hoàn tác.`, async () => {
        try {
            const res = await fetch(`${BASE_URL}/users/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                showToast(`Đã xóa tài khoản "${name}"`, 'success');
                loadUsers(); // Tải lại danh sách
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi khi xóa tài khoản', 'error');
            }
        } catch (e) {
            showToast('Không thể xóa người dùng hiện có trong dự án', 'error');
        }
    }, { title: 'Xóa tài khoản', confirmText: 'Xóa', type: 'danger' });
}

// ==========================================
// THÊM MỚI NGƯỜI DÙNG (POPUP MODAL)
// ==========================================
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

// Xử lý gửi biểu mẫu (submit) tạo người dùng mới
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

// ==========================================
// THÔNG BÁO TOAST
// ==========================================
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}" style="margin-right:8px"></i>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// KHỞI CHẠY TẢI DỮ LIỆU BAN ĐẦU
// ==========================================
loadSidebarProject();
loadUsers();
