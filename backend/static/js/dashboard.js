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
const projectName = sessionStorage.getItem('projectName') || 'Trang chủ';
if (!projectId) {
    window.location.href = 'ManagerProject.html';
}

// Set project name in sidebar
const sideProjectNameEl = document.getElementById('sideProjectName');
if (sideProjectNameEl) {
    sideProjectNameEl.textContent = projectName;
}

// Load topnav avatar from localStorage
const topnavAvatarEl = document.getElementById('topnavAvatar');
if (topnavAvatarEl && currentUser.avatar_url) {
    topnavAvatarEl.src = currentUser.avatar_url;
}

// ============= SIDEBAR TOGGLE =============
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
const toggleBtn = document.getElementById('toggleSidebar');
const floatingBar = document.getElementById('floatingBar');

if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
        if (floatingBar) floatingBar.classList.toggle('expanded-bar');
    });
}

// ============= TABS =============
function switchTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
    if (tabId === 'tab-all-tasks') {
        console.log('Loading all tasks...');
        loadAllTasks();
    }
}

// ============= STATUS HELPERS =============
const STATUS_MAP = {
    pending: { label: 'Chờ xử lý', class: 'st-pending' },
    in_progress: { label: 'Đang làm', class: 'st-in_progress' },
    submitted: { label: 'Đợi kiểm tra', class: 'st-submitted' },
    under_review: { label: 'Đang kiểm tra', class: 'st-under_review' },
    reviewed: { label: 'Đã kiểm tra', class: 'st-approved' },
    approved: { label: 'Đạt', class: 'st-approved' },
    rejected: { label: 'Chưa đạt', class: 'st-rejected' }
};

function getStatusBadge(status) {
    const info = STATUS_MAP[status] || { label: status, class: 'st-pending' };
    return `<div class="status-badge ${info.class}"><div class="status-dot"></div>${info.label}</div>`;
}

function startEvaluation(btn, taskId) {
    window.location.href = `Evaluation.html?taskId=${taskId}`;
}

function getActionLink(task) {
    const s = task.status;
    let mainLink = '';
    if (s === 'pending' || s === 'in_progress')
        mainLink = `<button disabled class="action-link review-link" style="border:none;padding:6px 10px;cursor:not-allowed;opacity:0.45;" title="Đang thực hiện gán nhãn"><i class="fa-solid fa-eye"></i></button>`;
    else if (s === 'submitted')
        mainLink = `<button disabled class="action-link review-link" style="border:none;padding:6px 10px;cursor:not-allowed;opacity:0.45;" title="Chờ reviewer kiểm tra"><i class="fa-solid fa-eye"></i></button>`;
    else if (s === 'under_review')
        mainLink = `<button disabled class="action-link review-link" style="border:none;padding:6px 10px;cursor:not-allowed;opacity:0.45;" title="Reviewer đang kiểm tra"><i class="fa-solid fa-eye"></i></button>`;
    else if (s === 'reviewed')
        mainLink = `<button onclick="startEvaluation(this, ${task.id})" class="action-link review-link" style="border:none;cursor:pointer;padding:6px 10px" title="Đánh giá chất lượng"><i class="fa-solid fa-eye"></i></button>`;
    else if (s === 'approved' || s === 'rejected')
        mainLink = `<button onclick="startEvaluation(this, ${task.id})" class="action-link success-link" style="border:none;cursor:pointer;padding:6px 10px" title="Xem chất lượng gán nhãn"><i class="fa-solid fa-eye"></i></button>`;

    const deleteBtn = `<button onclick="deleteTask(${task.id})" title="Xóa nhiệm vụ"
        style="background:none;border:none;cursor:pointer;color:#CBD5E1;font-size:15px;padding:4px 6px;margin-left:6px;transition:color 0.2s;vertical-align:middle"
        onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='#CBD5E1'">
        <i class="fa-regular fa-trash-can"></i>
    </button>`;
    return mainLink + deleteBtn;
}

function getUserCell(user) {
    if (!user) {
        return `<div class="user-cell"><div class="user-cell-initials">?</div><span class="user-cell-name unassigned">Chưa giao</span></div>`;
    }
    const initials = (user.username || '?').substring(0, 2).toUpperCase();
    const name = user.username || 'N/A';
    return `<div class="user-cell"><div class="user-cell-initials" style="background:#EEF2FF;color:#4F46E5">${initials}</div><span class="user-cell-name">${name}</span></div>`;
}

// ============= LOAD TASKS =============
let allTasks = [];
let currentAssignedPage = 1;
const assignedItemsPerPage = 5;

async function loadTasks() {
    const tbody = document.getElementById('tasksBody');
    tbody.innerHTML = `
        <tr><td colspan="6" style="text-align:center;padding:40px;">
            <div style="color:#94A3B8">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:12px;display:block"></i>
                Đang tải...
            </div>
        </td></tr>`;

    try {
        const tasksRes = await fetch(`${BASE_URL}/tasks?project_id=${projectId}&t=${Date.now()}`, { headers: { Authorization: `Bearer ${getToken()}` } });

        if (!tasksRes.ok) {
            showDemoTasks();
            return;
        }

        allTasks = await tasksRes.json();
        console.log("DEBUG - Dữ liệu nhiệm vụ nhận được:", allTasks); // Dòng này để soi lỗi
        applyAssignedPagination(true);
        updateStats(allTasks);
        if (allProjectMembers.length > 0) {
            applyMembersPagination(true);
        }
    } catch (e) {
        console.warn('Tasks API not available, showing demo data:', e);
        showDemoTasks();
    }
}

function showDemoTasks() {
    allTasks = [];
    applyAssignedPagination(true);
    updateStats(allTasks);
    if (allProjectMembers.length > 0) {
        applyMembersPagination(true);
    }
}

function toggleTaskFilterPanel() {
    const panel = document.getElementById('taskFilterPanel');
    const btn = document.getElementById('btnTaskFilterToggle');
    if (!panel || !btn) return;
    panel.classList.toggle('active');
    btn.classList.toggle('active');
}

function toggleAssigneeDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('assigneeDropdownMenu');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Close assignee dropdown when clicking outside
document.addEventListener('click', function (event) {
    const customSelect = document.getElementById('customAssigneeSelect');
    const dropdown = document.getElementById('assigneeDropdownMenu');
    if (customSelect && dropdown && !customSelect.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

function updateMultiselectPlaceholder() {
    const container = document.getElementById('assigneeDropdownMenu');
    const placeholder = document.getElementById('multiselectPlaceholder');
    if (!container || !placeholder) return;

    const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
    if (checkedBoxes.length === 0) {
        placeholder.textContent = 'Tất cả';
    } else if (checkedBoxes.length === 1) {
        const label = checkedBoxes[0].closest('label');
        placeholder.textContent = label ? label.innerText.trim() : '1 người';
    } else {
        placeholder.textContent = `Đang chọn ${checkedBoxes.length} người`;
    }
}

function resetTaskFilters() {
    if (document.getElementById('filterTaskStatus')) document.getElementById('filterTaskStatus').value = 'all';
    if (document.getElementById('filterTaskProgress')) document.getElementById('filterTaskProgress').value = 'all';
    
    const container = document.getElementById('assigneeDropdownMenu');
    if (container) {
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
    }
    
    updateMultiselectPlaceholder();
    
    if (document.getElementById('searchTasks')) document.getElementById('searchTasks').value = '';
    applyAssignedPagination(true);
}

function applyAssignedPagination(resetPage = false) {
    if (resetPage) {
        currentAssignedPage = 1;
    }

    const q = (document.getElementById('searchTasks')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('filterTaskStatus')?.value || 'all';
    const filterProgress = document.getElementById('filterTaskProgress')?.value || 'all';

    // Get checked assignee IDs
    const checkedAssigneeIds = [];
    const container = document.getElementById('assigneeDropdownMenu');
    if (container) {
        container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            checkedAssigneeIds.push(parseInt(cb.value));
        });
    }

    let filtered = allTasks.filter(t => {
        // Search by name and description and username
        const name = (t.scene_name || '').toLowerCase();
        const desc = (t.scene_description || '').toLowerCase();
        const user = (t.assigned_user?.username || '').toLowerCase();
        
        const matchesSearch = name.includes(q) || desc.includes(q) || user.includes(q);
        if (!matchesSearch) return false;

        // Filter by status
        if (filterStatus !== 'all') {
            if (t.status !== filterStatus) return false;
        }

        // Filter by progress
        if (filterProgress !== 'all') {
            const progress = t.frame_count > 0
                ? Math.round((t.annotated_frames / t.frame_count) * 100)
                : 0;
            if (filterProgress === 'range_1_50') {
                if (progress < 1 || progress > 50) return false;
            } else if (filterProgress === 'range_51_100') {
                if (progress < 51 || progress > 100) return false;
            }
        }

        // Filter by assignee
        if (checkedAssigneeIds.length > 0) {
            if (!t.assigned_user || !checkedAssigneeIds.includes(t.assigned_user.id)) return false;
        }

        return true;
    });

    // Update filter badge count
    let activeCount = 0;
    if (filterStatus !== 'all') activeCount++;
    if (filterProgress !== 'all') activeCount++;
    if (checkedAssigneeIds.length > 0) activeCount++;

    const badge = document.getElementById('taskFilterBadge');
    if (badge) {
        if (activeCount > 0) {
            badge.textContent = activeCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / assignedItemsPerPage) || 1;
    if (currentAssignedPage > totalPages) currentAssignedPage = totalPages;
    if (currentAssignedPage < 1) currentAssignedPage = 1;

    const startIndex = (currentAssignedPage - 1) * assignedItemsPerPage;
    const pageTasks = filtered.slice(startIndex, startIndex + assignedItemsPerPage);

    renderTasks(pageTasks, startIndex, totalItems);
    renderAssignedPaginationControls(totalPages);
}

function renderTasks(tasks, startIndex = 0, totalItems = 0) {
    const tbody = document.getElementById('tasksBody');

    if (!totalItems) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fa-regular fa-folder-open"></i>
                    <h3>Chưa có nhiệm vụ nào</h3>
                    <p>Nhấn "Phân công" để giao nhiệm vụ cho người thực hiện.</p>
                </div>
            </td></tr>`;

        document.getElementById('showingText').textContent = 'Không có dữ liệu';
        document.getElementById('tabBadgeTasks').textContent = 0;
        return;
    }

    tbody.innerHTML = tasks.map((task, idx) => {
        const sceneName = task.scene_name || `Nhiệm vụ #${task.scene_id || task.id}`;
        const sceneDesc = task.scene_description || '';
        const progress = task.frame_count > 0
            ? Math.round((task.annotated_frames / task.frame_count) * 100)
            : 0;
        const progressColor = progress >= 100 ? 'green' : (progress >= 50 ? 'teal' : 'blue');

        const nameHtml = task.status === 'pending'
            ? `<div style="display:flex;align-items:center;gap:6px;">${sceneName}<span style="background:#EF4444;color:#FFFFFF;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;display:inline-block;text-transform:uppercase;letter-spacing:0.5px;line-height:1.2;box-shadow:0 2px 4px rgba(239, 68, 68, 0.2);">Mới</span></div>`
            : `<div>${sceneName}</div>`;

        return `
            <tr>
                <td style="text-align:center;font-weight:600;color:#64748B">${startIndex + idx + 1}</td>
                <td>
                    <div class="scene-name">
                        <div class="scene-icon"><i class="fa-solid fa-film"></i></div>
                        <div>
                            ${nameHtml}
                            ${sceneDesc ? `<div class="scene-meta">${sceneDesc}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${getUserCell(task.assigned_user)}</td>
                <td>${getStatusBadge(task.status)}</td>
                <td>
                    <div class="progress-cell">
                        <div class="progress-bar">
                            <div class="progress-fill ${progressColor}" style="width:${progress}%"></div>
                        </div>
                        <span class="progress-text">${progress}%</span>
                    </div>
                </td>
                <td>${getActionLink(task)}</td>
            </tr>`;
    }).join('');

    document.getElementById('showingText').textContent = `Hiển thị ${startIndex + 1} - ${startIndex + tasks.length} trên tổng số ${totalItems} nhiệm vụ`;
    document.getElementById('tabBadgeTasks').textContent = totalItems;
}

function renderAssignedPaginationControls(totalPages) {
    const container = document.getElementById('pagination');
    if (!container) return;

    let html = '';
    const prevDisabled = currentAssignedPage === 1 ? 'disabled' : '';
    html += `<button class="page-btn ${prevDisabled}" onclick="${currentAssignedPage === 1 ? '' : 'changeAssignedPage(' + (currentAssignedPage - 1) + ')'}"><i class="fa-solid fa-angle-left"></i></button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentAssignedPage - 1 && i <= currentAssignedPage + 1)) {
            html += `<button class="page-btn ${i === currentAssignedPage ? 'active' : ''}" onclick="changeAssignedPage(${i})">${i}</button>`;
        } else if (i === currentAssignedPage - 2 || i === currentAssignedPage + 2) {
            html += `<span style="padding: 6px 12px; color: #64748B;">...</span>`;
        }
    }

    const nextDisabled = currentAssignedPage === totalPages ? 'disabled' : '';
    html += `<button class="page-btn ${nextDisabled}" onclick="${currentAssignedPage === totalPages ? '' : 'changeAssignedPage(' + (currentAssignedPage + 1) + ')'}"><i class="fa-solid fa-angle-right"></i></button>`;

    container.innerHTML = html;
}

function changeAssignedPage(page) {
    currentAssignedPage = page;
    applyAssignedPagination(false);
}

