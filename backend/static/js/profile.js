// ==============================================================================
// PROFILE JS (Sử dụng chung cho trang thông tin cá nhân của Admin/Profile.html và User/Profile.html)
// ==============================================================================
const BASE_URL = '/api'; // Đường dẫn gốc API backend

// Hàm lấy token xác thực (JWT) từ localStorage
function getToken() { return localStorage.getItem('access_token'); }

// Đọc thông tin người dùng hiện tại từ localStorage
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');

// Điều hướng về trang login nếu chưa đăng nhập (không có token)
if (!getToken()) window.location.href = '../login.html';

// Phân tích tham số URL để xác định mục tiêu xem thông tin
const params = new URLSearchParams(window.location.search);
const viewUserId = params.get('userId'); // ID người dùng cần xem (nếu admin đang xem thông tin nhân viên)
const isReadonly = params.get('readonly') === 'true'; // Cờ chỉ đọc được truyền từ URL

// Định nghĩa ID của đối tượng cần tác động (mặc định là chính mình)
const targetId = viewUserId || currentUser.id;

// Chế độ chỉ đọc được kích hoạt nếu có tham số readonly=true, 
// hoặc khi Admin xem hồ sơ của một user khác không phải chính mình.
const readonly = isReadonly || (currentUser.role === 'admin' && viewUserId && parseInt(viewUserId) !== currentUser.id);
const isAdminPage = window.location.pathname.includes('/Admin/'); // Kiểm tra xem có đang ở trang của Admin không

// ── Cấu hình tên dự án trên Sidebar ───────────────────────────────────────────
const projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
const projectId = sessionStorage.getItem('projectId');
const sideEl = document.getElementById('sideProjectName');
if (sideEl) sideEl.textContent = projectName;

// Nếu admin đang xem hồ sơ của một người dùng khác -> Chuyển thanh điều hướng bên trái (sidebar) sang phiên bản Admin
if (currentUser.role === 'admin' && viewUserId) {
    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
        // Nếu đang ở thư mục User, các liên kết tới trang Admin cần có tiền tố "../Admin/"
        const prefix = window.location.pathname.includes('/User/') ? '../Admin/' : '';
        nav.innerHTML = `
            <h2 class="sidebar-title" id="sideProjectName" style="margin-bottom:16px;padding:0 16px;">${projectName}</h2>
            <a href="${prefix}dashboard.html" class="nav-item"><i class="fa-solid fa-house"></i><span>Trang chủ</span></a>
            <a href="${prefix}ManagerUser.html" class="nav-item active"><i class="fa-solid fa-users"></i><span>Quản lý người dùng</span></a>
            <a href="${prefix}setting.html" class="nav-item"><i class="fa-solid fa-gear"></i><span>Cài đặt</span></a>`;
    }
    const exitLink = document.querySelector('.sidebar-bottom .exit-nav');
    if (exitLink) {
        const prefix = window.location.pathname.includes('/User/') ? '../Admin/' : '';
        exitLink.href = prefix + 'ManagerProject.html';
    }
}

// Hàm gọi API tải thông tin chi tiết dự án để cập nhật ảnh logo dự án lên sidebar
async function loadSidebarProject() {
    if (!projectId) return;
    try {
        const res = await fetch(BASE_URL + '/projects/' + projectId, { headers: { Authorization: 'Bearer ' + getToken() } });
        if (!res.ok) return;
        const p = await res.json();
        const logo = document.getElementById('sideProjectLogo');
        const text = document.getElementById('sideProjectText');
        if (logo && p.cover_image) {
            logo.src = p.cover_image; logo.style.display = 'block';
            if (text) text.style.display = 'none';
        }
        if (sideEl) sideEl.textContent = p.name || projectName;
    } catch (e) { }
}

