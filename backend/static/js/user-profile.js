const BASE_URL = '/api';
        function getToken() { return localStorage.getItem('access_token'); }
        const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
        if (!getToken()) window.location.href = '../login.html';

        const params = new URLSearchParams(window.location.search);
        const viewUserId = params.get('userId');
        const isReadonly = params.get('readonly') === 'true';
        const targetId = viewUserId || currentUser.id;
        const readonly = isReadonly || (currentUser.role === 'admin' && viewUserId && parseInt(viewUserId) !== currentUser.id);

        const projectName = sessionStorage.getItem('projectName') || 'Dashboard';
        const sideEl = document.getElementById('sideProjectName');
        if (sideEl) sideEl.textContent = projectName;

        // Load topnav avatar from localStorage
        const topnavAvatar = document.getElementById('topnavAvatar');
        if (topnavAvatar && currentUser.avatar_url) {
            topnavAvatar.src = currentUser.avatar_url;
        }

        document.getElementById('toggleSidebar').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
            document.getElementById('mainWrapper').classList.toggle('expanded');
        });

        async function loadProfile() {
            try {
                const res = await fetch(BASE_URL + '/users/' + targetId, {
                    headers: { Authorization: 'Bearer ' + getToken() }
                });
                if (!res.ok) throw new Error();
                const user = await res.json();
                fillForm(user);
            } catch(e) {
                fillForm(currentUser);
            }
            if (readonly) setReadonly();
        }

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

        function setReadonly() {
            ['pFullName','pEmail','pGender','pBirthDate','pPhone','pAddress'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) { el.disabled = true; el.style.background = '#F8FAFC'; el.style.color = '#94A3B8'; }
            });
            document.querySelector('.btn-save').style.display = 'none';
            document.querySelector('.btn-change-photo').style.display = 'none';
            var notice = document.createElement('div');
            notice.style.cssText = 'background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:10px 14px;font-size:13px;color:#C2410C;margin-bottom:16px;display:flex;align-items:center;gap:8px;font-family:Inter,sans-serif';
            notice.innerHTML = '<i class="fa-solid fa-eye"></i> Chế độ xem — không thể chỉnh sửa thông tin người dùng khác';
            document.querySelector('.form-section').prepend(notice);
        }

        document.querySelector('.btn-save').addEventListener('click', async function() {
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
                var res = await fetch(BASE_URL + '/users/' + targetId, {
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
                    var err = await res.json();
                    showToast(err.detail || 'Lỗi lưu', 'error');
                }
            } catch(e) { showToast('Lỗi kết nối', 'error'); }
            finally { btn.disabled = false; btn.textContent = 'Lưu thay đổi'; }
        });

        document.querySelector('.btn-change-photo').addEventListener('click', function() {
            var input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = async function() {
                var file = input.files[0];
                if (!file) return;
                var fd = new FormData(); fd.append('file', file);
                try {
                    var res = await fetch(BASE_URL + '/users/upload-avatar', {
                        method: 'POST',
                        headers: { Authorization: 'Bearer ' + getToken() },
                        body: fd
                    });
                    if (res.ok) {
                        var data = await res.json();
                        document.querySelector('.avatar-preview').src = data.url;
                        await fetch(BASE_URL + '/users/' + targetId, {
                            method: 'PUT',
                            headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ avatar_url: data.url })
                        });
                        // Sync to localStorage and topnav
                        if (parseInt(targetId) === currentUser.id) {
                            currentUser.avatar_url = data.url;
                            localStorage.setItem('current_user', JSON.stringify(currentUser));
                            if (topnavAvatar) topnavAvatar.src = data.url;
                        }
                        showToast('Đã cập nhật ảnh đại diện', 'success');
                    }
                } catch(e) { showToast('Lỗi tải ảnh', 'error'); }
            };
            input.click();
        });

        function showToast(msg, type) {
            var colors = { success: '#10B981', error: '#EF4444' };
            var t = document.createElement('div');
            t.style.cssText = 'position:fixed;top:20px;right:20px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;z-index:9999;background:' + (colors[type]||'#2563EB') + ';box-shadow:0 4px 16px rgba(0,0,0,0.2);font-family:Inter,sans-serif';
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(function() { t.remove(); }, 3000);
        }

        loadProfile();