function updateStats(tasks) {
    const totalFrames = tasks.reduce((s, t) => s + (t.frame_count || 0), 0);
    const completedTasks = tasks.filter(t => t.status === 'approved').length;
    const needAttention = tasks.filter(t => t.status === 'rejected' || t.status === 'under_review' || t.status === 'reviewed').length;

    // Hiệu suất: tính trên các task đã hoàn thành (approved hoặc reviewed)
    const doneTasks = tasks.filter(t => (t.status === 'approved' || t.status === 'reviewed'));
    let avgTimeDisplay = 0;
    if (doneTasks.length > 0) {
        // Tổng thời gian = labeler time + reviewer time
        const totalTimeSeconds = doneTasks.reduce((s, t) => s + (t.time_spent || 0) + (t.reviewer_time_spent || 0), 0);
        if (totalTimeSeconds > 0) {
            // Tính trung bình Phút / Nhiệm vụ
            const avgMinutes = (totalTimeSeconds / doneTasks.length) / 60;
            avgTimeDisplay = Math.max(1, Math.round(avgMinutes)); // Tối thiểu 1 phút nếu có thời gian
        }
    }

    const completedPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    document.getElementById('statTotalFrames').textContent = totalFrames.toLocaleString();
    document.getElementById('statTotalScenesText').textContent = `${tasks.length} nhiệm vụ`;
    document.getElementById('statCompleted').textContent = completedTasks;
    document.getElementById('statCompletedPct').textContent = `${completedPct}%`;
    document.getElementById('statNeedAttention').textContent = needAttention;
    document.getElementById('statNeedAttentionText').textContent = needAttention > 0 ? 'Cần xử lý' : 'Tốt';
    document.getElementById('statNeedAttentionText').style.color = needAttention > 0 ? '#D97706' : '#16A34A';
    document.getElementById('statAvgTime').textContent = avgTimeDisplay;

    // AI Accuracy calculation for approved tasks
    const approvedTasksList = tasks.filter(t => t.status === 'approved');
    let avgAIAccuracy = 0;
    if (approvedTasksList.length > 0) {
        let sumAIAccuracy = 0;
        let countWithAI = 0;
        approvedTasksList.forEach(t => {
            const matched = t.ai_matched_objs || 0;
            const missing = t.ai_missing_objs || 0;
            const totalAi = matched + missing;
            if (totalAi > 0) {
                sumAIAccuracy += (matched / totalAi) * 100;
                countWithAI++;
            } else {
                sumAIAccuracy += 100;
                countWithAI++;
            }
        });
        if (countWithAI > 0) {
            avgAIAccuracy = Math.round(sumAIAccuracy / countWithAI);
        }
    }

    const aiAccuracyEl = document.getElementById('statAIAccuracy');
    const aiAccuracyUnitEl = document.getElementById('statAIAccuracyUnit');
    if (aiAccuracyEl && aiAccuracyUnitEl) {
        if (approvedTasksList.length > 0) {
            aiAccuracyEl.textContent = `${avgAIAccuracy}%`;
            aiAccuracyUnitEl.textContent = 'trung bình';
        } else {
            aiAccuracyEl.textContent = '—';
            aiAccuracyUnitEl.textContent = 'Chưa có nhiệm vụ đạt';
        }
    }

    const fp = document.getElementById('floatingProgress');
    if (fp) fp.textContent = `${completedPct}% hoàn thành`;
}

// ============= SEARCH =============
document.getElementById('searchTasks').addEventListener('input', function () {
    applyAssignedPagination(true);
});

// ============= LOAD MEMBERS =============
let allProjectMembers = [];
let allSystemUsers = [];
let currentMembersPage = 1;
const membersPerPage = 5;

function toggleMembersFilterPanel() {
    const panel = document.getElementById('membersFilterPanel');
    const btn = document.getElementById('btnMembersFilterToggle');
    if (!panel || !btn) return;
    panel.classList.toggle('active');
    btn.classList.toggle('active');
}

function resetMembersFilters() {
    if (document.getElementById('sortMembersAssigned')) document.getElementById('sortMembersAssigned').value = 'none';
    if (document.getElementById('sortMembersReviewed')) document.getElementById('sortMembersReviewed').value = 'none';
    if (document.getElementById('sortMembersEvaluated')) document.getElementById('sortMembersEvaluated').value = 'none';
    if (document.getElementById('filterMembersProgress')) document.getElementById('filterMembersProgress').value = 'all';
    if (document.getElementById('searchMembers')) document.getElementById('searchMembers').value = '';
    applyMembersPagination(true);
}