// ── Đồng bộ ảnh đại diện trên thanh topnav ─────────────────────────────────────
// Cập nhật ảnh đại diện ở góc phải trên cùng (topnav) hoặc tạo avatar chứa chữ cái đầu (initials) nếu chưa có ảnh
function updateTopnavAvatar(avatarUrl, username) {
    const img = document.getElementById('topnavAvatar');
    const initials = (username || currentUser.username || 'NL').substring(0, 2).toUpperCase();
    if (img) {
        if (avatarUrl) {
            img.src = avatarUrl;
            img.style.display = 'block';
            const span = document.getElementById('topnavInitials');
            if (span) span.style.display = 'none';
        } else {
            img.style.display = 'none';
            let span = document.getElementById('topnavInitials');
            if (!span) {
                span = document.createElement('span');
                span.id = 'topnavInitials';
                span.style.cssText = 'width:36px;height:36px;border-radius:50%;background:#EEF2FF;color:#4F46E5;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif';
                span.onclick = function () { window.location.href = isAdminPage ? '../User/Profile.html' : 'Profile.html'; };
                img.parentNode.insertBefore(span, img.nextSibling);
            }
            span.textContent = initials;
            span.style.display = 'flex';
        }
    }
}

// Khởi tạo ảnh đại diện trên thanh topnav từ thông tin người dùng lưu trong localStorage
updateTopnavAvatar(currentUser.avatar_url, currentUser.username);

// ── Tương tác Sidebar (Thu gọn/Mở rộng) ──────────────────────────────────────────
const toggleBtn = document.getElementById('toggleSidebar');
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('mainWrapper').classList.toggle('expanded');
    });
}

// ── Xử lý định dạng cho Date Picker ──────────────────────────────────────────────
function initDatePicker() {
    const input = document.getElementById('pBirthDate');
    if (!input) return;
    // Chuyển loại input thành "date" để hiển thị hộp chọn ngày mặc định của trình duyệt
    input.type = 'date';
    input.style.cursor = 'pointer';
    // Chuyển đổi định dạng lưu trữ DB (DD/MM/YYYY) về dạng input chấp nhận (YYYY-MM-DD) khi load trang
    if (input.value && input.value.includes('/')) {
        const parts = input.value.split('/');
        if (parts.length === 3) {
            input.value = parts[2] + '-' + parts[1] + '-' + parts[0];
        }
    }
}

// ── Tải thông tin người dùng từ backend ──────────────────────────────────────────
async function loadProfile() {
    try {
        const res = await fetch(BASE_URL + '/users/' + targetId, {
            headers: { Authorization: 'Bearer ' + getToken() }
        });
        if (!res.ok) throw new Error();
        const user = await res.json();
        fillForm(user);
    } catch (e) {
        fillForm(currentUser); // Dự phòng sử dụng thông tin lưu ở local nếu tải lỗi
    }
    if (readonly) setReadonly();
}

// Hàm điền thông tin người dùng vào các trường nhập liệu tương ứng trên giao diện
function fillForm(user) {
    document.getElementById('pFullName').value = user.full_name || '';
    document.getElementById('pEmail').value = user.email || '';
    document.getElementById('pGender').value = user.gender || 'Nam';
    
    // Xử lý ngày sinh (birth_date) lưu trong DB sang định dạng YYYY-MM-DD cho input[type="date"]
    if (user.birth_date) {
        const bd = user.birth_date;
        if (bd.includes('/')) {
            const p = bd.split('/');
            document.getElementById('pBirthDate').value = p.length === 3 ? p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0') : '';
        } else {
            document.getElementById('pBirthDate').value = bd;
        }
    } else {
        document.getElementById('pBirthDate').value = '';
    }
    
    document.getElementById('pPhone').value = user.phone || '';
    document.getElementById('pAddress').value = user.address || '';
    
    // Hiển thị ảnh đại diện hoặc tạo logo chữ initials kích thước lớn
    const preview = document.querySelector('.avatar-preview');
    if (user.avatar_url) {
        if (preview) preview.src = user.avatar_url;
    } else {
        const container = document.querySelector('.avatar-preview-container');
        if (container && preview) {
            preview.style.display = 'none';
            let initDiv = container.querySelector('.avatar-initials-big');
            if (!initDiv) {
                initDiv = document.createElement('div');
                initDiv.className = 'avatar-initials-big';
                initDiv.style.cssText = 'width:100px;height:100px;border-radius:50%;background:#EEF2FF;color:#4F46E5;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;font-family:Inter,sans-serif;margin:0 auto';
                container.appendChild(initDiv);
            }
            initDiv.textContent = (user.username || 'NL').substring(0, 2).toUpperCase();
        }
    }
    // Chỉ cập nhật ảnh đại diện trên thanh topnav khi người dùng đang xem trang cá nhân của chính mình
    if (parseInt(targetId) === currentUser.id) {
        updateTopnavAvatar(user.avatar_url, user.username);
    }
}

