const BASE_URL = 'http://localhost:8000/api';
function getToken() { return localStorage.getItem('access_token'); }

// Auth guard
const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
if (!getToken() || currentUser.role !== 'user') {
    window.location.href = '../login.html';
}

// Project context
const projectId = sessionStorage.getItem('projectId');
const projectName = sessionStorage.getItem('projectName') || 'Dashboard';
if (!projectId) window.location.href = 'ManagerProject.html';

const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) sideProjectNameEl.textContent = projectName;

// Sidebar toggle
const toggleBtn = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
    });
}

// Load sidebar project info
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

function updateSlider(sliderId, valueId, divisor) {
    const val = document.getElementById(sliderId).value;
    document.getElementById(valueId).textContent = (val / divisor).toFixed(2);
}

function loadSettings() {
    const aiThreshold = parseFloat(localStorage.getItem('ai_threshold') || '0.25');
    document.getElementById('aiThreshold').value = Math.round(aiThreshold * 100);
    document.getElementById('aiThresholdVal').textContent = aiThreshold.toFixed(2);
}

function saveSettings() {
    const aiThreshold = document.getElementById('aiThreshold').value / 100;
    localStorage.setItem('ai_threshold', aiThreshold.toString());

    const badge = document.getElementById('savedBadge');
    badge.classList.add('show');
    setTimeout(() => badge.classList.remove('show'), 2500);
}

function resetSettings() {
    document.getElementById('aiThreshold').value = 25;
    document.getElementById('aiThresholdVal').textContent = '0.25';
}

loadSidebarProject();
loadSettings();
