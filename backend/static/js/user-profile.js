// ==========================================
// CẤU HÌNH & XÁC THỰC CƠ BẢN
// ==========================================
const BASE_URL = '/api'; // Đường dẫn gốc API backend

// Hàm lấy token xác thực (JWT) từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// Đọc thông tin người dùng hiện tại từ localStorage
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');

// Điều hướng về trang login nếu chưa đăng nhập (không có token)
if (!getToken()) window.location.href = '../login.html';

// ==========================================
// XỬ LÝ THAM SỐ URL & QUYỀN TRUY CẬP
// ==========================================
const params = new URLSearchParams(window.location.search);
const viewUserId = params.get('userId'); // Lấy userId từ URL (nếu có, để xem hồ sơ người khác)
const isReadonly = params.get('readonly') === 'true'; // Kiểm tra chế độ chỉ đọc từ URL

// Định nghĩa ID của đối tượng cần tác động (mặc định là chính mình)
const targetId = viewUserId || currentUser.id;

// Chế độ chỉ đọc được kích hoạt nếu có tham số readonly=true, 
// hoặc khi Admin xem hồ sơ của một user khác không phải chính mình.
const readonly = isReadonly || (currentUser.role === 'admin' && viewUserId && parseInt(viewUserId) !== currentUser.id);

// Hiển thị tên dự án hiện tại trên sidebar
const projectName = sessionStorage.getItem('projectName') || 'Dashboard';
const sideEl = document.getElementById('sideProjectName');
if (sideEl) sideEl.textContent = projectName;

// ==========================================
// ĐỒNG BỘ GIAO DIỆN & TƯƠNG TÁC SIDEBAR
// ==========================================
// Tải ảnh đại diện (avatar) của tài khoản hiện tại lên thanh điều hướng (topnav)
const topnavAvatar = document.getElementById('topnavAvatar');
if (topnavAvatar && currentUser.avatar_url) {
    topnavAvatar.src = currentUser.avatar_url;
}

// Xử lý sự kiện thu gọn/mở rộng thanh menu bên trái (sidebar)
document.getElementById('toggleSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.getElementById('mainWrapper').classList.toggle('expanded');
});

// ==========================================
// CÁC HÀM XỬ LÝ DỮ LIỆU HỒ SƠ (API)
// ==========================================
// Hàm gọi API tải thông tin hồ sơ của người dùng từ backend
async function loadProfile() {
    try {
        const res = await fetch(BASE_URL + '/users/' + targetId, {
            headers: { Authorization: 'Bearer ' + getToken() }
        });
        if (!res.ok) throw new Error();
        const user = await res.json();
        fillForm(user); // Điền thông tin tải được vào form
    } catch(e) {
        fillForm(currentUser); // Nếu lỗi tải, sử dụng thông tin hiện tại lưu ở local làm dự phòng
    }
    // Nếu ở chế độ readonly, vô hiệu hóa form và các nút tương tác
    if (readonly) setReadonly();
}

// Hàm điền dữ liệu người dùng vào các trường nhập liệu tương ứng trên giao diện
function fillForm(user) {
    document.getElementById('pFullName').value = user.full_name || '';
    document.getElementById('pEmail').value = user.email || '';
    document.getElementById('pGender').value = user.gender || 'Nam';
    document.getElementById('pBirthDate').value = user.birth_date || '';
    document.getElementById('pPhone').value = user.phone || '';
    document.getElementById('pAddress').value = user.address || '';
    if (user.avatar_url) {
        document.querySelector('.avatar-preview').src = user.avatar_url;
    }
}

// Hàm vô hiệu hóa form và ẩn các nút sửa đổi khi truy cập ở chế độ Chỉ đọc (Read-only)
function setReadonly() {
    // Vô hiệu hóa tất cả các trường input
    ['pFullName','pEmail','pGender','pBirthDate','pPhone','pAddress'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.disabled = true; el.style.background = '#F8FAFC'; el.style.color = '#94A3B8'; }
    });
    // Ẩn nút lưu và nút thay đổi ảnh đại diện
    document.querySelector('.btn-save').style.display = 'none';
    document.querySelector('.btn-change-photo').style.display = 'none';
    
    // Tạo và chèn banner cảnh báo chế độ xem chỉ đọc ở đầu form
    var notice = document.createElement('div');
    notice.style.cssText = 'background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:10px 14px;font-size:13px;color:#C2410C;margin-bottom:16px;display:flex;align-items:center;gap:8px;font-family:Inter,sans-serif';
    notice.innerHTML = '<i class="fa-solid fa-eye"></i> Chế độ xem — không thể chỉnh sửa thông tin người dùng khác';
    document.querySelector('.form-section').prepend(notice);
}

