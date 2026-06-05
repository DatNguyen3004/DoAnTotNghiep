import { state, taskId } from './state.js';
import { fetchPeerChats, deletePeerChats, fetchTaskHistory } from './api.js';

export async function openEvaluationChat() {
    const modal = document.getElementById('modalEvaluationChat');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadEvaluationChats();
}

export async function loadEvaluationChats() {
    const container = document.getElementById('evaluationChatList');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>`;

    try {
        const chats = await fetchPeerChats(taskId);

        if (!chats.length) {
            container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">
                Chưa có trao đổi nào giữa gán nhãn và kiểm duyệt.
            </div>`;
            return;
        }

        container.innerHTML = chats.map(c => {
            const date = new Date(c.created_at);
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const timeStr = `${hh}:${mm} ${d}-${m}`;

            const isLabeler = state.evaluationData && state.evaluationData.labeler && c.sender_id === state.evaluationData.labeler.id;
            const senderName = c.sender_full_name || c.sender_username;

            if (isLabeler) {
                return `
                <div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:12px;font-family:Inter,sans-serif">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                        <span style="font-size:11px;font-weight:600;color:#64748B">${senderName}</span>
                        <span style="font-size:9px;font-weight:700;background:#EFF6FF;color:#2563EB;padding:1px 4px;border-radius:4px;text-transform:uppercase">USER</span>
                    </div>
                    <div style="background:#4F46E5;color:#fff;padding:8px 12px;border-radius:14px 14px 2px 14px;max-width:80%;font-size:13px;word-break:break-word">
                        ${c.message}
                    </div>
                    <span style="font-size:10px;color:#94A3B8;margin-top:2px">${timeStr}</span>
                </div>`;
            } else {
                return `
                <div style="display:flex;flex-direction:column;align-items:flex-start;margin-bottom:12px;font-family:Inter,sans-serif">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                        <span style="font-size:11px;font-weight:600;color:#64748B">${senderName}</span>
                        <span style="font-size:9px;font-weight:700;background:#F1F5F9;color:#475569;padding:1px 4px;border-radius:4px;text-transform:uppercase">USER</span>
                    </div>
                    <div style="background:#EBF0F6;color:#1E293B;padding:8px 12px;border-radius:14px 14px 14px 2px;max-width:80%;font-size:13px;word-break:break-word">
                        ${c.message}
                    </div>
                    <span style="font-size:10px;color:#94A3B8;margin-top:2px">${timeStr}</span>
                </div>`;
            }
        }).join('');

        container.scrollTop = container.scrollHeight;

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#EF4444;font-size:13px">Không thể tải nội dung trao đổi</div>`;
    }
}

export async function deleteEvaluationChat() {
    if (!confirm('Bạn có chắc chắn muốn xóa (ẩn) cuộc trò chuyện này ở phía Admin? Người dùng vẫn sẽ nhìn thấy cuộc trò chuyện này bình thường.')) {
        return;
    }

    try {
        await deletePeerChats(taskId);
        await loadEvaluationChats();
    } catch (e) {
        alert('Lỗi kết nối hoặc không thể xóa cuộc trò chuyện');
    }
}

export async function openEvaluationHistory() {
    const modal = document.getElementById('modalEvaluationHistory');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadEvaluationHistory();
}

export async function loadEvaluationHistory() {
    const container = document.getElementById('evaluationHistoryList');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>`;

    try {
        const history = await fetchTaskHistory(taskId);

        if (!history.length) {
            container.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">
                Chưa có lịch sử nộp bài.
            </div>`;
            return;
        }

        const ACTION_CONFIG = {
            submitted: { icon: 'fa-paper-plane', color: '#2563EB', bg: '#EFF6FF', label: 'Nộp bài' },
            rejected: { icon: 'fa-circle-xmark', color: '#EF4444', bg: '#FEF2F2', label: 'Từ chối' },
            approved: { icon: 'fa-circle-check', color: '#10B981', bg: '#F0FDF4', label: 'Kiểm tra xong' },
            admin_approved: { icon: 'fa-check-double', color: '#7C3AED', bg: '#F5F3FF', label: 'Admin phê duyệt' },
            admin_rejected: { icon: 'fa-triangle-exclamation', color: '#DC2626', bg: '#FEF2F2', label: 'Admin từ chối' },
        };

        container.innerHTML = history.map((h, idx) => {
            const cfg = ACTION_CONFIG[h.action] || { icon: 'fa-circle', color: '#64748B', bg: '#F8FAFC', label: h.action };
            const actor = h.actor_full_name ? `${h.actor_full_name} (@${h.actor_username})` : (h.actor_username ? `@${h.actor_username}` : '—');

            let timeStr = '—';
            if (h.created_at) {
                const date = new Date(h.created_at);
                const hh = String(date.getHours()).padStart(2, '0');
                const mm = String(date.getMinutes()).padStart(2, '0');
                const ss = String(date.getSeconds()).padStart(2, '0');
                const d = date.getDate();
                const m = date.getMonth() + 1;
                const y = date.getFullYear();
                timeStr = `${hh}:${mm}:${ss} ${d}/${m}/${y}`;
            }

            return `
            <div style="display:flex;gap:10px;align-items:flex-start">
                <!-- Timeline dot -->
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding-top:2px;align-self:stretch">
                    <div style="width:28px;height:28px;border-radius:50%;background:${cfg.bg};color:${cfg.color};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">
                        <i class="fa-solid ${cfg.icon}"></i>
                    </div>
                    ${idx < history.length - 1 ? `<div style="width:2px;flex:1;background:#E2E8F0;margin-top:4px;margin-bottom:4px"></div>` : ''}
                </div>
                <!-- Content -->
                <div style="flex:1;padding-bottom:${idx < history.length - 1 ? '16px' : '0'}">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                        <span style="font-size:13px;font-weight:700;color:${cfg.color}">${cfg.label}</span>
                        <span style="font-size:11px;color:#94A3B8">${timeStr}</span>
                    </div>
                    <div style="font-size:12px;color:#64748B;margin-top:2px">${actor}</div>
                    ${h.feedback ? `<div style="margin-top:6px;padding:8px 10px;background:#FEF2F2;border-radius:6px;font-size:12px;color:#7F1D1D;white-space:pre-line;border-left:2px solid #EF4444">${h.feedback}</div>` : ''}
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#EF4444;font-size:13px">Không thể tải lịch sử nộp bài</div>`;
    }
}