function applyMembersPagination(resetPage = false) {
    if (resetPage) {
        currentMembersPage = 1;
    }

    const q = (document.getElementById('searchMembers')?.value || '').toLowerCase();
    const sortAssigned = document.getElementById('sortMembersAssigned')?.value || 'none';
    const sortReviewed = document.getElementById('sortMembersReviewed')?.value || 'none';
    const sortEvaluated = document.getElementById('sortMembersEvaluated')?.value || 'none';
    const filterProgress = document.getElementById('filterMembersProgress')?.value || 'all';

    // Compute stats for all members in the context of the current project tasks
    const membersWithStats = allProjectMembers.map(m => {
        const userTasks = allTasks.filter(t => t.assigned_to === m.id || t.assigned_user?.id === m.id);
        const totalAssigned = userTasks.length;
        const totalReviewed = userTasks.filter(t => t.status === 'reviewed').length;
        const totalEvaluated = userTasks.filter(t => t.status === 'approved' || t.status === 'rejected').length;
        
        let avgProgress = 0;
        if (totalAssigned > 0) {
            const sumProgress = userTasks.reduce((sum, t) => {
                const p = t.frame_count > 0 ? (t.annotated_frames / t.frame_count) * 100 : 0;
                return sum + p;
            }, 0);
            avgProgress = Math.round(sumProgress / totalAssigned);
        }

        return {
            ...m,
            total_assigned: totalAssigned,
            total_reviewed: totalReviewed,
            total_evaluated: totalEvaluated,
            progress: avgProgress
        };
    });

    // Filter
    let filtered = membersWithStats.filter(m => {
        const fullName = (m.full_name || '').toLowerCase();
        const username = (m.username || '').toLowerCase();
        const matchesSearch = fullName.includes(q) || username.includes(q);
        if (!matchesSearch) return false;

        if (filterProgress !== 'all') {
            const p = m.progress;
            if (filterProgress === 'range_0_50') {
                if (p < 0 || p > 50) return false;
            } else if (filterProgress === 'range_51_100') {
                if (p < 51 || p > 100) return false;
            }
        }

        return true;
    });

    // Sort
    if (sortAssigned !== 'none') {
        filtered.sort((a, b) => sortAssigned === 'desc' ? b.total_assigned - a.total_assigned : a.total_assigned - b.total_assigned);
    } else if (sortReviewed !== 'none') {
        filtered.sort((a, b) => sortReviewed === 'desc' ? b.total_reviewed - a.total_reviewed : a.total_reviewed - b.total_reviewed);
    } else if (sortEvaluated !== 'none') {
        filtered.sort((a, b) => sortEvaluated === 'desc' ? b.total_evaluated - a.total_evaluated : a.total_evaluated - b.total_evaluated);
    }

    // Update filter badge count
    let activeCount = 0;
    if (sortAssigned !== 'none') activeCount++;
    if (sortReviewed !== 'none') activeCount++;
    if (sortEvaluated !== 'none') activeCount++;
    if (filterProgress !== 'all') activeCount++;

    const badge = document.getElementById('membersFilterBadge');
    if (badge) {
        if (activeCount > 0) {
            badge.textContent = activeCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // Set tab badge
    const tabBadge = document.getElementById('tabBadgeMembers');
    if (tabBadge) {
        tabBadge.textContent = allProjectMembers.length;
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / membersPerPage) || 1;
    if (currentMembersPage > totalPages) currentMembersPage = totalPages;
    if (currentMembersPage < 1) currentMembersPage = 1;

    const startIndex = (currentMembersPage - 1) * membersPerPage;
    const pageMembers = filtered.slice(startIndex, startIndex + membersPerPage);

    renderMembersTable(pageMembers, startIndex, totalItems);
    renderMembersPaginationControls(totalPages);
}

function renderMembersTable(members, startIndex = 0, totalItems = 0) {
    const tbody = document.getElementById('membersBody');
    if (!tbody) return;

    if (!totalItems) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#94A3B8">Không tìm thấy thành viên nào</td></tr>`;
        document.getElementById('showingMembers').textContent = '';
        return;
    }

    const colors = ['#4F46E5', '#0891B2', '#7C3AED', '#059669', '#DC2626', '#D97706'];

    tbody.innerHTML = members.map((m, idx) => {
        const initials = (m.username || '?').substring(0, 2).toUpperCase();
        const color = colors[idx % colors.length];
        const bgColor = color + '15';
        
        const avatarHtml = m.avatar_url
            ? `<img src="${m.avatar_url}" alt="${m.username}" class="user-avatar" style="object-fit:cover;border-radius:50%;width:36px;height:36px;flex-shrink:0;">`
            : `<div class="user-avatar" style="background:${bgColor};color:${color}">${initials}</div>`;

        const name = m.full_name || m.username;

        const roleBadge = m.role === 'admin'
            ? '<span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;margin-left:6px">Admin</span>'
            : '';

        const removeBtn = m.role !== 'admin'
            ? `<button onclick="removeMember(${m.id}, '${m.username}')" class="btn-action btn-delete" title="Xóa khỏi dự án" style="background:none;border:none;cursor:pointer;color:#CBD5E1;font-size:16px;padding:4px;transition:color 0.2s">
                <i class="fa-regular fa-trash-can"></i>
               </button>`
            : `<span style="color:#94A3B8;font-size:12px">-</span>`;

        // Quality column value
        let qualityHtml = `<span style="color:#94A3B8;font-size:12px">—</span>`;
        if (m.role !== 'admin') {
            if (m.total_assigned === 0 || m.quality_rate === null || m.quality_rate === undefined) {
                qualityHtml = `<span style="color:#94A3B8;font-size:12px">Chưa đánh giá</span>`;
            } else {
                const rate = m.quality_rate;
                const color = rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444';
                const label = rate >= 80 ? 'Tốt' : rate >= 50 ? 'Trung bình' : 'Cần cải thiện';
                qualityHtml = `
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
                        <div style="font-size:13px;font-weight:700;color:${color}">${rate}%</div>
                        <div style="font-size:10px;color:${color};font-weight:600;white-space:nowrap">${label}</div>
                    </div>`;
            }
        }

        return `
            <tr>
                <td style="text-align:center;font-weight:600;color:#64748B">${startIndex + idx + 1}</td>
                <td style="text-align:center;">${avatarHtml}</td>
                <td>
                    <div class="user-info">
                        <div>
                            <span class="user-name">${name}${roleBadge}</span>
                            <span class="user-role">@${m.username}</span>
                        </div>
                    </div>
                </td>
                <td style="text-align:center;font-weight:600;color:#1E293B">${m.total_assigned}</td>
                <td style="text-align:center;font-weight:600;color:#1E293B">${m.total_reviewed}</td>
                <td style="text-align:center;font-weight:600;color:#1E293B">${m.total_evaluated}</td>
                <td style="text-align:center;">${qualityHtml}</td>
                <td style="text-align:center;">
                    <div class="progress-cell" style="justify-content: center;">
                        <div class="progress-bar">
                            <div class="progress-fill ${m.progress >= 100 ? 'green' : (m.progress >= 50 ? 'teal' : 'blue')}" style="width:${m.progress}%"></div>
                        </div>
                        <span class="progress-text">${m.progress}%</span>
                    </div>
                </td>
                <td style="text-align:center;">${removeBtn}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('showingMembers').textContent = `Hiển thị ${startIndex + 1} - ${startIndex + members.length} trên tổng số ${totalItems} thành viên`;
}

function renderMembersPaginationControls(totalPages) {
    const container = document.getElementById('membersPagination');
    if (!container) return;

    let html = '';
    const prevDisabled = currentMembersPage === 1 ? 'disabled' : '';
    html += `<button class="page-btn ${prevDisabled}" onclick="${currentMembersPage === 1 ? '' : 'changeMembersPage(' + (currentMembersPage - 1) + ')'}"><i class="fa-solid fa-angle-left"></i></button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentMembersPage - 1 && i <= currentMembersPage + 1)) {
            html += `<button class="page-btn ${i === currentMembersPage ? 'active' : ''}" onclick="changeMembersPage(${i})">${i}</button>`;
        } else if (i === currentMembersPage - 2 || i === currentMembersPage + 2) {
            html += `<span style="padding: 6px 12px; color: #64748B;">...</span>`;
        }
    }

    const nextDisabled = currentMembersPage === totalPages ? 'disabled' : '';
    html += `<button class="page-btn ${nextDisabled}" onclick="${currentMembersPage === totalPages ? '' : 'changeMembersPage(' + (currentMembersPage + 1) + ')'}"><i class="fa-solid fa-angle-right"></i></button>`;

    container.innerHTML = html;
}

function changeMembersPage(page) {
    currentMembersPage = page;
    applyMembersPagination(false);
}

// Hook searchMembers input event listener
setTimeout(() => {
    const searchMembersEl = document.getElementById('searchMembers');
    if (searchMembersEl) {
        searchMembersEl.addEventListener('input', function () {
            applyMembersPagination(true);
        });
    }
}, 100);

async function loadMembers() {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) {
            allProjectMembers = [];
            applyMembersPagination(true);
            populateAssigneeFilterCheckboxes([]);
            return;
        }
        const rawMembers = await res.json();

        // Parallel pre-fetching of stats/quality for all members in the current project
        const memberPromises = rawMembers.map(async (m) => {
            if (m.role === 'admin') {
                m.quality_rate = null;
                return m;
            }
            try {
                const statsRes = await fetch(`${BASE_URL}/users/${m.id}/stats?project_id=${projectId}`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                });
                if (statsRes.ok) {
                    const s = await statsRes.json();
                    m.quality_rate = s.quality_rate;
                } else {
                    m.quality_rate = null;
                }
            } catch (e) {
                m.quality_rate = null;
            }
            return m;
        });

        allProjectMembers = await Promise.all(memberPromises);
        applyMembersPagination(true);
        populateAssigneeFilterCheckboxes(allProjectMembers.filter(m => m.role === 'user'));
    } catch (e) {
        allProjectMembers = [];
        applyMembersPagination(true);
        populateAssigneeFilterCheckboxes([]);
    }
}

function populateAssigneeFilterCheckboxes(members) {
    const container = document.getElementById('assigneeDropdownMenu');
    if (!container) return;
    
    // Remember currently checked user IDs to restore them
    const checkedIds = new Set();
    container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        checkedIds.add(parseInt(cb.value));
    });

    if (!members || !members.length) {
        container.innerHTML = `<span style="font-size:12px;color:#94A3B8;padding:8px;">Không có thành viên</span>`;
        return;
    }

    container.innerHTML = members.map(m => {
        const isChecked = checkedIds.has(m.id) ? 'checked' : '';
        const displayName = m.full_name || m.username;
        return `
            <label class="multiselect-item" onclick="event.stopPropagation()">
                <input type="checkbox" value="${m.id}" ${isChecked} onchange="updateMultiselectPlaceholder(); applyAssignedPagination(true);" style="cursor: pointer; width: 14px; height: 14px; margin: 0;">
                ${displayName}
            </label>
        `;
    }).join('');

    updateMultiselectPlaceholder();
}

// ============= LOAD SIDEBAR PROJECT =============
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

// ============= ASSIGN MODAL =============
let availableScenes = [];
let availableLabelers = [];

async function openAssignModal() {
    document.getElementById('assignModal').classList.add('active');
    await loadAssignData();
}