// Hàm vô hiệu hóa form và ẩn các nút khi truy cập ở chế độ Chỉ đọc
function setReadonly() {
    ['pFullName', 'pEmail', 'pGender', 'pBirthDate', 'pPhone', 'pAddress'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) { el.disabled = true; el.style.background = '#F8FAFC'; el.style.color = '#94A3B8'; }
    });
    const btnSave = document.querySelector('.btn-save');
    const btnPhoto = document.querySelector('.btn-change-photo');
    if (btnSave) btnSave.style.display = 'none';
    if (btnPhoto) btnPhoto.style.display = 'none';

    // Ẩn nút "Đổi mật khẩu" (chỉ dành cho chính chủ chỉnh sửa thông tin)
    const btnChangePass = document.querySelector('[onclick*="modalChangePass"]');
    if (btnChangePass) btnChangePass.style.display = 'none';

    // Nếu admin đang xem thông tin người dùng khác -> Chèn thêm nút "Đặt lại mật khẩu"
    const isAdminViewingUser = currentUser.role === 'admin' && viewUserId && parseInt(viewUserId) !== currentUser.id;
    if (isAdminViewingUser) {
        const formFooter = document.querySelector('.form-footer');
        if (formFooter) {
            const btnReset = document.createElement('button');
            btnReset.type = 'button';
            btnReset.innerHTML = '<i class="fa-solid fa-key"></i> Đặt lại mật khẩu';
            btnReset.style.cssText = 'height:40px;padding:0 20px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:8px';
            btnReset.onclick = adminResetUserPassword;
            formFooter.appendChild(btnReset);
        }
    }

    // Banner thông báo chế độ xem
    const notice = document.createElement('div');
    notice.style.cssText = 'background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:10px 14px;font-size:13px;color:#C2410C;margin-bottom:16px;display:flex;align-items:center;gap:8px;font-family:Inter,sans-serif';
    notice.innerHTML = '<i class="fa-solid fa-eye"></i> Chế độ xem — không thể chỉnh sửa thông tin người dùng khác';
    const formSection = document.querySelector('.form-section');
    if (formSection) formSection.prepend(notice);
}

// Hàm kích hoạt gửi email đặt lại mật khẩu của tài khoản đang xem (chỉ dành cho Admin)
async function adminResetUserPassword() {
    const userEmail = document.getElementById('pEmail')?.value;
    const userName = document.getElementById('pFullName')?.value || 'người dùng';
    if (!userEmail) {
        showToast('Tài khoản này chưa có email, không thể đặt lại mật khẩu', 'error');
        return;
    }

    showConfirm(
        `Gửi link đặt lại mật khẩu đến email <strong>${userEmail}</strong> của <strong>${userName}</strong>?`,
        async function () {
            try {
                await fetch(BASE_URL + '/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail })
                });
                showToast(`Đã gửi link đặt lại mật khẩu đến ${userEmail}`, 'success');
            } catch (e) {
                showToast('Lỗi kết nối', 'error');
            }
        },
        { title: 'Đặt lại mật khẩu', confirmText: 'Gửi link', type: 'warning' }
    );
}

