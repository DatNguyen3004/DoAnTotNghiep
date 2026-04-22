// avatar-sync.js — load avatar từ localStorage vào topnav
(function() {
    var BASE_URL = 'http://localhost:8000';
    var cu = JSON.parse(localStorage.getItem('current_user') || '{}');

    // Tự detect đường dẫn Profile dựa vào vị trí file hiện tại
    var path = window.location.pathname;
    var profileHref = path.includes('/Admin/') ? 'Profile.html' : 'Profile.html';

    function resolveAvatarUrl(url) {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return BASE_URL + (url.startsWith('/') ? '' : '/') + url;
    }

    function makeInitialsEl(username, onclick) {
        var d = document.createElement('div');
        d.style.cssText = 'width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-family:Inter,sans-serif';
        d.textContent = (username || 'NL').substring(0, 2).toUpperCase();
        d.onclick = onclick;
        return d;
    }

    function applyAvatar() {
        var avatarUrl = resolveAvatarUrl(cu.avatar_url);
        var goProfile = function() { window.location.href = profileHref; };

        // ── Xử lý img avatar (topnav-right .avatar, #topnavAvatar) ──
        var avatarImgs = document.querySelectorAll(
            '.topnav-right .avatar, .topnav-right .avatar-nav, #topnavAvatar, .nav-right img.avatar, .nav-right img.user-avatar'
        );
        avatarImgs.forEach(function(img) {
            img.style.cursor = 'pointer';
            if (!img.onclick) img.onclick = goProfile;
            if (avatarUrl) {
                img.src = avatarUrl;
                img.onerror = function() {
                    var d = makeInitialsEl(cu.username, goProfile);
                    img.parentNode.replaceChild(d, img);
                };
            } else {
                var d = makeInitialsEl(cu.username, goProfile);
                img.parentNode.replaceChild(d, img);
            }
        });

        // ── Xử lý div#userAvatar (Label.html, Label_Review.html) ──
        var divAvatar = document.getElementById('userAvatar');
        if (divAvatar && divAvatar.tagName === 'DIV') {
            divAvatar.style.cursor = 'pointer';
            divAvatar.onclick = goProfile;
            if (avatarUrl) {
                var img = document.createElement('img');
                img.src = avatarUrl;
                img.alt = 'Avatar';
                img.id = 'userAvatar';
                img.style.cssText = 'width:36px;height:36px;border-radius:50%;object-fit:cover;cursor:pointer;';
                img.onclick = goProfile;
                img.onerror = function() {
                    var d = makeInitialsEl(cu.username, goProfile);
                    d.id = 'userAvatar';
                    img.parentNode.replaceChild(d, img);
                };
                divAvatar.parentNode.replaceChild(img, divAvatar);
            } else {
                divAvatar.textContent = (cu.username || 'NL').substring(0, 2).toUpperCase();
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyAvatar);
    } else {
        applyAvatar();
    }
})();
