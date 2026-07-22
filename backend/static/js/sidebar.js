// sidebar.js — Inject sidebar tự động vào trang, tự động nhận diện vai trò (role) và làm nổi bật (active) liên kết điều hướng tương ứng.
(function () {
    // Đọc thông tin người dùng từ localStorage
    var cu = JSON.parse(localStorage.getItem('current_user') || '{}');
    var isAdmin = cu.role === 'admin'; // Kiểm tra xem có phải là Admin hay không
    var path = window.location.pathname;
    var isInAdmin = path.includes('/Admin/');
    var isInUser  = path.includes('/User/');

    // Thiết lập đường dẫn cơ sở dựa trên vị trí thư mục hiện tại để tránh lỗi đường dẫn tương đối
    var base = isInAdmin ? '' : (isInUser ? '../Admin/' : '');
    var userBase = isInUser ? '' : (isInAdmin ? '../User/' : 'User/');
    var page = path.split('/').pop() || ''; // Tên trang hiện tại (ví dụ: dashboard.html)

    // Khai báo các mục điều hướng dành cho Admin
    var adminItems = [
        { href: base + 'dashboard.html',    id: 'nav-dashboard', icon: 'fa-house',  label: 'Trang chủ',           match: 'dashboard.html' },
        { href: base + 'ManagerUser.html',  id: 'nav-users',     icon: 'fa-users',  label: 'Quản lý người dùng',  match: 'ManagerUser.html' },
        { href: base + 'setting.html',      id: 'nav-settings',  icon: 'fa-gear',   label: 'Cài đặt',             match: 'setting.html' },
    ];
    
    // Khai báo các mục điều hướng dành cho User (Labeler / Reviewer)
    var userItems = [
        { href: userBase + 'dashboard.html', id: 'nav-dashboard', icon: 'fa-house',  label: 'Trang chủ', match: 'dashboard.html' },
        { href: userBase + 'setting.html',   id: 'nav-settings',  icon: 'fa-gear',   label: 'Cài đặt',   match: 'setting.html' },
    ];
    
    // Chọn danh sách các mục hiển thị tương ứng với vai trò của người dùng hiện tại
    var items = isAdmin ? adminItems : userItems;
    var exitHref = isAdmin ? base + 'ManagerProject.html' : userBase + 'ManagerProject.html';

    // Dựng mã HTML cho các mục menu
    var navHTML = items.map(function (item) {
        var active = page === item.match ? ' active' : '';
        return '<a href="' + item.href + '" class="nav-item' + active + '" id="' + item.id + '">' +
            '<i class="fa-solid ' + item.icon + '"></i><span>' + item.label + '</span></a>';
    }).join('');

    // Dựng mã HTML cho nút hamburger dùng để thu gọn/mở rộng sidebar, chèn trực tiếp trên thanh điều hướng topnav
    var hamburgerBtn = '<button onclick="(function(){' +
        'var sb=document.getElementById(\'sidebar\');' +
        'var mw=document.getElementById(\'mainWrapper\');' +
        'if(sb){sb.classList.toggle(\'collapsed\');' +
        'if(mw)mw.classList.toggle(\'expanded\');' +
        'sessionStorage.setItem(\'sidebarCollapsed\',sb.classList.contains(\'collapsed\')?\'1\':\'0\');}' +
        '})()" ' +
        'id="btnToggleSidebar" ' +
        'style="background:none;border:none;cursor:pointer;padding:6px 8px;border-radius:8px;color:#64748B;font-size:18px;display:flex;align-items:center;transition:all 0.2s;margin-right:8px" ' +
        'onmouseover="this.style.background=\'#F1F5F9\';this.style.color=\'#2563EB\'" ' +
        'onmouseout="this.style.background=\'none\';this.style.color=\'#64748B\'" ' +
        'title="Thu gọn / Mở rộng sidebar">' +
        '<i class="fa-solid fa-bars"></i>' +
        '</button>';

    // Đọc mã ID dự án hiện tại từ sessionStorage
    var projectId = sessionStorage.getItem('projectId');

    // Nếu không tồn tại projectId (người dùng đang ở ngoài trang chọn dự án) -> không thực hiện tạo sidebar
    if (!projectId) {
        // Hàm reset lại lề trái để nội dung trang dàn đều 100% màn hình
        function resetMargin() {
            var mw = document.getElementById('mainWrapper');
            if (mw) {
                mw.style.setProperty('margin-left', '0', 'important');
                mw.style.setProperty('width', '100%', 'important');
            }
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resetMargin);
        else resetMargin();
        return;
    }
    
    var projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
    var cachedProject = null;
    try { cachedProject = JSON.parse(sessionStorage.getItem('projectInfo_' + projectId) || 'null'); } catch(e) {}

    // Dựng mã HTML logo hoặc chữ đại diện dự án trên đầu sidebar
    var badgeHTML = '';
    if (cachedProject && cachedProject.cover_image) {
        badgeHTML = '<img id="sideProjectLogo" src="' + cachedProject.cover_image + '" style="width:100%;height:100%;object-fit:cover">';
    } else {
        badgeHTML = '<div id="sideProjectText" style="display:flex;flex-direction:column;align-items:center">' +
            '<span class="badge-t1">PROJECT</span><span class="badge-t2">NULABEL</span></div>' +
            '<img id="sideProjectLogo" src="" style="width:100%;height:100%;object-fit:cover;display:none">';
    }

    // Dựng mã cấu trúc hoàn chỉnh của sidebar
    var sidebarHTML =
        '<aside class="sidebar" id="sidebar">' +
            '<div class="sidebar-top">' +
                '<div class="sidebar-badge" id="sideProjectBadge">' + badgeHTML + '</div>' +
            '</div>' +
            '<nav class="sidebar-nav" style="padding-top:24px">' +
                '<h2 class="sidebar-title" id="sideProjectName" style="margin-bottom:16px;padding:0 16px">' +
                    (cachedProject ? cachedProject.name : projectName) +
                '</h2>' +
                navHTML +
            '</nav>' +
            '<div class="sidebar-bottom">' +
                '<a href="' + exitHref + '" class="nav-item exit-nav" onclick="sessionStorage.removeItem(\'projectId\');sessionStorage.removeItem(\'projectName\');">' +
                    '<i class="fa-solid fa-arrow-right-from-bracket"></i><span>Thoát dự án</span>' +
                '</a>' +
            '</div>' +
        '</aside>';

    // Thực hiện inject HTML sidebar vào vùng chứa container tương ứng
    var container = document.getElementById('sidebar-container');
    if (container) container.outerHTML = sidebarHTML;
    else {
        var wrapper = document.getElementById('mainWrapper');
        if (wrapper) wrapper.insertAdjacentHTML('afterbegin', sidebarHTML);
    }

    // Hàm khởi tạo và bắt các sự kiện liên quan đến Sidebar
    function initSidebar() {
        var toggle = document.getElementById('toggleSidebar');
        var sidebar = document.getElementById('sidebar');
        var wrapper = document.getElementById('mainWrapper');

        // Khôi phục trạng thái thu gọn (collapsed) của sidebar từ cache sessionStorage
        if (sessionStorage.getItem('sidebarCollapsed') === '1') {
            if (sidebar) sidebar.classList.add('collapsed');
            if (wrapper) wrapper.classList.add('expanded');
        }

        if (toggle) {
            toggle.addEventListener('click', function () {
                var sb = document.getElementById('sidebar');
                var mw = document.getElementById('mainWrapper');
                if (sb) sb.classList.toggle('collapsed');
                if (mw) mw.classList.toggle('expanded');
                sessionStorage.setItem('sidebarCollapsed',
                    document.getElementById('sidebar')?.classList.contains('collapsed') ? '1' : '0');
            });
        }

        // Chạy ngầm việc fetch cập nhật thông tin dự án mới nhất từ backend
        if (projectId) {
            var token = localStorage.getItem('access_token');
            fetch('/api/projects/' + projectId, {
                headers: { Authorization: 'Bearer ' + token }
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (p) {
                if (!p) return;
                try { sessionStorage.setItem('projectInfo_' + projectId, JSON.stringify(p)); } catch(e) {}
                var nameEl = document.getElementById('sideProjectName');
                if (nameEl && p.name && nameEl.textContent !== p.name) nameEl.textContent = p.name;
                if (p.cover_image) {
                    var logo = document.getElementById('sideProjectLogo');
                    var text = document.getElementById('sideProjectText');
                    if (logo && logo.getAttribute('src') !== p.cover_image) {
                        logo.src = p.cover_image;
                        logo.style.display = 'block';
                        if (text) text.style.display = 'none';
                    }
                }
            }).catch(function () {});
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }

    // Xử lý sự kiện khi nhấn nút Back/Forward của trình duyệt, tự động dọn dẹp biến dự án nếu quay về trang ManagerProject
    window.addEventListener('popstate', function () {
        var dest = window.location.pathname;
        if (dest.includes('ManagerProject')) {
            sessionStorage.removeItem('projectId');
            sessionStorage.removeItem('projectName');
        }
    });

    // Tự động chèn thêm nút hamburger vào góc trái của thanh topnav
    function injectHamburger() {
        var brand = document.querySelector('.topnav-brand, .nav-brand-wrap');
        if (brand && !document.getElementById('btnToggleSidebar')) {
            brand.insertAdjacentHTML('afterbegin', hamburgerBtn);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectHamburger);
    } else {
        injectHamburger();
    }
})();