function closeAssignModal() {
    document.getElementById('assignModal').classList.remove('active');
    document.querySelectorAll('.custom-search-select').forEach(el => el.classList.remove('active'));
}

document.getElementById('assignModal').addEventListener('click', function (e) {
    if (e.target === this) closeAssignModal();
});

/* ============= CUSTOM SEARCHABLE SELECT FUNCTIONS ============= */
function toggleSearchSelect(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    
    document.querySelectorAll('.custom-search-select').forEach(other => {
        if (other.id !== containerId) {
            other.classList.remove('active');
        }
    });
    
    el.classList.toggle('active');
    
    if (el.classList.contains('active')) {
        const input = el.querySelector('.select-search-box input');
        if (input) {
            input.value = '';
            input.focus();
            filterSearchSelect(containerId, '');
        }
    }
}

function filterSearchSelect(containerId, query) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const q = query.toLowerCase().trim();
    const options = el.querySelectorAll('.select-option');
    options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        if (text.includes(q)) {
            opt.style.display = 'flex';
        } else {
            opt.style.display = 'none';
        }
    });
}

function selectSearchOption(containerId, value, labelText) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let targetSelectId = '';
    let triggerTextId = '';
    if (containerId === 'searchSelectScene') {
        targetSelectId = 'selectScene';
        triggerTextId = 'selectedSceneText';
    } else if (containerId === 'searchSelectLabeler') {
        targetSelectId = 'selectLabeler';
        triggerTextId = 'selectedLabelerText';
    }
    
    const hiddenSelect = document.getElementById(targetSelectId);
    if (hiddenSelect) {
        hiddenSelect.value = value;
        hiddenSelect.dispatchEvent(new Event('change'));
    }
    
    const triggerText = document.getElementById(triggerTextId);
    if (triggerText) {
        triggerText.textContent = labelText;
    }
    
    container.querySelectorAll('.select-option').forEach(opt => {
        if (opt.getAttribute('data-value') === String(value)) {
            opt.classList.add('selected');
        } else {
            opt.classList.remove('selected');
        }
    });
    
    container.classList.remove('active');
}

// Close searchable select dropdowns when clicking outside
document.addEventListener('click', function (e) {
    document.querySelectorAll('.custom-search-select').forEach(el => {
        if (!el.contains(e.target)) {
            el.classList.remove('active');
        }
    });
});

async function loadAssignData() {
    // Load scenes chưa có task
    try {
        const sceneRes = await fetch(`${BASE_URL}/projects/${projectId}/scenes`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (sceneRes.ok) {
            const allScenesData = await sceneRes.json();
            const assignedSceneIds = new Set(allTasks.map(t => t.scene_id).filter(Boolean));
            availableScenes = allScenesData.filter(s => !assignedSceneIds.has(s.id));

            const select = document.getElementById('selectScene');
            const sceneList = document.getElementById('sceneOptionsList');
            const selectedSceneText = document.getElementById('selectedSceneText');
            
            if (selectedSceneText) selectedSceneText.textContent = '-- Chọn nhiệm vụ --';
            
            if (availableScenes.length === 0) {
                select.innerHTML = '<option value="" disabled>Tất cả nhiệm vụ đã được phân công</option>';
                if (sceneList) {
                    sceneList.innerHTML = `<div style="padding: 12px; text-align: center; color: #94A3B8; font-size: 13px;">Tất cả nhiệm vụ đã được phân công</div>`;
                }
                document.getElementById('sceneHelper').textContent = 'Tất cả nhiệm vụ đã được phân công!';
            } else {
                select.innerHTML = '<option value="">-- Chọn nhiệm vụ --</option>';
                let listHtml = '';
                availableScenes.forEach(s => {
                    const name = s.name || s.scene_token || `Nhiệm vụ #${s.id}`;
                    const desc = s.description ? ` — ${s.description}` : '';
                    const frames = s.frame_count ? ` (${s.frame_count} khung hình)` : '';
                    select.innerHTML += `<option value="${s.id}">${name}${desc}${frames}</option>`;
                    
                    listHtml += `
                        <div class="select-option" data-value="${s.id}" onclick="selectSearchOption('searchSelectScene', ${s.id}, '${name}')">
                            <span style="font-weight: 600; color: #334155;">${name}</span>
                            <span class="option-meta">${s.frame_count ? s.frame_count + ' khung hình' : '0 khung hình'}${s.description ? ' • ' + s.description : ''}</span>
                        </div>
                    `;
                });
                if (sceneList) sceneList.innerHTML = listHtml;
                document.getElementById('sceneHelper').textContent = `${availableScenes.length} nhiệm vụ chưa phân công`;
            }
        } else {
            document.getElementById('sceneHelper').textContent = 'Không thể tải danh sách nhiệm vụ';
        }
    } catch (e) {
        document.getElementById('sceneHelper').textContent = 'Lỗi tải nhiệm vụ';
    }

    // Load labelers — members của project có role=user
    try {
        const memberRes = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (memberRes.ok) {
            const members = await memberRes.json();
            availableLabelers = members.filter(u => u.role === 'user');
            const select = document.getElementById('selectLabeler');
            const labelerList = document.getElementById('labelerOptionsList');
            const selectedLabelerText = document.getElementById('selectedLabelerText');
            
            if (selectedLabelerText) selectedLabelerText.textContent = '-- Chọn người thực hiện --';
            
            select.innerHTML = '<option value="">-- Chọn người thực hiện --</option>';
            let listHtml = '';
            availableLabelers.forEach(u => {
                const label = u.full_name ? `${u.username} (${u.full_name})` : u.username;
                const displayName = u.full_name || u.username;
                select.innerHTML += `<option value="${u.id}">${label}</option>`;
                
                listHtml += `
                    <div class="select-option" data-value="${u.id}" onclick="selectSearchOption('searchSelectLabeler', ${u.id}, '${displayName}')">
                        <span style="font-weight: 600; color: #334155;">${displayName}</span>
                        <span class="option-meta">@${u.username} • ${u.email || ''}</span>
                    </div>
                `;
            });
            if (labelerList) labelerList.innerHTML = listHtml;
        }
    } catch (e) { console.error('Load members failed:', e); }
}

async function submitAssign() {
    const sceneId = document.getElementById('selectScene').value;
    const labelerId = document.getElementById('selectLabeler').value;

    if (!sceneId || !labelerId) {
        showToast('Vui lòng chọn nhiệm vụ và người thực hiện', 'error');
        return;
    }

    const btn = document.getElementById('btnSubmitAssign');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const res = await fetch(`${BASE_URL}/tasks`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_id: parseInt(projectId),
                scene_id: parseInt(sceneId),
                assigned_to: parseInt(labelerId)
            })
        });

        if (res.ok) {
            showToast('Đã phân công thành công!', 'success');
            closeAssignModal();
            loadTasks();
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi phân công', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối server', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Phân công';
    }
}

