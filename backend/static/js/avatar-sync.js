// avatar-sync.js — load avatar từ localStorage vào topnav
(function() {
    var cu = JSON.parse(localStorage.getItem('current_user') || '{}');
    var profileHref = 'Profile.html';

    // ── Xử lý img avatar (dashboard, setting, ManagerProject, FrameList...) ──
    var avatarImgs = document.querySelectorAll(
        '.topnav-right .avatar, .topnav-right .avatar-nav, #topnavAvatar, .nav-right img.avatar, .nav-right img.user-avatar'
    );
    avatarImgs.forEach(function(img) {
        img.style.cursor = 'pointer';
        img.onclick = function() { window.location.href = profileHref; };
        if (cu.avatar_url) {
            img.src = cu.avatar_url;
            img.style.display = '';
        }
        // Nếu không có avatar_url thì giữ ảnh mặc định, không cần initials vì img đã có src
    });

    // ── Xử lý div#userAvatar (Label.html, Label_Review.html) ──
    var divAvatar = document.getElementById('userAvatar');
    if (divAvatar && divAvatar.tagName === 'DIV') {
        divAvatar.style.cursor = 'pointer';
        divAvatar.onclick = function() { window.location.href = profileHref; };
        if (cu.avatar_url) {
            // Đổi div thành img
            var img = document.createElement('img');
            img.src = cu.avatar_url;
            img.alt = 'Avatar';
            img.style.cssText = divAvatar.style.cssText + ';width:36px;height:36px;border-radius:50%;object-fit:cover;cursor:pointer;';
            img.className = divAvatar.className;
            img.id = divAvatar.id;
            img.onclick = function() { window.location.href = profileHref; };
            divAvatar.parentNode.replaceChild(img, divAvatar);
        } else if (cu.username) {
            divAvatar.textContent = cu.username.substring(0, 2).toUpperCase();
        }
    }
})();