// ── Lưu thông tin hồ sơ thay đổi ───────────────────────────────────────────────
const btnSave = document.querySelector('.btn-save');
if (btnSave) {
    btnSave.addEventListener('click', async function () {
        // Chuyển đổi ngược định dạng ngày sinh từ YYYY-MM-DD về dạng lưu trữ DB DD/MM/YYYY
        let birthDate = document.getElementById('pBirthDate').value.trim();
        if (birthDate && birthDate.includes('-') && !birthDate.includes('/')) {
            const p = birthDate.split('-');
            if (p.length === 3) birthDate = p[2] + '/' + p[1] + '/' + p[0];
        }
        const body = {
            full_name: document.getElementById('pFullName').value.trim(),
            email: document.getElementById('pEmail').value.trim(),
            gender: document.getElementById('pGender').value,
            birth_date: birthDate,
            phone: document.getElementById('pPhone').value.trim(),
            address: document.getElementById('pAddress').value.trim(),
        };
        btnSave.disabled = true; btnSave.textContent = 'Đang lưu...';
        try {
            const res = await fetch(BASE_URL + '/users/' + targetId, {
                method: 'PUT',
                headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                showToast('Đã lưu thông tin', 'success');
                // Nếu tự cập nhật hồ sơ của chính mình, đồng bộ lại dữ liệu vào localStorage
                if (parseInt(targetId) === currentUser.id) {
                    Object.assign(currentUser, body);
                    localStorage.setItem('current_user', JSON.stringify(currentUser));
                }
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi lưu', 'error');
            }
        } catch (e) { showToast('Lỗi kết nối', 'error'); }
        finally { btnSave.disabled = false; btnSave.textContent = 'Lưu thay đổi'; }
    });
}

// ── Tải lên ảnh đại diện ────────────────────────────────────────────────────────
const btnPhoto = document.querySelector('.btn-change-photo');
if (btnPhoto) {
    btnPhoto.addEventListener('click', function () {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = async function () {
            const file = input.files[0];
            if (!file) return;
            const fd = new FormData(); fd.append('file', file);
            try {
                // Tải file ảnh lên server
                const res = await fetch(BASE_URL + '/users/upload-avatar', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + getToken() },
                    body: fd
                });
                if (res.ok) {
                    const data = await res.json();
                    
                    // Cập nhật hiển thị ảnh xem trước
                    const preview = document.querySelector('.avatar-preview');
                    if (preview) { preview.src = data.url; preview.style.display = 'block'; }
                    const initDiv = document.querySelector('.avatar-initials-big');
                    if (initDiv) initDiv.style.display = 'none';
                    
                    // Lưu URL ảnh đại diện mới vào cơ sở dữ liệu người dùng
                    await fetch(BASE_URL + '/users/' + targetId, {
                        method: 'PUT',
                        headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ avatar_url: data.url })
                    });
                    
                    // Đồng bộ lại vào localStorage và cập nhật ảnh đại diện trên thanh topnav
                    if (parseInt(targetId) === currentUser.id) {
                        currentUser.avatar_url = data.url;
                        localStorage.setItem('current_user', JSON.stringify(currentUser));
                        updateTopnavAvatar(data.url, currentUser.username);
                    }
                    showToast('Đã cập nhật ảnh đại diện', 'success');
                }
            } catch (e) { showToast('Lỗi tải ảnh', 'error'); }
        };
        input.click();
    });
}

// Hàm hiển thị thông báo Toast nhanh góc màn hình
function showToast(msg, type) {
    const colors = { success: '#10B981', error: '#EF4444' };
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:20px;right:20px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:' + (colors[type] || '#2563EB') + ';box-shadow:0 4px 16px rgba(0,0,0,0.2);font-family:Inter,sans-serif';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
}

// Khởi chạy các hàm ban đầu
loadSidebarProject();
loadProfile();