// ============= ADD MEMBER MODAL =============
async function openAddMemberModal() {
    document.getElementById('addMemberModal').classList.add('active');
    document.getElementById('memberSearchInput').value = '';

    try {
        const res = await fetch(`${BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (res.ok) allSystemUsers = await res.json();
    } catch (e) { allSystemUsers = []; }

    renderUserPickerList(allSystemUsers);
}

function closeAddMemberModal() {
    document.getElementById('addMemberModal').classList.remove('active');
}

document.getElementById('addMemberModal').addEventListener('click', function (e) {
    if (e.target === this) closeAddMemberModal();
});

function filterUserList(q) {
    const filtered = allSystemUsers.filter(u => {
        const name = (u.full_name || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        return name.includes(q.toLowerCase()) || username.includes(q.toLowerCase());
    });
    renderUserPickerList(filtered);
}

function renderUserPickerList(users) {
    const list = document.getElementById('userPickerList');
    const memberIds = new Set(allProjectMembers.map(m => m.id));
    const available = users.filter(u => !memberIds.has(u.id) && u.role !== 'admin');

    document.getElementById('memberPickerHelper').textContent =
        `${available.length} người dùng chưa trong dự án`;

    if (!available.length) {
        list.innerHTML = `<div style="text-align:center;padding:32px;color:#94A3B8;font-size:14px">
            <i class="fa-solid fa-users" style="font-size:28px;display:block;margin-bottom:8px;color:#CBD5E1"></i>
            Tất cả người dùng đã trong dự án
        </div>`;
        return;
    }

    const colors = ['#4F46E5', '#0891B2', '#7C3AED', '#059669', '#DC2626', '#D97706'];
    list.innerHTML = available.map((u, i) => {
        const initials = (u.username || '?').substring(0, 2).toUpperCase();
        const color = colors[i % colors.length];
        return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #F1F5F9;transition:background 0.15s"
                 onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background=''">
                <div style="width:36px;height:36px;border-radius:10px;background:${color}15;color:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${initials}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:14px;color:#1E293B">${u.full_name || u.username}</div>
                    <div style="font-size:12px;color:#94A3B8">@${u.username}</div>
                </div>
                <button onclick="addMember(${u.id}, '${(u.full_name || u.username).replace(/'/g, "\\'")}')"
                    style="padding:6px 16px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap"
                    onmouseover="this.style.background='#1D4ED8'" onmouseout="this.style.background='#2563EB'">
                    <i class="fa-solid fa-plus"></i> Thêm
                </button>
            </div>`;
    }).join('');
}

async function addMember(userId, name) {
    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });

        if (res.ok) {
            showToast(`Đã thêm "${name}" vào dự án`, 'success');
            await loadMembers();
            renderUserPickerList(allSystemUsers);
        } else {
            const err = await res.json();
            showToast(err.detail || 'Lỗi thêm thành viên', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối server', 'error');
    }
}

