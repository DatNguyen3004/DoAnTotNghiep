"""
Fix paths across Admin/ and User/ folders, and update login.html with role-based routing.

Accounts:
  admin / admin123 → Admin/ManagerProject.html
  user  / user123  → User/ManagerProject.html (User has no ManagerProject, so → User/dashboard.html)
"""

import os, re

ROOT = r'd:\Demo'
ADMIN_DIR = os.path.join(ROOT, 'Admin')
USER_DIR = os.path.join(ROOT, 'User')

# ──────────────────────────────────────────────
# 1. Fix login.html – role-based redirect
# ──────────────────────────────────────────────
login_path = os.path.join(ROOT, 'login.html')
with open(login_path, 'r', encoding='utf-8') as f:
    login = f.read()

old_script = """        // Form submit redirect
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault(); // Prevent standard page reload
            window.location.href = 'ManagerProject.html';
        });"""

new_script = """        // Form submit redirect with role-based routing
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;

            if (username === 'admin' && password === 'admin123') {
                window.location.href = 'Admin/ManagerProject.html';
            } else if (username === 'user' && password === 'user123') {
                window.location.href = 'User/dashboard.html';
            } else {
                alert('Tên đăng nhập hoặc mật khẩu không đúng!');
            }
        });"""

login = login.replace(old_script, new_script)
with open(login_path, 'w', encoding='utf-8') as f:
    f.write(login)
print("✅ login.html updated")

# ──────────────────────────────────────────────
# 2. Fix Admin/ – all paths are siblings (same folder)
#    ManagerProject links to Admin/ManagerProject.html etc.
# ──────────────────────────────────────────────
def fix_folder(folder, is_user=False):
    for fname in os.listdir(folder):
        if not fname.endswith('.html'):
            continue
        fpath = os.path.join(folder, fname)
        with open(fpath, 'r', encoding='utf-8') as f:
            c = f.read()

        # Logout should go to root login.html (one level up)
        c = c.replace("href='login.html'", "href='../login.html'")
        c = c.replace('href="login.html"', 'href="../login.html"')
        c = c.replace("window.location.href='login.html'", "window.location.href='../login.html'")

        # ManagerProject (exit) link – admin has it in same folder, user goes up
        if is_user:
            # User has no ManagerProject, so "Thoát dự án" → go to dashboard in User folder
            c = c.replace("href='ManagerProject.html'", "href='dashboard.html'")
            c = c.replace('href="ManagerProject.html"', 'href="dashboard.html"')
            c = c.replace("window.location.href='ManagerProject.html'", "window.location.href='dashboard.html'")
        # For admin, ManagerProject is in same folder – no change needed

        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(c)

    print(f"✅ {folder} links fixed")

fix_folder(ADMIN_DIR, is_user=False)
fix_folder(USER_DIR, is_user=True)

# ──────────────────────────────────────────────
# 3. User/dashboard.html – remove "Quản lý người dùng" sidebar link
# ──────────────────────────────────────────────
user_dash = os.path.join(USER_DIR, 'dashboard.html')
with open(user_dash, 'r', encoding='utf-8') as f:
    c = f.read()

# Remove the ManagerUser nav-item block from sidebar
c = re.sub(
    r'\s*<a href="ManagerUser\.html"[^>]*>.*?</a>',
    '',
    c,
    flags=re.DOTALL
)
with open(user_dash, 'w', encoding='utf-8') as f:
    f.write(c)
print("✅ User/dashboard.html sidebar cleaned")

# ──────────────────────────────────────────────
# 4. Copy ManagerProject.html to User/ – optional lightweight version
#    User's "Thoát" will just go to dashboard anyway.
#    BUT if User folder has no ManagerProject.html, the sidebar Thoát link breaks.
#    We already redirect it to dashboard above, so we're fine.
# ──────────────────────────────────────────────

print("\nDone! Summary:")
print("  Admin login: username=admin / password=admin123 → Admin/ManagerProject.html")
print("  User  login: username=user  / password=user123  → User/dashboard.html")
