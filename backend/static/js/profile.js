// ============= PROFILE JS (dùng chung cho Admin/Profile.html và User/Profile.html) =============
const BASE_URL = '/api';
function getToken() { return localStorage.getItem('access_token'); }
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken()) window.location.href = '../login.html';

const params = new URLSearchParams(window.location.search);
const viewUserId = params.get('userId');
const isReadonly = params.get('readonly') === 'true';
const targetId = viewUserId || currentUser.id;
const readonly = isReadonly || (currentUser.role === 'admin' && viewUserId && parseInt(viewUserId) !== currentUser.id);
const isAdminPage = window.location.pathname.includes('/Admin/');

// ── Sidebar project name ──────────────────────────────────────────────────────
const projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
const projectId = sessionStorage.getItem('projectId');
const sideEl = document.getElementById('sideProjectName');
if (sideEl) sideEl.textContent = projectName;

// Nếu admin xem user → sửa sidebar thành sidebar admin
if (currentUser.role === 'admin' && viewUserId) {
    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
        // User/Profile.html → links tới Admin pages cần ../Admin/
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

// Load sidebar project logo
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

// ── Topnav avatar: ảnh hoặc initials ─────────────────────────────────────────
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

// Init topnav avatar from localStorage
updateTopnavAvatar(currentUser.avatar_url, currentUser.username);

// ── Sidebar toggle ────────────────────────────────────────────────────────────
const toggleBtn = document.getElementById('toggleSidebar');
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('mainWrapper').classList.toggle('expanded');
    });
}

// ── Date picker ───────────────────────────────────────────────────────────────
function initDatePicker() {
    const input = document.getElementById('pBirthDate');
    if (!input) return;
    // Đổi sang type="date" để browser hiện native date picker
    input.type = 'date';
    input.style.cursor = 'pointer';
    // Convert DD/MM/YYYY → YYYY-MM-DD khi load
    if (input.value && input.value.includes('/')) {
        const parts = input.value.split('/');
        if (parts.length === 3) {
            input.value = parts[2] + '-' + parts[1] + '-' + parts[0];
        }
    }
}

// ── Load profile ──────────────────────────────────────────────────────────────
async function loadProfile() {
    try {
        const res = await fetch(BASE_URL + '/users/' + targetId, {
            headers: { Authorization: 'Bearer ' + getToken() }
        });
        if (!res.ok) throw new Error();
        const user = await res.json();
        fillForm(user);
    } catch (e) {
        fillForm(currentUser);
    }
    if (readonly) setReadonly();
}

function fillForm(user) {
    document.getElementById('pFullName').value = user.full_name || '';
    document.getElementById('pEmail').value = user.email || '';
    document.getElementById('pGender').value = user.gender || 'Nam';
    // birth_date: lưu dạng YYYY-MM-DD cho input[type="date"]
    if (user.birth_date) {
        const bd = user.birth_date;
        if (bd.includes('/')) {
            const p = bd.split('/');
            // DD/MM/YYYY → YYYY-MM-DD
            document.getElementById('pBirthDate').value = p.length === 3 ? p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0') : '';
        } else {
            document.getElementById('pBirthDate').value = bd;
        }
    } else {
        document.getElementById('pBirthDate').value = '';
    }
    document.getElementById('pPhone').value = user.phone || '';
    document.getElementById('pAddress').value = user.address || '';
    // Avatar: ảnh hoặc initials
    const preview = document.querySelector('.avatar-preview');
    if (user.avatar_url) {
        if (preview) preview.src = user.avatar_url;
    } else {
        // Hiển thị initials trong avatar-preview-container
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
    // Chỉ update topnav avatar khi đang xem profile của chính mình
    if (parseInt(targetId) === currentUser.id) {
        updateTopnavAvatar(user.avatar_url, user.username);
    }
}

function setReadonly() {
    ['pFullName', 'pEmail', 'pGender', 'pBirthDate', 'pPhone', 'pAddress'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) { el.disabled = true; el.style.background = '#F8FAFC'; el.style.color = '#94A3B8'; }
    });
    const btnSave = document.querySelector('.btn-save');
    const btnPhoto = document.querySelector('.btn-change-photo');
    if (btnSave) btnSave.style.display = 'none';
    if (btnPhoto) btnPhoto.style.display = 'none';

    // Ẩn nút "Đổi mật khẩu" (chỉ dành cho chính chủ)
    const btnChangePass = document.querySelector('[onclick*="modalChangePass"]');
    if (btnChangePass) btnChangePass.style.display = 'none';

    // Nếu admin đang xem user khác → thêm nút "Reset mật khẩu"
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

    const notice = document.createElement('div');
    const formSection = document.querySelector('.form-section');
    if (formSection) formSection.prepend(notice);
}

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

// ── Save ──────────────────────────────────────────────────────────────────────
const btnSave = document.querySelector('.btn-save');
if (btnSave) {
    btnSave.addEventListener('click', async function () {
        // Convert YYYY-MM-DD → DD/MM/YYYY for storage
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

// ── Upload avatar ─────────────────────────────────────────────────────────────
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
                const res = await fetch(BASE_URL + '/users/upload-avatar', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + getToken() },
                    body: fd
                });
                if (res.ok) {
                    const data = await res.json();
                    // Update preview
                    const preview = document.querySelector('.avatar-preview');
                    if (preview) { preview.src = data.url; preview.style.display = 'block'; }
                    const initDiv = document.querySelector('.avatar-initials-big');
                    if (initDiv) initDiv.style.display = 'none';
                    // Save to DB
                    await fetch(BASE_URL + '/users/' + targetId, {
                        method: 'PUT',
                        headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ avatar_url: data.url })
                    });
                    // Sync localStorage + topnav
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

function showToast(msg, type) {
    const colors = { success: '#10B981', error: '#EF4444' };
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:20px;right:20px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:' + (colors[type] || '#2563EB') + ';box-shadow:0 4px 16px rgba(0,0,0,0.2);font-family:Inter,sans-serif';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
}

loadSidebarProject();
loadProfile();