async function removeMember(userId, username) {
    showConfirm(`Xóa "${username}" khỏi dự án?`, async () => {
        try {
            const res = await fetch(`${BASE_URL}/projects/${projectId}/members/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                showToast(`Đã xóa "${username}" khỏi dự án`, 'success');
                loadMembers();
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi xóa thành viên', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    }, { title: 'Xóa thành viên', confirmText: 'Xóa', type: 'danger' });
}

// ============= DELETE TASK =============
async function deleteTask(taskId) {
    showConfirm('Xóa nhiệm vụ này? Toàn bộ file nhãn sẽ bị xóa theo.', async () => {
        try {
            const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                showToast('Đã xóa nhiệm vụ', 'success');
                loadTasks();
            } else {
                const err = await res.json();
                showToast(err.detail || 'Lỗi xóa nhiệm vụ', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    }, { title: 'Xóa nhiệm vụ', confirmText: 'Xóa', type: 'danger' });
}

// ============= ALL TASKS TAB =============
let allScenes = [];
let currentAllScenesPage = 1;
const allScenesItemsPerPage = 5;

async function loadAllTasks() {
    const tbody = document.getElementById('allTasksBody');
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </td></tr>`;

    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/scenes?t=${Date.now()}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        allScenes = await res.json();

        applyAllScenesPagination(true);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:#EF4444">Không thể tải dữ liệu</td></tr>`;
    }
}

function toggleAllTasksFilterPanel() {
    const panel = document.getElementById('allTasksFilterPanel');
    const btn = document.getElementById('btnAllTasksFilterToggle');
    if (!panel || !btn) return;
    panel.classList.toggle('active');
    btn.classList.toggle('active');
}

function resetAllTasksFilters() {
    if (document.getElementById('filterAllTasksTime')) document.getElementById('filterAllTasksTime').value = 'all';
    if (document.getElementById('filterAllTasksFrames')) document.getElementById('filterAllTasksFrames').value = 'all';
    if (document.getElementById('sortAllTasksFrames')) document.getElementById('sortAllTasksFrames').value = 'none';
    if (document.getElementById('filterAllTasksStatus')) document.getElementById('filterAllTasksStatus').value = 'all';
    if (document.getElementById('searchAllTasks')) document.getElementById('searchAllTasks').value = '';
    applyAllScenesPagination(true);
}

function applyAllScenesPagination(resetPage = false) {
    if (resetPage) {
        currentAllScenesPage = 1;
    }

    const q = (document.getElementById('searchAllTasks')?.value || '').toLowerCase();
    const filterTime = document.getElementById('filterAllTasksTime')?.value || 'all';
    const filterFrames = document.getElementById('filterAllTasksFrames')?.value || 'all';
    const sortFrames = document.getElementById('sortAllTasksFrames')?.value || 'none';
    const filterStatus = document.getElementById('filterAllTasksStatus')?.value || 'all';

    const assignedSceneIds = new Set((allTasks || []).map(t => t.scene_id));

    let filtered = allScenes.filter(s => {
        // Search by name and description
        const name = (s.name || s.scene_token || '').toLowerCase();
        const desc = (s.description || '').toLowerCase();
        
        const matchesSearch = name.includes(q) || desc.includes(q);
        if (!matchesSearch) return false;

        // Filter by first frame's timestamp (nuScenes timestamp is in microseconds)
        if (filterTime !== 'all' && s.first_frame_timestamp) {
            const date = new Date(s.first_frame_timestamp / 1000);
            const hour = date.getHours();
            const minute = date.getMinutes();
            const timeInMins = hour * 60 + minute;
            
            if (filterTime === 'morning') {
                // Morning: 1h -> 11h59 (60 mins to 719 mins)
                if (timeInMins < 60 || timeInMins >= 720) return false;
            } else if (filterTime === 'afternoon') {
                // Afternoon: 12h -> 17h59 (720 mins to 1079 mins)
                if (timeInMins < 720 || timeInMins >= 1080) return false;
            } else if (filterTime === 'evening') {
                // Evening: 18h -> 0h59 (1080 mins to 1439 mins OR 0 mins to 59 mins)
                if (timeInMins >= 60 && timeInMins < 1080) return false;
            }
        }

        // Filter by frame count
        if (filterFrames !== 'all') {
            const fc = s.frame_count || 0;
            if (filterFrames === 'range_1_50') {
                if (fc < 1 || fc > 50) return false;
            } else if (filterFrames === 'range_51_100') {
                if (fc < 51 || fc > 100) return false;
            } else if (filterFrames === 'range_gt_100') {
                if (fc <= 100) return false;
            }
        }

        // Filter by status
        if (filterStatus !== 'all') {
            const isAssigned = assignedSceneIds.has(s.id);
            if (filterStatus === 'assigned' && !isAssigned) return false;
            if (filterStatus === 'unassigned' && isAssigned) return false;
        }

        return true;
    });

    // Sort by frame count
    if (sortFrames !== 'none') {
        filtered.sort((a, b) => {
            const aFc = a.frame_count || 0;
            const bFc = b.frame_count || 0;
            if (sortFrames === 'desc') {
                return bFc - aFc;
            } else {
                return aFc - bFc;
            }
        });
    }

    // Update filter badge count
    let activeCount = 0;
    if (filterTime !== 'all') activeCount++;
    if (filterFrames !== 'all') activeCount++;
    if (sortFrames !== 'none') activeCount++;
    if (filterStatus !== 'all') activeCount++;

    const badge = document.getElementById('allTasksFilterBadge');
    if (badge) {
        if (activeCount > 0) {
            badge.textContent = activeCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / allScenesItemsPerPage) || 1;
    if (currentAllScenesPage > totalPages) currentAllScenesPage = totalPages;
    if (currentAllScenesPage < 1) currentAllScenesPage = 1;

    const startIndex = (currentAllScenesPage - 1) * allScenesItemsPerPage;
    const pageScenes = filtered.slice(startIndex, startIndex + allScenesItemsPerPage);

    renderAllScenesTable(pageScenes, startIndex, totalItems);
    renderAllScenesPaginationControls(totalPages);
}

// Hook search input event listener
setTimeout(() => {
    const searchAllTasksEl = document.getElementById('searchAllTasks');
    if (searchAllTasksEl) {
        searchAllTasksEl.addEventListener('input', function () {
            applyAllScenesPagination(true);
        });
    }
}, 100);

function renderAllScenesTable(scenes, startIndex = 0, totalItems = 0) {
    const tbody = document.getElementById('allTasksBody');
    if (!totalItems) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#94A3B8">Chưa có nhiệm vụ nào</td></tr>`;
        document.getElementById('showingAllTasks').textContent = '';
        return;
    }

    const assignedSceneIds = new Set((allTasks || []).map(t => t.scene_id));

    tbody.innerHTML = scenes.map((scene, idx) => {
        const name = scene.name || scene.scene_token || `Nhiệm vụ #${scene.id}`;
        const desc = scene.description || '—';
        const isAssigned = assignedSceneIds.has(scene.id);
        const statusHtml = isAssigned
            ? `<span class="status-badge st-approved"><span class="status-dot"></span>Đã giao</span>`
            : `<span class="status-badge st-pending"><span class="status-dot"></span>Chưa giao</span>`;

        return `<tr>
            <td style="text-align:center;font-weight:600;color:#64748B">${startIndex + idx + 1}</td>
            <td>
                <div class="scene-name">
                    <div class="scene-icon"><i class="fa-solid fa-film"></i></div>
                    <div>
                        <div>${name}</div>
                        <div class="scene-meta">${desc}</div>
                    </div>
                </div>
            </td>
            <td style="text-align:center;"><span style="font-size:12px;color:#64748B">${scene.frame_count || 0} khung hình</span></td>
            <td style="text-align:center;">${statusHtml}</td>
            <td style="text-align:center;">
                <button onclick='openSceneEditModal({scene_id:${scene.id},scene_name:"${(name).replace(/"/g, '\\"')}",scene_description:"${(scene.description || '').replace(/"/g, '\\"')}",_previewSceneId:${scene.id}})'
                    class="action-link" style="font-size:12px">
                    <i class="fa-solid fa-pen"></i> Sửa tên
                </button>
            </td>
        </tr>`;
    }).join('');

    document.getElementById('showingAllTasks').textContent = `Hiển thị ${startIndex + 1} - ${startIndex + scenes.length} trên tổng số ${totalItems} nhiệm vụ`;
}

function renderAllScenesPaginationControls(totalPages) {
    const container = document.getElementById('allTasksPagination');
    if (!container) return;

    let html = '';
    const prevDisabled = currentAllScenesPage === 1 ? 'disabled' : '';
    html += `<button class="page-btn ${prevDisabled}" onclick="${currentAllScenesPage === 1 ? '' : 'changeAllScenesPage(' + (currentAllScenesPage - 1) + ')'}"><i class="fa-solid fa-angle-left"></i></button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentAllScenesPage - 1 && i <= currentAllScenesPage + 1)) {
            html += `<button class="page-btn ${i === currentAllScenesPage ? 'active' : ''}" onclick="changeAllScenesPage(${i})">${i}</button>`;
        } else if (i === currentAllScenesPage - 2 || i === currentAllScenesPage + 2) {
            html += `<span style="padding: 6px 12px; color: #64748B;">...</span>`;
        }
    }

    const nextDisabled = currentAllScenesPage === totalPages ? 'disabled' : '';
    html += `<button class="page-btn ${nextDisabled}" onclick="${currentAllScenesPage === totalPages ? '' : 'changeAllScenesPage(' + (currentAllScenesPage + 1) + ')'}"><i class="fa-solid fa-angle-right"></i></button>`;

    container.innerHTML = html;
}

function changeAllScenesPage(page) {
    currentAllScenesPage = page;
    applyAllScenesPagination(false);
}

// ============= SCENE EDIT MODAL =============
let allScenesData = [];

async function loadAllScenes() {
    const grid = document.getElementById('scenesGrid');
    console.log('loadAllScenes called, grid:', grid, 'projectId:', projectId);
    if (!grid) return;
    if (!projectId) {
        grid.innerHTML = `<div style="grid-column:1/-1;color:#EF4444;padding:24px">Không có projectId</div>`;
        return;
    }
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94A3B8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px"></i>Đang tải...
    </div>`;

    try {
        const res = await fetch(`${BASE_URL}/projects/${projectId}/scenes?t=${Date.now()}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error();
        allScenesData = await res.json();
        renderScenesGrid(allScenesData);
    } catch (e) {
        grid.innerHTML = `<div style="grid-column:1/-1;color:#EF4444;padding:24px">Không thể tải danh sách nhiệm vụ</div>`;
    }
}

function renderScenesGrid(scenes) {
    const grid = document.getElementById('scenesGrid');
    if (!scenes.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94A3B8">Chưa có nhiệm vụ nào</div>`;
        return;
    }
    grid.innerHTML = scenes.map(scene => `
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;transition:box-shadow 0.2s"
             onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow=''">
            <div style="height:140px;background:#0F172A;position:relative;cursor:pointer" onclick="openSceneEditModal({scene_id:${scene.id},scene_name:'${(scene.name || '').replace(/'/g, "\\'")}',scene_description:'${(scene.description || '').replace(/'/g, "\\'")}',_previewSceneId:${scene.id}})">
                <img id="sceneThumb_${scene.id}" src="" alt="${scene.name}"
                    style="width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity 0.3s">
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#475569;font-size:12px" id="sceneThumbLoading_${scene.id}">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                </div>
            </div>
            <div style="padding:14px">
                <div style="font-size:14px;font-weight:700;color:#1E293B;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scene.name || 'Chưa đặt tên'}</div>
                <div style="font-size:12px;color:#64748B;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scene.description || '—'}</div>
                <button onclick="openSceneEditModal({scene_id:${scene.id},scene_name:'${(scene.name || '').replace(/'/g, "\\'")}',scene_description:'${(scene.description || '').replace(/'/g, "\\'")}',_previewSceneId:${scene.id}})"
                    style="width:100%;height:34px;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:700;color:#475569;cursor:pointer;transition:all 0.2s"
                    onmouseover="this.style.background='#2563EB';this.style.color='#fff'" onmouseout="this.style.background='#F1F5F9';this.style.color='#475569'">
                    <i class="fa-solid fa-pen" style="margin-right:6px"></i>Sửa tên & mô tả
                </button>
            </div>
        </div>`).join('');

    // Load thumbnails
    scenes.forEach(scene => loadSceneThumb(scene.id));
}

async function loadSceneThumb(sceneId) {
    try {
        const framesRes = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!framesRes.ok) return;
        const frames = await framesRes.json();
        if (!frames.length) return;

        const imgRes = await fetch(`${BASE_URL}/frames/${frames[0].id}/thumb/CAM_FRONT`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!imgRes.ok) return;
        const blob = await imgRes.blob();
        const img = document.getElementById(`sceneThumb_${sceneId}`);
        const loading = document.getElementById(`sceneThumbLoading_${sceneId}`);
        if (img) { img.src = URL.createObjectURL(blob); img.style.opacity = '1'; }
        if (loading) loading.style.display = 'none';
    } catch (e) { /* silent */ }
}

// ============= SCENE EDIT MODAL =============
let _previewFrames = [];
let _previewFrameIdx = 0;

async function openSceneEditModal(task) {
    const sceneId = task.scene_id || task._previewSceneId;
    document.getElementById('sceneEditId').value = sceneId;
    document.getElementById('sceneEditName').value = task.scene_name || '';
    document.getElementById('sceneEditDesc').value = task.scene_description || '';

    // Reset preview state
    _previewFrames = [];
    _previewFrameIdx = 0;
    document.getElementById('scenePreviewImg').src = '';
    document.getElementById('previewFrameCounter').textContent = '... / ...';

    document.getElementById('sceneEditModal').classList.add('active');

    // Load all frames
    try {
        const framesRes = await fetch(`${BASE_URL}/scenes/${sceneId}/frames`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (framesRes.ok) {
            _previewFrames = await framesRes.json();
            if (_previewFrames.length > 0) {
                await _loadPreviewFrame(0);
            }
        }
    } catch (e) { /* silent */ }
}

async function _loadPreviewFrame(idx) {
    if (!_previewFrames.length) return;
    idx = Math.max(0, Math.min(_previewFrames.length - 1, idx));
    _previewFrameIdx = idx;

    const loading = document.getElementById('previewLoading');
    const counter = document.getElementById('previewFrameCounter');
    const img = document.getElementById('scenePreviewImg');

    loading.style.display = 'flex';
    counter.textContent = `${idx + 1} / ${_previewFrames.length}`;

    try {
        const res = await fetch(`${BASE_URL}/frames/${_previewFrames[idx].id}/thumb/CAM_FRONT`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (res.ok) {
            const blob = await res.blob();
            img.src = URL.createObjectURL(blob);
        }
    } catch (e) { /* silent */ }
    finally {
        loading.style.display = 'none';
    }
}

async function previewNavFrame(dir) {
    await _loadPreviewFrame(_previewFrameIdx + dir);
}

function closeSceneEditModal() {
    document.getElementById('sceneEditModal').classList.remove('active');
}

document.getElementById('sceneEditModal').addEventListener('click', function (e) {
    if (e.target === this) closeSceneEditModal();
});

async function saveSceneEdit() {
    const sceneId = document.getElementById('sceneEditId').value;
    const name = document.getElementById('sceneEditName').value.trim();
    const description = document.getElementById('sceneEditDesc').value.trim();

    if (!name) { showToast('Tên không được để trống', 'error'); return; }

    try {
        const res = await fetch(`${BASE_URL}/scenes/${sceneId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (res.ok) {
            showToast('Đã cập nhật tên nhiệm vụ', 'success');
            closeSceneEditModal();
            loadTasks();
            loadAllTasks(); // Tải lại bảng dữ liệu trong tab Tất cả các nhiệm vụ
            // Reload scenes grid nếu đang ở tab đó
            if (allScenesData.length > 0) loadAllScenes();
        } else {
            showToast('Lỗi cập nhật', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối', 'error');
    }
}



// ============= TOAST =============
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}" style="margin-right:8px"></i>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showConfirmModal(options) {
    const { title, message, confirmText, confirmColor, icon, onConfirm } = options;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);animation:fadeIn 0.2s ease';
    
    const iconColor = confirmColor === 'danger' ? '#EF4444' : '#10B981';
    const iconBg = confirmColor === 'danger' ? '#FEE2E2' : '#D1FAE5';
    const btnBg = confirmColor === 'danger' ? '#EF4444' : '#10B981';

    overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:380px;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:24px;font-family:Inter,sans-serif;transform:scale(0.95);animation:scaleIn 0.2s forwards ease-out">
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
            <div style="width:54px;height:54px;border-radius:50%;background:${iconBg};color:${iconColor};display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">
                <i class="fa-solid ${icon}"></i>
            </div>
            <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1E293B">${title}</h3>
            <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.5">${message}</p>
        </div>
        <div style="display:flex;gap:12px">
            <button class="cancel-btn" style="flex:1;height:44px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s">Hủy bỏ</button>
            <button class="confirm-btn" style="flex:1;height:44px;background:${btnBg};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity 0.2s">${confirmText}</button>
        </div>
    </div>
    <style>
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { transform: scale(0.95) } to { transform: scale(1) } }
        .cancel-btn:hover { background: #E2E8F0 !important }
        .confirm-btn:hover { opacity: 0.9 !important }
    </style>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.cancel-btn').onclick = () => overlay.remove();
    overlay.querySelector('.confirm-btn').onclick = () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    };
}

function adminApproveTask(taskId) {
    showConfirmModal({
        title: 'Đạt yêu cầu',
        message: 'Bạn có chắc chắn muốn phê duyệt nhiệm vụ này là Đạt yêu cầu?',
        confirmText: 'Xác nhận Đạt',
        confirmColor: 'success',
        icon: 'fa-circle-check',
        onConfirm: async () => {
            try {
                const res = await fetch(`${BASE_URL}/tasks/${taskId}/admin/override`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'approved' })
                });
                if (res.ok) {
                    showToast('Đã phê duyệt nhiệm vụ', 'success');
                    document.getElementById('adminTaskDetailModal')?.remove();
                    try {
                        const approved = JSON.parse(localStorage.getItem('admin_approved_tasks') || '[]');
                        if (!approved.includes(taskId)) approved.push(taskId);
                        localStorage.setItem('admin_approved_tasks', JSON.stringify(approved));
                    } catch (e) { }
                    loadTasks();
                } else {
                    const err = await res.json();
                    showToast(err.detail || 'Lỗi phê duyệt', 'error');
                }
            } catch (e) {
                showToast('Lỗi kết nối', 'error');
            }
        }
    });
}

function adminRejectTask(taskId) {
    showConfirmModal({
        title: 'Chưa đạt yêu cầu',
        message: 'Bạn có chắc chắn muốn đánh giá nhiệm vụ này là Chưa đạt yêu cầu?',
        confirmText: 'Xác nhận',
        confirmColor: 'danger',
        icon: 'fa-triangle-exclamation',
        onConfirm: async () => {
            try {
                const res = await fetch(`${BASE_URL}/tasks/${taskId}/admin/override`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'rejected', feedback: '' })
                });
                if (res.ok) {
                    showToast('Đã đánh giá: Chưa đạt', 'success');
                    document.getElementById('adminTaskDetailModal')?.remove();
                    loadTasks();
                } else {
                    const err = await res.json();
                    showToast(err.detail || 'Lỗi từ chối', 'error');
                }
            } catch (e) {
                showToast('Lỗi kết nối', 'error');
            }
        }
    });
}



// ============= INIT =============
loadSidebarProject();
loadTasks();
loadMembers();

