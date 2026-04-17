/**
 * showConfirm — thay thế confirm() mặc định của browser
 * @param {string} message - Nội dung xác nhận
 * @param {function} onConfirm - Callback khi nhấn Xác nhận
 * @param {object} options - { title, confirmText, cancelText, type: 'danger'|'warning'|'info' }
 */
function showConfirm(message, onConfirm, options = {}) {
    const {
        title = 'Xác nhận',
        confirmText = 'Xác nhận',
        cancelText = 'Hủy',
        type = 'danger'
    } = options;

    const colors = {
        danger:  { icon: 'fa-triangle-exclamation', iconBg: '#FEF2F2', iconColor: '#EF4444', btnBg: '#EF4444', btnHover: '#DC2626' },
        warning: { icon: 'fa-circle-exclamation',   iconBg: '#FFFBEB', iconColor: '#F59E0B', btnBg: '#F59E0B', btnHover: '#D97706' },
        info:    { icon: 'fa-circle-info',           iconBg: '#EFF6FF', iconColor: '#2563EB', btnBg: '#2563EB', btnHover: '#1D4ED8' },
    };
    const c = colors[type] || colors.danger;

    const existing = document.getElementById('_confirmModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = '_confirmModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)';

    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:28px 24px 24px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,0.15);font-family:Inter,sans-serif;animation:_cfmIn 0.2s ease">
            <div style="display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:20px">
                <div style="width:52px;height:52px;border-radius:50%;background:${c.iconBg};display:flex;align-items:center;justify-content:center;margin-bottom:14px">
                    <i class="fa-solid ${c.icon}" style="font-size:22px;color:${c.iconColor}"></i>
                </div>
                <div style="font-size:16px;font-weight:800;color:#1E293B;margin-bottom:6px">${title}</div>
                <div style="font-size:13px;color:#64748B;line-height:1.6">${message}</div>
            </div>
            <div style="display:flex;gap:10px">
                <button id="_confirmCancel"
                    style="flex:1;height:42px;background:#F1F5F9;color:#475569;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;transition:background 0.2s"
                    onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">
                    ${cancelText}
                </button>
                <button id="_confirmOk"
                    style="flex:1;height:42px;background:${c.btnBg};color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;transition:background 0.2s"
                    onmouseover="this.style.background='${c.btnHover}'" onmouseout="this.style.background='${c.btnBg}'">
                    ${confirmText}
                </button>
            </div>
        </div>
        <style>
            @keyframes _cfmIn { from { opacity:0; transform:scale(0.92) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
        </style>`;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    document.getElementById('_confirmCancel').addEventListener('click', close);
    document.getElementById('_confirmOk').addEventListener('click', () => {
        close();
        onConfirm();
    });
    // Click backdrop to cancel
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    // ESC to cancel
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}
