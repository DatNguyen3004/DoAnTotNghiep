// ==========================================
// CẤU HÌNH & XÁC THỰC CƠ BẢN
// ==========================================
const BASE_URL = '/api'; // Đường dẫn gốc kết nối với API backend

// Hàm lấy mã JWT token từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// KIỂM TRA QUYỀN TRUY CẬP (Auth guard)
// Đọc thông tin người dùng từ local và kiểm tra vai trò.
// Nếu không đăng nhập hoặc vai trò không phải 'user', chuyển hướng về trang đăng nhập login.html
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}

// BỐI CẢNH DỰ ÁN (Project context)
// Lấy ID dự án và tên dự án hiện tại đang làm việc từ sessionStorage.
// Nếu không tìm thấy projectId, buộc chuyển hướng về trang danh sách dự án ManagerProject.html
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Dashboard';
if (!projectId) window.location.href = 'ManagerProject.html';

// ==========================================
// KHỞI TẠO KHI TẢI XONG TRANG (DOM READY)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Thiết lập tên dự án lên tiêu đề của Sidebar bên trái
    const sideProjectNameEl = document.getElementById('sideProjectName');
    if (sideProjectNameEl) sideProjectNameEl.textContent = projectName;

    // Thiết lập sự kiện thu gọn/mở rộng thanh menu bên trái (Sidebar)
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    const mainWrapper = document.getElementById('mainWrapper');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainWrapper.classList.toggle('expanded');
        });
    }

    // Tải thông tin logo dự án và tải các giá trị thiết lập hiện tại lên form
    loadSidebarProject();
    loadSettings();
});

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
        
        // Nếu dự án có cấu hình ảnh bìa (cover_image), hiển thị nó làm Logo dự án
        if (project.cover_image) {
            const logo = document.getElementById('sideProjectLogo');
            if (logo) {
                logo.src = project.cover_image;
                logo.style.display = 'block';
                document.getElementById('sideProjectText').style.display = 'none';
            }
        }
        // Cập nhật tên dự án chính thức từ database lên sidebar
        const nameEl = document.getElementById('sideProjectName');
        if (nameEl) nameEl.textContent = project.name || projectName;
    } catch (e) { /* silent - bỏ qua lỗi nếu không tải được logo */ }
}

// Hàm cập nhật văn bản hiển thị phần trăm (%) khi người dùng kéo thanh trượt (slider)
function updateSlider(sliderId, valueId, divisor) {
    const el = document.getElementById(sliderId);
    const valEl = document.getElementById(valueId);
    if (el && valEl) {
        valEl.textContent = `${el.value}%`;
    }
}

// Hàm tải các giá trị cấu hình hiện tại từ localStorage lên giao diện slider
function loadSettings() {
    // Đọc ngưỡng review của AI (mặc định là 0.85 tức là 85% khớp nhãn)
    const aiReviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');
    const slider = document.getElementById('aiReviewThreshold');
    const valEl = document.getElementById('aiReviewThresholdVal');
    
    // Đưa giá trị phần trăm (0 - 100) lên thanh trượt và nhãn hiển thị tương ứng
    if (slider) slider.value = Math.round(aiReviewThreshold * 100);
    if (valEl) valEl.textContent = `${Math.round(aiReviewThreshold * 100)}%`;
}

// Hàm lưu cấu hình hiện tại trên giao diện vào localStorage
function saveSettings() {
    const slider = document.getElementById('aiReviewThreshold');
    if (!slider) return;
    
    // Chuyển đổi giá trị thanh trượt (0 - 100) về dạng số thập phân (0.0 - 1.0) và lưu
    const aiReviewThreshold = slider.value / 100;
    localStorage.setItem('ai_review_threshold', aiReviewThreshold.toString());

    // Hiển thị hiệu ứng badge thông báo "Đã lưu thành công" biến mất sau 2.5 giây
    const badge = document.getElementById('savedBadge');
    if (badge) {
        badge.classList.add('show');
        setTimeout(() => badge.classList.remove('show'), 2500);
    }
}

// Hàm khôi phục cấu hình ngưỡng AI về giá trị mặc định của hệ thống (85%)
function resetSettings() {
    const slider = document.getElementById('aiReviewThreshold');
    const valEl = document.getElementById('aiReviewThresholdVal');
    if (slider) slider.value = 85;
    if (valEl) valEl.textContent = '85%';
}
