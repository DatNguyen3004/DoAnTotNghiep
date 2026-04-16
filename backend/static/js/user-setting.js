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

document.addEventListener('DOMContentLoaded', () => {
    // Set project name in sidebar
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

    loadSidebarProject();
    loadSettings();
});

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
            if (logo) {
                logo.src = project.cover_image;
                logo.style.display = 'block';
                document.getElementById('sideProjectText').style.display = 'none';
            }
        }
        const nameEl = document.getElementById('sideProjectName');
        if (nameEl) nameEl.textContent = project.name || projectName;
    } catch (e) { /* silent */ }
}

function updateSlider(sliderId, valueId, divisor) {
    const el = document.getElementById(sliderId);
    const valEl = document.getElementById(valueId);
    if (el && valEl) valEl.textContent = (el.value / divisor).toFixed(2);
}

function loadSettings() {
    const aiReviewThreshold = parseFloat(localStorage.getItem('ai_review_threshold') || '0.85');
    const slider = document.getElementById('aiReviewThreshold');
    const valEl = document.getElementById('aiReviewThresholdVal');
    if (slider) slider.value = Math.round(aiReviewThreshold * 100);
    if (valEl) valEl.textContent = aiReviewThreshold.toFixed(2);
}

function saveSettings() {
    const slider = document.getElementById('aiReviewThreshold');
    if (!slider) return;
    const aiReviewThreshold = slider.value / 100;
    localStorage.setItem('ai_review_threshold', aiReviewThreshold.toString());

    const badge = document.getElementById('savedBadge');
    if (badge) {
        badge.classList.add('show');
        setTimeout(() => badge.classList.remove('show'), 2500);
    }
}

function resetSettings() {
    const slider = document.getElementById('aiReviewThreshold');
    const valEl = document.getElementById('aiReviewThresholdVal');
    if (slider) slider.value = 85;
    if (valEl) valEl.textContent = '0.85';
}
