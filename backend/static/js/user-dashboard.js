// ==========================================
// CẤU HÌNH & XÁC THỰC CƠ BẢN
// ==========================================
const BASE_URL = '/api'; // Đường dẫn gốc kết nối với API backend

// Hàm lấy token xác thực (JWT) từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// Đọc thông tin người dùng hiện tại từ localStorage
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');

// KIỂM TRA QUYỀN TRUY CẬP (Auth guard)
// Nếu chưa đăng nhập hoặc vai trò không phải 'user', tự động chuyển hướng về trang đăng nhập
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}

// BỐI CẢNH DỰ ÁN (Project context)
// Lấy ID dự án và tên dự án hiện tại từ sessionStorage.
// Nếu không chọn dự án, buộc chuyển hướng về trang danh sách dự án ManagerProject.html
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
if (!projectId) window.location.href = 'ManagerProject.html';

// Cập nhật tên dự án lên thanh menu bên trái (Sidebar)
const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) sideProjectNameEl.textContent = projectName;

// ==========================================
// ĐỒNG BỘ GIAO DIỆN & TƯƠNG TÁC SIDEBAR
// ==========================================
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
const toggleBtn = document.getElementById('toggleSidebar');

// Đăng ký sự kiện thu gọn/mở rộng thanh menu bên trái (Sidebar)
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
    });
}

// ==========================================
// TẢI THÔNG TIN DỰ ÁN TRÊN SIDEBAR
// ==========================================
// Gọi API lấy thông tin chi tiết dự án hiện tại để tải ảnh bìa (cover_image)
async function loadSidebarProject() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const project = await res.json();
        
        // Nếu dự án có ảnh bìa, dùng làm Logo hiển thị trên Sidebar
        if (project.cover_image) {
            const logo = document.getElementById('sideProjectLogo');
            logo.src = project.cover_image;
            logo.style.display = 'block';
            document.getElementById('sideProjectText').style.display = 'none';
        }
        document.getElementById('sideProjectName').textContent = project.name || projectName;
    } catch (e) { /* Bỏ qua lỗi âm thầm nếu không tải được logo */ }
}

// ==========================================
// QUẢN LÝ CHUYỂN TAB GIAO DIỆN
// ==========================================
// Chuyển đổi qua lại giữa Tab "Nhiệm vụ của tôi" và Tab "Nhiệm vụ kiểm tra"
function switchTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// ==========================================
// BỘ ĐỊNH NGHĨA & HÀM HỖ TRỢ TRẠNG THÁI
// ==========================================
// Bản đồ ánh xạ trạng thái sang tên tiếng Việt và lớp CSS hiển thị tương ứng
const STATUS_MAP = {
    pending: { label: 'Chờ xử lý', cls: 'st-pending' },
    in_progress: { label: 'Đang làm', cls: 'st-in_progress' },
    submitted: { label: 'Đợi kiểm tra', cls: 'st-submitted' },
    under_review: { label: 'Đang kiểm tra', cls: 'st-under_review' },
    reviewed: { label: 'Đã kiểm tra', cls: 'st-approved' },
    approved: { label: 'Đạt', cls: 'st-approved' },
    rejected: { label: 'Chưa đạt', cls: 'st-rejected' }
};

// Hàm lấy thẻ HTML hiển thị trạng thái (Badge) của nhiệm vụ
function getStatusBadge(status, adminModerated = false, isDeleted = false) {
    // "Đã hủy" chỉ hiện khi nhiệm vụ bị soft-deleted bởi admin và trạng thái là rejected (Chưa đạt)
    if (isDeleted && status === 'rejected') {
        return `<div class="status-badge" style="background:#F1F5F9;color:#475569;border-color:#E2E8F0"><div class="status-dot" style="background:#64748B"></div>Đã hủy</div>`;
    }
    // Trạng thái bị từ chối/trả về
    if (status === 'rejected') {
        if (adminModerated) {
            // Admin đã duyệt và ra quyết định không đạt
            return `<div class="status-badge st-rejected"><div class="status-dot"></div>Chưa đạt</div>`;
        } else {
            // Reviewer trả về bắt gán nhãn sửa lại lỗi
            return `<div class="status-badge st-rejected" style="background:#FFF7ED;color:#C2410C;border-color:#FED7AA"><div class="status-dot" style="background:#EA580C"></div>Có lỗi</div>`;
        }
    }
    const info = STATUS_MAP[status] || { label: status, cls: 'st-pending' };
    return `<div class="status-badge ${info.cls}"><div class="status-dot"></div>${info.label}</div>`;
}

