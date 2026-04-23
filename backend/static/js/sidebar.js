// sidebar.js — inject sidebar vào trang, tự detect role và active nav
(function () {
    var cu = JSON.parse(localStorage.getItem('current_user') || '{}');
    var isAdmin = cu.role === 'admin';
    var path = window.location.pathname;
    var isInAdmin = path.includes('/Admin/');
    var isInUser  = path.includes('/User/');

    var base = isInAdmin ? '' : (isInUser ? '../Admin/' : '');
    var userBase = isInUser ? '' : (isInAdmin ? '../User/' : 'User/');
    var page = path.split('/').pop() || '';

    var adminItems = [
        { href: base + 'dashboard.html',    id: 'nav-dashboard', icon: 'fa-house',  label: 'Trang chủ',           match: 'dashboard.html' },
        { href: base + 'ManagerUser.html',  id: 'nav-users',     icon: 'fa-users',  label: 'Quản lý người dùng',  match: 'ManagerUser.html' },
        { href: base + 'setting.html',      id: 'nav-settings',  icon: 'fa-gear',   label: 'Cài đặt',             match: 'setting.html' },
    ];
    var userItems = [
        { href: userBase + 'dashboard.html', id: 'nav-dashboard', icon: 'fa-house',  label: 'Trang chủ', match: 'dashboard.html' },
        { href: userBase + 'setting.html',   id: 'nav-settings',  icon: 'fa-gear',   label: 'Cài đặt',   match: 'setting.html' },
    ];
    var items = isAdmin ? adminItems : userItems;
    var exitHref = isAdmin ? base + 'ManagerProject.html' : userBase + 'ManagerProject.html';

    var navHTML = items.map(function (item) {
        var active = page === item.match ? ' active' : '';
        return '<a href="' + item.href + '" class="nav-item' + active + '" id="' + item.id + '">' +
            '<i class="fa-solid ' + item.icon + '"></i><span>' + item.label + '</span></a>';
    }).join('');

    // Nút hamburger sẽ được inject vào topnav-brand
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

    // Load cache trước khi inject HTML
    var projectId = sessionStorage.getItem('projectId');

    // Nếu không có projectId (chưa vào dự án) → không inject sidebar
    if (!projectId) {
        // Reset margin-left để layout không bị lệch
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

    var badgeHTML = '';
    if (cachedProject && cachedProject.cover_image) {
        badgeHTML = '<img id="sideProjectLogo" src="' + cachedProject.cover_image + '" style="width:100%;height:100%;object-fit:cover">';
    } else {
        badgeHTML = '<div id="sideProjectText" style="display:flex;flex-direction:column;align-items:center">' +
            '<span class="badge-t1">PROJECT</span><span class="badge-t2">NULABEL</span></div>' +
            '<img id="sideProjectLogo" src="" style="width:100%;height:100%;object-fit:cover;display:none">';
    }

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

    var container = document.getElementById('sidebar-container');
    if (container) container.outerHTML = sidebarHTML;
    else {
        var wrapper = document.getElementById('mainWrapper');
        if (wrapper) wrapper.insertAdjacentHTML('afterbegin', sidebarHTML);
    }

    // Attach toggle ngay sau khi inject (không dùng DOMContentLoaded vì có thể đã fire)
    function initSidebar() {
        var toggle = document.getElementById('toggleSidebar');
        var sidebar = document.getElementById('sidebar');
        var wrapper = document.getElementById('mainWrapper');

        // Khôi phục trạng thái collapsed
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

        // Fetch project info background
        if (projectId) {
            var token = localStorage.getItem('access_token');
            fetch('http://localhost:8000/api/projects/' + projectId, {
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

    // Khi nhấn nút Back/Forward của trình duyệt → kiểm tra nếu về ManagerProject thì clear project
    window.addEventListener('popstate', function () {
        var dest = window.location.pathname;
        if (dest.includes('ManagerProject')) {
            sessionStorage.removeItem('projectId');
            sessionStorage.removeItem('projectName');
        }
    });

    // Inject hamburger vào topnav-brand
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
