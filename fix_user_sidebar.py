import re, os

USER_DIR = r'd:\Demo\User'

# The correct slim sidebar for User role
SIDEBAR_HTML = '''<aside class="sidebar" id="sidebar">
        <div class="sidebar-top">
            <div class="sidebar-badge">
                <span class="badge-t1">PROJECT</span>
                <span class="badge-t2">SAFE FOR WORK</span>
            </div>
            <!-- Toggle button -->
            <div class="btn-toggle-sidebar" id="toggleSidebar" title="Thu gọn / Mở rộng">
                <i class="fa-solid fa-chevron-left"></i>
            </div>
        </div>

        <nav class="sidebar-nav">
            <h2 class="sidebar-title">Thiết kế Nhận diện NuLabel</h2>
            <div class="sidebar-role">USER</div>
            <a href="dashboard.html" class="nav-item">
                <i class="fa-solid fa-house"></i>
                <span>Trang chủ</span>
            </a>
            <a href="Test.html" class="nav-item">
                <i class="fa-solid fa-clipboard-check"></i>
                <span>Kiểm thử dữ liệu</span>
            </a>
            <a href="setting.html" class="nav-item">
                <i class="fa-solid fa-gear"></i>
                <span>Cài đặt</span>
            </a>
        </nav>

        <div class="sidebar-bottom">
            <a href="ManagerProject.html" class="nav-item exit-nav">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
                <span>Thoát dự án</span>
            </a>
        </div>
    </aside>'''

# Active page mapping
ACTIVE_MAP = {
    'dashboard.html': 'dashboard.html',
    'Test.html': 'Test.html',
    'Test2.html': 'Test.html',  # Test2 is under the Test flow
    'setting.html': 'setting.html',
    'Label.html': None,  # No sidebar active state
    'Label_Review.html': None,
}

def set_active(sidebar, active_href):
    """Set the correct nav-item as active."""
    # Remove all active classes first
    sidebar = re.sub(r'(class="nav-item) active(")', r'\1\2', sidebar)
    if active_href:
        sidebar = sidebar.replace(
            f'href="{active_href}" class="nav-item"',
            f'href="{active_href}" class="nav-item active"'
        )
    return sidebar

for fname in os.listdir(USER_DIR):
    if not fname.endswith('.html'):
        continue
    fpath = os.path.join(USER_DIR, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check if file uses sidebar (Label files don't have sidebar)
    if 'sidebar-nav' not in content:
        print(f'⏭  Skipping {fname} (no sidebar)')
        continue

    # Replace sidebar HTML
    sidebar = set_active(SIDEBAR_HTML, ACTIVE_MAP.get(fname))
    content = re.sub(
        r'<!-- Sidebar -->\s*<aside class="sidebar" id="sidebar">.*?</aside>',
        '<!-- Sidebar -->\n    ' + sidebar,
        content,
        flags=re.DOTALL
    )
    # Also handle files without the <!-- Sidebar --> comment
    content = re.sub(
        r'<aside class="sidebar" id="sidebar">.*?</aside>',
        sidebar,
        content,
        flags=re.DOTALL
    )

    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'✅ {fname}')

print('\nDone!')
