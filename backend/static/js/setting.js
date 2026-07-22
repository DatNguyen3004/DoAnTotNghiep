// ==========================================
// CẤU HÌNH & XÁC THỰC CƠ BẢN
// ==========================================
const BASE_URL = '/api'; // Đường dẫn gốc kết nối với API backend

// Hàm lấy token xác thực (JWT) từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// KIỂM TRA QUYỀN TRUY CẬP (Auth guard)
// Đọc thông tin người dùng từ local và kiểm tra vai trò.
// Nếu không đăng nhập hoặc vai trò không phải 'admin', tự động chuyển hướng về trang đăng nhập login.html
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'admin') {
    window.location.href = '../login.html';
}

// BỐI CẢNH DỰ ÁN (Project context)
// Lấy ID dự án và tên dự án hiện tại từ sessionStorage.
// Nếu không tìm thấy projectId, buộc chuyển hướng về trang danh sách dự án ManagerProject.html
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Dashboard';
if (!projectId) window.location.href = 'ManagerProject.html';

// Thiết lập tên dự án lên tiêu đề của Sidebar bên trái
const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) sideProjectNameEl.textContent = projectName;

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

// ==========================================
// CÁC HÀM XỬ LÝ DỮ LIỆU & GIAO DIỆN (UI & API)
// ==========================================
// Hàm gọi API tải thông tin chi tiết dự án để cập nhật ảnh logo dự án lên sidebar
async function loadSidebarProject() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const project = await res.json();
        
        // Nếu dự án có ảnh bìa (cover_image), hiển thị logo dự án
        if (project.cover_image) {
            const logo = document.getElementById('sideProjectLogo');
            logo.src = project.cover_image;
            logo.style.display = 'block';
            document.getElementById('sideProjectText').style.display = 'none';
        }
        document.getElementById('sideProjectName').textContent = project.name || projectName;
    } catch (e) { /* Bỏ qua lỗi âm thầm nếu không tải được logo */ }
}

// Hàm cập nhật nhãn phần trăm (%) khi người dùng kéo thanh trượt (slider)
function updateSlider(sliderId, valueId, divisor) {
    const val = document.getElementById(sliderId).value;
    document.getElementById(valueId).textContent = `${val}%`;
}

// Hàm tải cài đặt cấu hình hiện tại của dự án từ localStorage lên form
function loadSettings() {
    // Đọc ngưỡng tin cậy của AI (mặc định là 0.25 tức là 25% tin cậy)
    const aiThreshold = parseFloat(localStorage.getItem('ai_threshold') || '0.25');
    document.getElementById('aiThreshold').value = Math.round(aiThreshold * 100);
    document.getElementById('aiThresholdVal').textContent = `${Math.round(aiThreshold * 100)}%`;
}

// Hàm lưu cấu hình hiện tại vào localStorage
function saveSettings() {
    const aiThreshold = document.getElementById('aiThreshold').value / 100;
    localStorage.setItem('ai_threshold', aiThreshold.toString());

    // Hiển thị hiệu ứng badge thông báo "Đã lưu thành công" biến mất sau 2.5 giây
    const badge = document.getElementById('savedBadge');
    badge.classList.add('show');
    setTimeout(() => badge.classList.remove('show'), 2500);
}

// Hàm khôi phục cấu hình ngưỡng AI về giá trị mặc định của hệ thống (25%)
function resetSettings() {
    document.getElementById('aiThreshold').value = 25;
    document.getElementById('aiThresholdVal').textContent = '25%';
}

// ==========================================
// HÀM XUẤT FILE DỮ LIỆU DỰ ÁN (EXPORT ZIP)
// ==========================================
// Hàm gọi API backend để đóng gói toàn bộ dữ liệu dự án dạng file .zip
async function exportProject() {
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';

    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/export`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || 'Lỗi xuất file. Vui lòng thử lại.');
            return;
        }

        // Đọc dữ liệu blob và tạo file download động trên client
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content_export_project_${projectId}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('Lỗi kết nối server');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-download"></i> Xuất file';
    }
}

// ==========================================
// KHỞI CHẠY TẢI DỮ LIỆU BAN ĐẦU
// ==========================================
loadSidebarProject();
loadSettings();