// Hàm hiển thị thông tin rút gọn của người dùng (avatar bằng chữ cái đầu)
function getUserCell(user) {
    if (!user) return `<span style="color:#94A3B8;font-style:italic">—</span>`;
    const initials = (user.username || '?').substring(0, 2).toUpperCase();
    return `<div class="user-cell">
        <div class="user-cell-initials" style="background:#EEF2FF;color:#4F46E5">${initials}</div>
        <span class="user-cell-name">${user.username}</span>
    </div>`;
}

// ==========================================
// QUẢN LÝ NHIỆM VỤ CỦA TÔI (LABELER)
// ==========================================
let myTasks = []; // Lưu trữ danh sách nhiệm vụ tự vẽ nhãn

// Gọi API lấy danh sách nhiệm vụ được phân công làm Labeler
async function loadMyTasks() {
    const tbody = document.getElementById('myTasksBody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </td></tr>`;
    try {
        const res = await fetch(`${BASE_URL}/tasks?project_id=${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        myTasks = await res.json();
        applyMyTasksFilters(true); // Áp dụng bộ lọc và phân trang
        updateStats(myTasks);      // Cập nhật thống kê hiệu suất
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#EF4444">Không thể tải dữ liệu</td></tr>`;
    }
}

// Hàm render dữ liệu danh sách nhiệm vụ lên bảng HTML
function renderMyTasks(tasks, startIndex = 0) {
    const tbody = document.getElementById('myTasksBody');
    if (!tasks.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
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
        
        // Nếu nhiệm vụ ở trạng thái pending (chưa bắt đầu) thì hiện nhãn "Mới" nhấp nháy màu đỏ
        const nameHtml = task.status === 'pending'
            ? `<div style="display:flex;align-items:center;gap:6px;">${name}<span style="background:#EF4444;color:#FFFFFF;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;display:inline-block;text-transform:uppercase;letter-spacing:0.5px;line-height:1.2;box-shadow:0 2px 4px rgba(239, 68, 68, 0.2);">Mới</span></div>`
            : `<div>${name}</div>`;
 
        return `<tr>
            <td style="text-align:center;font-weight:600;color:#64748B">${startIndex + idx + 1}</td>
            <td><div class="scene-name">
                <div class="scene-icon"><i class="fa-solid fa-film"></i></div>
                <div>${nameHtml}${desc ? `<div class="scene-meta">${desc}</div>` : ''}</div>
            </div></td>
            <td>${getStatusBadge(task.status, task.admin_moderated, task.is_deleted)}</td>
            <td><div class="progress-cell">
                <div class="progress-bar"><div class="progress-fill ${progressColor}" style="width:${progress}%"></div></div>
                <span class="progress-text">${task.frame_count > 0 ? progress + '%' : '—'}</span>
            </div></td>
            <td>${getMyTaskAction(task)}</td>
        </tr>`;
    }).join('');
    document.getElementById('tabBadgeMyTasks').textContent = myTasks.length;
}

// Hàm sinh ra các nút hành động (Gán nhãn, sửa lỗi, xem đánh giá) tương ứng với từng trạng thái nhiệm vụ
function getMyTaskAction(task) {
    // Nếu nhiệm vụ bị hủy
    if (task.is_deleted) {
        const feedbackEscaped = (task.feedback || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
        return `<button onclick="showEvaluationDetailPopup('Đã hủy', '${feedbackEscaped}', ${task.precision !== null ? task.precision : 'null'}, ${task.matched_objs !== null ? task.matched_objs : 'null'}, ${task.missing_objs !== null ? task.missing_objs : 'null'}, ${task.user_objs !== null ? task.user_objs : 'null'})" class="action-link" style="border:none;background:#F1F5F9;color:#475569;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;transition:all 0.2s;" onmouseover="this.style.background='#64748B';this.style.color='#FFFFFF';" onmouseout="this.style.background='#F1F5F9';this.style.color='#475569';" title="Xem nhận xét từ Admin">
                <i class="fa-solid fa-eye"></i> Xem đánh giá
            </button>`;
    }
    const s = task.status;
    // Nếu nhiệm vụ đạt yêu cầu (được Admin duyệt)
    if (s === 'approved') {
        const feedbackEscaped = (task.feedback || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
        return `<button onclick="showEvaluationDetailPopup('Đạt yêu cầu', '${feedbackEscaped}', ${task.precision !== null ? task.precision : 'null'}, ${task.matched_objs !== null ? task.matched_objs : 'null'}, ${task.missing_objs !== null ? task.missing_objs : 'null'}, ${task.user_objs !== null ? task.user_objs : 'null'})" class="action-link" style="border:none;background:#ECFDF5;color:#059669;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;transition:all 0.2s;" onmouseover="this.style.background='#059669';this.style.color='#FFFFFF';" onmouseout="this.style.background='#ECFDF5';this.style.color='#059669';" title="Xem nhận xét từ Admin">
                <i class="fa-solid fa-eye"></i> Xem đánh giá
            </button>`;
    }
    // Nếu nhiệm vụ không đạt yêu cầu
    if (s === 'rejected') {
        if (task.admin_moderated) {
            // Bị Admin chấm rớt: Vẫn cho xem bảng đánh giá chi tiết
            const feedbackEscaped = (task.feedback || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
            return `<button onclick="showEvaluationDetailPopup('Chưa đạt yêu cầu', '${feedbackEscaped}', ${task.precision !== null ? task.precision : 'null'}, ${task.matched_objs !== null ? task.matched_objs : 'null'}, ${task.missing_objs !== null ? task.missing_objs : 'null'}, ${task.user_objs !== null ? task.user_objs : 'null'})" class="action-link" style="border:none;background:#ECFDF5;color:#059669;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;transition:all 0.2s;" onmouseover="this.style.background='#059669';this.style.color='#FFFFFF';" onmouseout="this.style.background='#ECFDF5';this.style.color='#059669';" title="Xem nhận xét từ Admin">
                <i class="fa-solid fa-eye"></i> Xem đánh giá
            </button>`;
        } else {
            // Reviewer gửi phản hồi lỗi bắt sửa: Chuyển hướng tới trang FrameList để sửa lỗi
            return `<a href="FrameList.html?taskId=${task.id}&mode=fix" class="action-link" style="background:#FEF2F2;color:#EF4444;padding:8px 18px;border-radius:6px;font-size:11px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.background='#EF4444';this.style.color='#FFFFFF';" onmouseout="this.style.background='#FEF2F2';this.style.color='#EF4444';"><i class="fa-solid fa-pen-to-square"></i> Sửa lỗi</a>`;
        }
    }
    // Chưa làm hoặc đang làm dở dang: Vào thẳng trang gán nhãn Label.html
    if (s === 'pending' || s === 'in_progress')
        return `<a href="Label.html?taskId=${task.id}" class="action-link" style="background:#EFF6FF;color:#2563EB;padding:8px 18px;border-radius:6px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.background='#2563EB';this.style.color='#FFFFFF';" onmouseout="this.style.background='#EFF6FF';this.style.color='#2563EB';"><i class="fa-solid fa-pen-to-square"></i> Gán nhãn</a>`;
    if (s === 'submitted')
        return `<span style="color:#94A3B8;font-size:12px;font-style:italic"><i class="fa-solid fa-clock"></i> Đợi kiểm tra</span>`;
    if (s === 'under_review')
        return `<span style="color:#7C3AED;font-size:12px;font-style:italic"><i class="fa-solid fa-magnifying-glass"></i> Đang kiểm tra</span>`;
    if (s === 'reviewed')
        return `<span style="color:#2563EB;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã kiểm tra</span>`;
    return '<span style="color:#94A3B8">—</span>';
}

// ==========================================
// QUẢN LÝ NHIỆM VỤ KIỂM TRA (REVIEWER)
// ==========================================
let reviewTasks = []; // Lưu trữ danh sách nhiệm vụ được giao kiểm duyệt

// Gọi API lấy danh sách nhiệm vụ được phân công làm Reviewer
async function loadReviewTasks() {
    const tbody = document.getElementById('reviewTasksBody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </td></tr>`;
    try {
        const res = await fetch(`${BASE_URL}/tasks?project_id=${projectId}&role=reviewer`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        reviewTasks = await res.json();
        populateSubmitterFilter(reviewTasks); // Điền danh sách labeler vào bộ lọc tìm kiếm
        applyReviewFilters(true);              // Áp dụng bộ lọc và phân trang cho Review
        updateStats(myTasks);                  // Cập nhật thống kê hiệu suất
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#EF4444">Không thể tải dữ liệu</td></tr>`;
    }
}

// Hàm render dữ liệu danh sách nhiệm vụ kiểm duyệt lên bảng HTML
function renderReviewTasks(tasks, startIndex = 0) {
    const tbody = document.getElementById('reviewTasksBody');
    if (!tasks.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
            <i class="fa-regular fa-folder-open"></i>
            <h3>Chưa có nhiệm vụ kiểm tra</h3>
            <p>Bạn chưa được phân công làm reviewer cho nhiệm vụ nào trong dự án này.</p>
        </div></td></tr>`;
        document.getElementById('showingReview').textContent = 'Không có dữ liệu';
        document.getElementById('tabBadgeReview').textContent = 0;
        return;
    }
    tbody.innerHTML = tasks.map((task, idx) => {
        const name = task.scene_name || `Nhiệm vụ #${task.id}`;
        const desc = task.scene_description || '';
        const progress = task.frame_count > 0 ? Math.round((task.annotated_frames / task.frame_count) * 100) : 0;
        const progressColor = progress >= 100 ? 'green' : (progress >= 50 ? 'teal' : 'blue');

        const canReview = task.status === 'submitted' || task.status === 'under_review';
        let actionHtml = '';
        if (task.admin_moderated) {
            if (task.status === 'approved') {
                actionHtml = `<span style="color:#10B981;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã duyệt</span>`;
            } else {
                actionHtml = `<span style="color:#EF4444;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-xmark"></i> Chưa đạt</span>`;
            }
        } else if (canReview) {
            // Nút "Kiểm tra": Nếu đã có feedback (từng bị trả về) chuyển tới FrameList, ngược lại vào thẳng trang Label_Review
            actionHtml = task.feedback
                ? `<a href="FrameList.html?taskId=${task.id}&mode=review" class="action-link" style="color:#D97706;background:#FEF3C7;font-size:11px;padding:8px 18px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.background='#D97706';this.style.color='#FFFFFF';" onmouseout="this.style.background='#FEF3C7';this.style.color='#D97706';"><i class="fa-solid fa-magnifying-glass"></i> Kiểm tra</a>`
                : `<a href="Label_Review.html?taskId=${task.id}&mode=review" class="action-link" style="color:#D97706;background:#FEF3C7;font-size:11px;padding:8px 18px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.background='#D97706';this.style.color='#FFFFFF';" onmouseout="this.style.background='#FEF3C7';this.style.color='#D97706';"><i class="fa-solid fa-magnifying-glass"></i> Kiểm tra</a>`;
        } else if (task.status === 'reviewed') {
            actionHtml = `<span style="color:#2563EB;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã kiểm tra</span>`;
        } else if (task.status === 'approved') {
            actionHtml = `<span style="color:#10B981;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã duyệt</span>`;
        } else if (task.status === 'rejected') {
            actionHtml = `<span style="color:#2563EB;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-check"></i> Đã kiểm tra</span>`;
        } else {
            actionHtml = `<span style="color:#94A3B8">—</span>`;
        }
 
        return `<tr>
            <td style="text-align:center;font-weight:600;color:#64748B">${startIndex + idx + 1}</td>
            <td><div class="scene-name">
                <div class="scene-icon" style="background:#FAF5FF;color:#9333EA"><i class="fa-solid fa-film"></i></div>
                <div><div>${name}</div>${desc ? `<div class="scene-meta">${desc}</div>` : ''}</div>
            </div></td>
            <td>${getUserCell(task.assigned_user)}</td>
            <td>${getStatusBadge(task.status, task.admin_moderated, task.is_deleted)}</td>
            <td><div class="progress-cell">
                <div class="progress-bar"><div class="progress-fill ${progressColor}" style="width:${progress}%"></div></div>
                <span class="progress-text">${task.frame_count > 0 ? progress + '%' : '—'}</span>
            </div></td>
            <td>${actionHtml}</td>
        </tr>`;
    }).join('');
    document.getElementById('tabBadgeReview').textContent = reviewTasks.length;
}

// ==========================================
// CẬP NHẬT THỐNG KÊ HIỆU SUẤT CÁ NHÂN
// ==========================================
function updateStats(tasks) {
    const activeTasks = tasks.filter(t => !t.is_deleted);
    const total = activeTasks.length;
    const done = activeTasks.filter(t => t.status === 'approved').length;
    const rejected = activeTasks.filter(t => t.status === 'rejected').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const pendingReview = reviewTasks.filter(t => !t.is_deleted && t.status === 'under_review').length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statTotalText').textContent = `${total} nhiệm vụ`;
    document.getElementById('statDone').textContent = done;
    document.getElementById('statDonePct').textContent = `${pct}%`;
    document.getElementById('statRejected').textContent = rejected;
    const reviewPct = total > 0 ? Math.round((pendingReview / total) * 100) : 0;
    document.getElementById('statReview').textContent = pendingReview;
    document.getElementById('statReviewText').textContent = `${reviewPct}%`;
 
    // Chỉ tính độ tin cậy từ những tác vụ đã được admin đánh giá chi tiết (admin_moderated = true)
    // Những tác vụ mới chỉ qua tay reviewer đánh giá thô chưa được đưa vào thống kê chất lượng này.
    const evaluatedTasksList = tasks.filter(t => t.admin_moderated === true && (!t.is_deleted || t.status === 'rejected'));
    let avgReliability = 0;
    let countEvaluatedWithPrecision = 0;
    let sumReliability = 0;
 
    evaluatedTasksList.forEach(t => {
        if (t.precision !== null && t.precision !== undefined) {
            sumReliability += t.precision;
            countEvaluatedWithPrecision++;
        }
    });
 
    if (countEvaluatedWithPrecision > 0) {
        avgReliability = Math.round(sumReliability / countEvaluatedWithPrecision);
    }
 
    const reliabilityEl = document.getElementById('statUserReliability');
    const reliabilityUnitEl = document.getElementById('statUserReliabilityUnit');
    if (reliabilityEl && reliabilityUnitEl) {
        if (countEvaluatedWithPrecision > 0) {
            reliabilityEl.textContent = `${avgReliability}%`;
            reliabilityUnitEl.textContent = 'trung bình';
        } else {
            // Hiển thị trạng thái trung lập rõ ràng nếu chưa có đánh giá nào
            reliabilityEl.textContent = '—';
            reliabilityUnitEl.textContent = 'Chưa được đánh giá';
        }
    }
}

// ==========================================
// XỬ LÝ LỌC & TÌM KIẾM DỮ LIỆU
// ==========================================
// Lắng nghe sự kiện gõ ô tìm kiếm nhiệm vụ tự làm
document.getElementById('searchMyTasks').addEventListener('input', function () {
    applyMyTasksFilters(true);
});
// Lắng nghe sự kiện gõ ô tìm kiếm nhiệm vụ kiểm duyệt
document.getElementById('searchReview').addEventListener('input', function () {
    applyReviewFilters(true);
});
 
let currentMyTasksPage = 1;
const itemsPerPage = 5; // Số nhiệm vụ trên mỗi trang của bảng tự làm
 
let currentReviewPage = 1;
const reviewItemsPerPage = 5; // Số nhiệm vụ trên mỗi trang của bảng kiểm duyệt
 
let myTasksFilterOpen = false;
let reviewFilterOpen = false;
 
// Bật/tắt thanh điều khiển bộ lọc của bảng "Nhiệm vụ của tôi"
function toggleMyTasksFilterPanel() {
    const panel = document.getElementById('myTasksFilterPanel');
    const btn = document.getElementById('btnMyTasksFilterToggle');
    myTasksFilterOpen = !myTasksFilterOpen;
    if (myTasksFilterOpen) {
        panel.classList.add('active');
        btn.classList.add('active');
    } else {
        panel.classList.remove('active');
        btn.classList.remove('active');
    }
}
 
// Xóa toàn bộ bộ lọc đã chọn ở bảng "Nhiệm vụ của tôi"
function resetMyTasksFilters() {
    document.getElementById('searchMyTasks').value = '';
    document.getElementById('filterMyTasksStatus').value = 'all';
    document.getElementById('filterMyTasksProgress').value = 'all';
    applyMyTasksFilters(true);
}
 
// Bật/tắt thanh điều khiển bộ lọc của bảng "Nhiệm vụ kiểm tra"
function toggleReviewFilterPanel() {
    const panel = document.getElementById('reviewFilterPanel');
    const btn = document.getElementById('btnReviewFilterToggle');
    reviewFilterOpen = !reviewFilterOpen;
    if (reviewFilterOpen) {
        panel.classList.add('active');
        btn.classList.add('active');
    } else {
        panel.classList.remove('active');
        btn.classList.remove('active');
    }
}
 
// Xóa toàn bộ bộ lọc đã chọn ở bảng "Nhiệm vụ kiểm tra"
function resetReviewFilters() {
    document.getElementById('searchReview').value = '';
    document.getElementById('filterReviewStatus').value = 'all';
    document.getElementById('filterReviewProgress').value = 'all';
    document.getElementById('filterReviewSubmitter').value = 'all';
    applyReviewFilters(true);
}
 
// Cập nhật nhãn đếm số lượng bộ lọc đang hoạt động ở bảng tự làm
function updateMyTasksFilterBadge(count) {
    const badge = document.getElementById('myTasksFilterBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
}
 
// Cập nhật nhãn đếm số lượng bộ lọc đang hoạt động ở bảng kiểm duyệt
function updateReviewFilterBadge(count) {
    const badge = document.getElementById('reviewFilterBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
}
 
// Hàm áp dụng các bộ lọc của bảng "Nhiệm vụ của tôi" và thực hiện phân trang
function applyMyTasksFilters(resetPage = false) {
    if (resetPage) currentMyTasksPage = 1;
    
    const query = document.getElementById('searchMyTasks').value.toLowerCase().trim();
    const status = document.getElementById('filterMyTasksStatus').value;
    const progressFilter = document.getElementById('filterMyTasksProgress').value;
    
    let activeFilterCount = 0;
    if (status !== 'all') activeFilterCount++;
    if (progressFilter !== 'all') activeFilterCount++;
    updateMyTasksFilterBadge(activeFilterCount);
    
    const filtered = myTasks.filter(t => {
        // Lọc theo từ khóa tên khung cảnh
        const sceneName = (t.scene_name || '').toLowerCase();
        if (query && !sceneName.includes(query)) return false;
        
        // Lọc theo trạng thái cụ thể
        if (status !== 'all') {
            if (status === 'cancelled') {
                if (!t.is_deleted) return false;
            } else if (status === 'rejected') {
                if (t.status !== 'rejected' || t.is_deleted) return false;
            } else {
                if (t.status !== status || t.is_deleted) return false;
            }
        }
        
        // Lọc theo dải tiến độ gán nhãn
        const progress = t.frame_count > 0 ? Math.round((t.annotated_frames / t.frame_count) * 100) : 0;
        if (progressFilter === 'range_0_50') {
            if (progress > 50) return false;
        } else if (progressFilter === 'range_51_100') {
            if (progress <= 50) return false;
        }
        
        return true;
    });
    
    // Tính toán số lượng trang
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    if (currentMyTasksPage > totalPages) currentMyTasksPage = totalPages;
    
    const startIndex = (currentMyTasksPage - 1) * itemsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);
    
    renderMyTasks(paginated, startIndex);
    renderPagination('myTasksPagination', currentMyTasksPage, totalPages, (page) => {
        currentMyTasksPage = page;
        applyMyTasksFilters(false);
    });
    
    // Hiển thị dòng mô tả phân trang
    const showingEl = document.getElementById('showingMyTasks');
    if (showingEl) {
        if (filtered.length > 0) {
            const end = Math.min(startIndex + itemsPerPage, filtered.length);
            showingEl.textContent = `Hiển thị ${startIndex + 1}-${end} trong số ${filtered.length} nhiệm vụ`;
        } else {
            showingEl.textContent = 'Không có nhiệm vụ nào';
        }
    }
}
 
// Điền danh sách người nộp nhãn (Labeler) vào thẻ Select của bộ lọc kiểm duyệt
function populateSubmitterFilter(tasks) {
    const filterSelect = document.getElementById('filterReviewSubmitter');
    if (!filterSelect) return;
    
    const currentSelection = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">Tất cả</option>';
    
    const usersMap = new Map();
    tasks.forEach(t => {
        if (t.assigned_user) {
            const username = t.assigned_user.username;
            const fullName = t.assigned_user.full_name;
            const displayName = fullName ? `${username} (${fullName})` : username;
            usersMap.set(t.assigned_user.id, displayName);
        }
    });
    
    usersMap.forEach((displayName, userId) => {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = displayName;
        filterSelect.appendChild(option);
    });
    
    if (usersMap.has(Number(currentSelection))) {
        filterSelect.value = currentSelection;
    }
}
 
// Hàm áp dụng các bộ lọc của bảng "Nhiệm vụ kiểm tra" và thực hiện phân trang
function applyReviewFilters(resetPage = false) {
    if (resetPage) currentReviewPage = 1;
    
    const query = document.getElementById('searchReview').value.toLowerCase().trim();
    const status = document.getElementById('filterReviewStatus').value;
    const progressFilter = document.getElementById('filterReviewProgress').value;
    const submitter = document.getElementById('filterReviewSubmitter').value;
    
    let activeFilterCount = 0;
    if (status !== 'all') activeFilterCount++;
    if (progressFilter !== 'all') activeFilterCount++;
    if (submitter !== 'all') activeFilterCount++;
    updateReviewFilterBadge(activeFilterCount);
    
    const filtered = reviewTasks.filter(t => {
        const sceneName = (t.scene_name || '').toLowerCase();
        if (query && !sceneName.includes(query)) return false;
        
        if (status !== 'all') {
            if (t.status !== status) return false;
        }
        
        const progress = t.frame_count > 0 ? Math.round((t.annotated_frames / t.frame_count) * 100) : 0;
        if (progressFilter === 'range_0_50') {
            if (progress > 50) return false;
        } else if (progressFilter === 'range_51_100') {
            if (progress <= 50) return false;
        }
        
        if (submitter !== 'all') {
            if (!t.assigned_user || String(t.assigned_user.id) !== String(submitter)) return false;
        }
        
        return true;
    });
    
    const totalPages = Math.ceil(filtered.length / reviewItemsPerPage) || 1;
    if (currentReviewPage > totalPages) currentReviewPage = totalPages;
    
    const startIndex = (currentReviewPage - 1) * reviewItemsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + reviewItemsPerPage);
    
    renderReviewTasks(paginated, startIndex);
    renderPagination('reviewTasksPagination', currentReviewPage, totalPages, (page) => {
        currentReviewPage = page;
        applyReviewFilters(false);
    });
    
    const showingEl = document.getElementById('showingReview');
    if (showingEl) {
        if (filtered.length > 0) {
            const end = Math.min(startIndex + reviewItemsPerPage, filtered.length);
            showingEl.textContent = `Hiển thị ${startIndex + 1}-${end} trong số ${filtered.length} bài cần kiểm tra`;
        } else {
            showingEl.textContent = 'Không có bài cần kiểm tra nào';
        }
    }
}
 
// Hàm chung render các nút bấm phân trang (Pagination)
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" ${currentPage === 1 ? 'disabled' : ''} onclick="window.${containerId}ChangePage(${currentPage - 1})">
        <i class="fa-solid fa-chevron-left"></i>
    </button>`;
    
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${currentPage === i ? 'active' : ''}" onclick="window.${containerId}ChangePage(${i})">${i}</button>`;
    }
    
    html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.${containerId}ChangePage(${currentPage + 1})">
        <i class="fa-solid fa-chevron-right"></i>
    </button>`;
    
    container.innerHTML = html;
    window[`${containerId}ChangePage`] = onPageChange;
}
 
// ==========================================
// KHỞI CHẠY TẢI DỮ LIỆU BAN ĐẦU
// ==========================================
loadSidebarProject();
loadMyTasks();
loadReviewTasks();
 
// ==========================================
// HIỂN THỊ MODAL CHI TIẾT ĐÁNH GIÁ TỪ ADMIN
// ==========================================
// Hàm dựng và chèn modal popup động hiển thị chi tiết điểm số, số nhãn khớp và nhận xét của Admin
function showEvaluationDetailPopup(statusText, feedbackText, precision, matchedObjs, missingObjs, userObjs) {
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
 
    let precisionHTML = '';
    // Nếu tác vụ đã được đối chiếu độ khớp nhãn vẽ (precision)
    if (precision !== null) {
        const precisionColor = precision >= 85 ? '#10B981' : precision >= 70 ? '#3B82F6' : '#EF4444';
        precisionHTML = `
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; font-weight:700; color:#475569;">Độ tin cậy đạt được:</span>
                <span style="font-size:16px; font-weight:800; color:${precisionColor};">${precision}%</span>
            </div>
            <div style="width:100%; height:6px; background:#E2E8F0; border-radius:3px; overflow:hidden;">
                <div style="width:${precision}%; height:100%; background:${precisionColor}; border-radius:3px;"></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px;">
                <div style="font-size:11px; color:#64748B;">
                    <i class="fa-solid fa-circle-check" style="color:#10B981; margin-right:4px;"></i>Khớp nhãn đầu: <strong>${matchedObjs} nhãn</strong>
                </div>
                <div style="font-size:11px; color:#64748B;">
                    <i class="fa-solid fa-circle-xmark" style="color:#EF4444; margin-right:4px;"></i>Sai lệch đã sửa: <strong>${missingObjs} nhãn</strong>
                </div>
                <div style="font-size:11px; color:#64748B; grid-column: span 2;">
                    <i class="fa-solid fa-pen" style="color:#6366F1; margin-right:4px;"></i>Tổng số nhãn bạn đã vẽ: <strong>${userObjs} nhãn</strong>
                </div>
            </div>
        </div>`;
    }
 
    modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:440px;box-shadow:0 20px 40px rgba(0,0,0,0.18);font-family:Inter,sans-serif;display:flex;flex-direction:column;animation:popupScaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);box-sizing:border-box;">
        <style>
            @keyframes popupScaleUp {
                from { transform: scale(0.96); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        </style>
        <!-- Tiêu đề modal -->
        <div style="padding:20px 24px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;">
            <div style="font-size:16px;font-weight:800;color:#1E293B;display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-stamp" style="color:#7C3AED;"></i>
                Đánh giá từ Admin
            </div>
            <button onclick="document.getElementById('evalDetailPopupModal').remove()" style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:20px;padding:4px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
 
        <!-- Nội dung modal -->
        <div style="padding:24px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:12px;box-sizing:border-box;">
                <span style="font-size:13px;font-weight:600;color:#475569;">Trạng thái:</span>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:${badgeBg};color:${badgeColor};border-radius:20px;font-size:13px;font-weight:700;border:1px solid ${badgeBorder};box-sizing:border-box;">
                    <i class="fa-solid ${icon}"></i> ${statusText}
                </span>
            </div>
 
            ${precisionHTML}
 
            <div style="box-sizing:border-box;">
                <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;">Nội dung nhận xét:</div>
                <div style="padding:12px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:13px;color:#334155;white-space:pre-wrap;min-height:60px;line-height:1.5;box-sizing:border-box;">${feedbackText || 'Không có nhận xét thêm từ Admin.'}</div>
            </div>
        </div>
 
        <!-- Nút đóng dưới chân modal -->
        <div style="padding:16px 24px;border-top:1px solid #F1F5F9;display:flex;justify-content:flex-end;box-sizing:border-box;">
            <button onclick="document.getElementById('evalDetailPopupModal').remove()" style="height:38px;padding:0 20px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">Đóng</button>
        </div>
    </div>`;
 
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}
