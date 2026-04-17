// ============= CONFIG =============
const BASE_URL = '/api';
function getToken() { return localStorage.getItem('access_token'); }

// Auth guard
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'admin') {
    window.location.href = '../login.html';
}

// Project context
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Dashboard';
if (!projectId) window.location.href = 'ManagerProject.html';

// Set project name in sidebar
const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) sideProjectNameEl.textContent = projectName;

// ============= SIDEBAR TOGGLE =============
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
const toggleBtn = document.getElementById('toggleSidebar');

if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
    });
}

// ============= LOAD SIDEBAR PROJECT INFO =============
async function loadSidebarProject() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) return;
        const project = await res.json();
        if (project.cover_image) {
            const logo = document.getElementById('sideProjectLogo');
            logo.src = project.cover_image;
            logo.style.display = 'block';
            document.getElementById('sideProjectText').style.display = 'none';
        }
        document.getElementById('sideProjectName').textContent = project.name || projectName;
    } catch (e) { /* silent */ }
}

// ============= SLIDER =============
function updateSlider(sliderId, valueId, divisor) {
    const val = document.getElementById(sliderId).value;
    document.getElementById(valueId).textContent = (val / divisor).toFixed(2);
}

// ============= LOAD SETTINGS =============
function loadSettings() {
    const aiThreshold = parseFloat(localStorage.getItem('ai_threshold') || '0.25');
    document.getElementById('aiThreshold').value = Math.round(aiThreshold * 100);
    document.getElementById('aiThresholdVal').textContent = aiThreshold.toFixed(2);
}

// ============= SAVE SETTINGS =============
function saveSettings() {
    const aiThreshold = document.getElementById('aiThreshold').value / 100;
    localStorage.setItem('ai_threshold', aiThreshold.toString());

    const badge = document.getElementById('savedBadge');
    badge.classList.add('show');
    setTimeout(() => badge.classList.remove('show'), 2500);
}

// ============= RESET SETTINGS =============
function resetSettings() {
    document.getElementById('aiThreshold').value = 25;
    document.getElementById('aiThresholdVal').textContent = '0.25';
}

// ============= EXPORT PROJECT =============
async function exportProject() {
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';

    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/export`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || 'Lỗi xuất file. Vui lòng thử lại.');
            return;
        }

        // Tải file về
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nulabel_export_project_${projectId}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('Lỗi kết nối server');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-download"></i> Xuất file';
    }
}

// ============= INIT =============
loadSidebarProject();
loadSettings();