// ==========================================
// TRÌNH XỬ LÝ SỰ KIỆN TƯƠNG TÁC (BUTTON CLICKS)
// ==========================================
// Đăng ký sự kiện Click nút "Lưu thay đổi" để gửi thông tin cập nhật lên backend
document.querySelector('.btn-save').addEventListener('click', async function() {
    // Thu thập dữ liệu từ form
    var body = {
        full_name: document.getElementById('pFullName').value.trim(),
        email: document.getElementById('pEmail').value.trim(),
        gender: document.getElementById('pGender').value,
        birth_date: document.getElementById('pBirthDate').value.trim(),
        phone: document.getElementById('pPhone').value.trim(),
        address: document.getElementById('pAddress').value.trim(),
    };
    var btn = document.querySelector('.btn-save');
    btn.disabled = true; btn.textContent = 'Đang lưu...';
    try {
        // Gửi yêu cầu PUT để cập nhật thông tin người dùng
        var res = await fetch(BASE_URL + '/users/' + targetId, {
            method: 'PUT',
            headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            showToast('Đã lưu thông tin', 'success');
            // Nếu người dùng tự cập nhật hồ sơ của chính mình, đồng bộ lại dữ liệu vào localStorage
            if (parseInt(targetId) === currentUser.id) {
                Object.assign(currentUser, body);
                localStorage.setItem('current_user', JSON.stringify(currentUser));
            }
        } else {
            var err = await res.json();
            showToast(err.detail || 'Lỗi lưu', 'error');
        }
    } catch(e) { showToast('Lỗi kết nối', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Lưu thay đổi'; }
});

// Đăng ký sự kiện Click nút "Thay đổi ảnh đại diện" để tải file ảnh lên backend
document.querySelector('.btn-change-photo').addEventListener('click', function() {
    // Tạo phần tử file input động
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async function() {
        var file = input.files[0];
        if (!file) return;
        var fd = new FormData(); fd.append('file', file);
        try {
            // Bước 1: Gửi file ảnh lên API tải lên file
            var res = await fetch(BASE_URL + '/users/upload-avatar', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + getToken() },
                body: fd
            });
            if (res.ok) {
                var data = await res.json();
                // Hiển thị ảnh đại diện mới trên khung xem trước
                document.querySelector('.avatar-preview').src = data.url;
                
                // Bước 2: Gọi API cập nhật trường avatar_url trong database người dùng
                await fetch(BASE_URL + '/users/' + targetId, {
                    method: 'PUT',
                    headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar_url: data.url })
                });
                
                // Bước 3: Nếu tự thay ảnh chính mình, cập nhật localStorage và ảnh đại diện trên thanh topnav
                if (parseInt(targetId) === currentUser.id) {
                    currentUser.avatar_url = data.url;
                    localStorage.setItem('current_user', JSON.stringify(currentUser));
                    if (topnavAvatar) topnavAvatar.src = data.url;
                }
                showToast('Đã cập nhật ảnh đại diện', 'success');
            }
        } catch(e) { showToast('Lỗi tải ảnh', 'error'); }
    };
    input.click(); // Mở hộp thoại chọn file của hệ điều hành
});

// ==========================================
// CÁC HÀM TRỰC QUAN GIAO DIỆN (UI UTILS)
// ==========================================
// Hàm hiển thị thông báo Toast nhanh góc màn hình
function showToast(msg, type) {
    var colors = { success: '#10B981', error: '#EF4444' };
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:20px;right:20px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:' + (colors[type]||'#2563EB') + ';box-shadow:0 4px 16px rgba(0,0,0,0.2);font-family:Inter,sans-serif';
    t.textContent = msg;
    document.body.appendChild(t);
    // Tự động xóa Toast sau 3 giây
    setTimeout(function() { t.remove(); }, 3000);
}

// Khởi chạy tải dữ liệu hồ sơ ngay khi tải trang
loadProfile();