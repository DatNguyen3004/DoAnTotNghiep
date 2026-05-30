// avatar-sync.js — load avatar từ localStorage vào topnav
(function() {
    var BASE_URL = '';
    var cu = JSON.parse(localStorage.getItem('current_user') || '{}');

    // Tự detect đường dẫn Profile dựa vào vị trí file hiện tại
    var path = window.location.pathname;
    var profileHref = path.includes('/Admin/') ? 'Profile.html' : 'Profile.html';

    function resolveAvatarUrl(url) {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return BASE_URL + (url.startsWith('/') ? '' : '/') + url;
    }

    function makeInitialsEl(username, onclick) {
        var d = document.createElement('div');
        d.style.cssText = 'width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-family:Inter,sans-serif';
        d.textContent = (username || 'NL').substring(0, 2).toUpperCase();
        d.onclick = onclick;
        return d;
    }

    function applyAvatar() {
        var avatarUrl = resolveAvatarUrl(cu.avatar_url);
        var goProfile = function() { window.location.href = profileHref; };

        // ── Xử lý img avatar (topnav-right .avatar, #topnavAvatar) ──
        var avatarImgs = document.querySelectorAll(
            '.topnav-right .avatar, .topnav-right .avatar-nav, #topnavAvatar, .nav-right img.avatar, .nav-right img.user-avatar'
        );
        avatarImgs.forEach(function(img) {
            img.style.cursor = 'pointer';
            if (!img.onclick) img.onclick = goProfile;
            if (avatarUrl) {
                img.src = avatarUrl;
                img.onerror = function() {
                    var d = makeInitialsEl(cu.username, goProfile);
                    img.parentNode.replaceChild(d, img);
                };
            } else {
                var d = makeInitialsEl(cu.username, goProfile);
                img.parentNode.replaceChild(d, img);
            }
        });

        // ── Xử lý div#userAvatar (Label.html, Label_Review.html) ──
        var divAvatar = document.getElementById('userAvatar');
        if (divAvatar && divAvatar.tagName === 'DIV') {
            divAvatar.style.cursor = 'pointer';
            divAvatar.onclick = goProfile;
            if (avatarUrl) {
                var img = document.createElement('img');
                img.src = avatarUrl;
                img.alt = 'Avatar';
                img.id = 'userAvatar';
                img.style.cssText = 'width:36px;height:36px;border-radius:50%;object-fit:cover;cursor:pointer;';
                img.onclick = goProfile;
                img.onerror = function() {
                    var d = makeInitialsEl(cu.username, goProfile);
                    d.id = 'userAvatar';
                    img.parentNode.replaceChild(d, img);
                };
                divAvatar.parentNode.replaceChild(img, divAvatar);
            } else {
                divAvatar.textContent = (cu.username || 'NL').substring(0, 2).toUpperCase();
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyAvatar);
    } else {
        applyAvatar();
    }
})();

// ==================== GLOBAL CHAT WIDGET ====================
(function() {
    // Only run if user is logged in
    var token = localStorage.getItem('access_token');
    var currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
    if (!token || !currentUser.id) return;

    // Inject FontAwesome stylesheet to ensure icons render on all pages
    if (!document.querySelector('link[href*="font-awesome"]')) {
        var faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(faLink);
    }

    // Inject CSS
    var chatStyles = `
        .global-chat-widget {
            position: fixed;
            bottom: 90px;
            right: 24px;
            z-index: 10000;
            font-family: 'Inter', sans-serif;
        }
        .global-chat-toggle-btn {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4F46E5, #7C3AED);
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            transition: transform 0.2s, box-shadow 0.2s;
            position: relative;
        }
        .global-chat-toggle-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.6);
        }
        .global-chat-toggle-btn:active {
            transform: scale(0.95);
        }
        .global-chat-badge {
            position: absolute;
            top: -2px;
            right: -2px;
            background: #EF4444;
            color: white;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 6px;
            border-radius: 10px;
            border: 2px solid white;
            min-width: 18px;
            text-align: center;
        }
        .global-chat-window {
            position: absolute;
            bottom: 72px;
            right: 0;
            width: 360px;
            height: 480px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            border: 1px solid #E2E8F0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: globalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes globalSlideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .global-chat-header {
            background: linear-gradient(135deg, #1E293B, #0F172A);
            color: white;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #334155;
            flex-shrink: 0;
        }
        .global-chat-header-title {
            font-weight: 600;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            max-width: 80%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .global-chat-back-btn {
            background: none;
            border: none;
            color: #94A3B8;
            cursor: pointer;
            font-size: 14px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
            margin-right: 6px;
        }
        .global-chat-back-btn:hover {
            color: white;
        }
        .global-chat-close-btn {
            background: none;
            border: none;
            color: #94A3B8;
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
        }
        .global-chat-close-btn:hover {
            color: white;
        }
        .global-chat-body {
            flex: 1;
            overflow-y: auto;
            background: #F8FAFC;
            display: flex;
            flex-direction: column;
        }
        .global-chat-list-section {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .global-chat-section-title {
            font-size: 11px;
            font-weight: 700;
            color: #94A3B8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
            margin-top: 8px;
        }
        .global-chat-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            background: white;
            border: 1px solid #E2E8F0;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
        }
        .global-chat-item:hover {
            border-color: #4F46E5;
            background: #F5F3FF;
            transform: translateY(-1px);
        }
        .global-chat-item-icon {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #EDE9FE;
            color: #7C3AED;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
        }
        .global-chat-item-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #EEF2FF;
            color: #4F46E5;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            flex-shrink: 0;
            object-fit: cover;
        }
        .global-chat-item-info {
            flex: 1;
            min-width: 0;
        }
        .global-chat-item-name {
            font-size: 13px;
            font-weight: 600;
            color: #1E293B;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .global-chat-item-subtitle {
            font-size: 11px;
            color: #64748B;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .global-chat-item-badge {
            background: #EF4444;
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 8px;
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
        }
        .global-chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .global-chat-messages::-webkit-scrollbar {
            width: 6px;
        }
        .global-chat-messages::-webkit-scrollbar-track {
            background: transparent;
        }
        .global-chat-messages::-webkit-scrollbar-thumb {
            background: #CBD5E1;
            border-radius: 3px;
        }
        .global-chat-empty {
            text-align: center;
            color: #94A3B8;
            font-size: 12px;
            margin: auto;
            padding: 0 20px;
            line-height: 1.6;
        }
        .global-chat-msg-wrapper {
            display: flex;
            flex-direction: column;
            max-width: 80%;
        }
        .global-chat-msg-wrapper.mine {
            align-self: flex-end;
        }
        .global-chat-msg-wrapper.others {
            align-self: flex-start;
        }
        .global-chat-sender-info {
            font-size: 10px;
            color: #64748B;
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .global-chat-msg-wrapper.mine .global-chat-sender-info {
            justify-content: flex-end;
        }
        .global-chat-sender-role {
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 1px 4px;
            border-radius: 4px;
        }
        .role-admin { background: #FEE2E2; color: #DC2626; }
        .role-user { background: #E0F2FE; color: #0369A1; }
        .global-chat-bubble {
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 13px;
            line-height: 1.4;
            word-break: break-word;
        }
        .global-chat-msg-wrapper.mine .global-chat-bubble {
            background: #4F46E5;
            color: white;
            border-bottom-right-radius: 2px;
        }
        .global-chat-msg-wrapper.others .global-chat-bubble {
            background: #E2E8F0;
            color: #1E293B;
            border-top-left-radius: 2px;
        }
        .global-chat-time {
            font-size: 9px;
            color: #94A3B8;
            margin-top: 2px;
        }
        .global-chat-msg-wrapper.mine .global-chat-time {
            align-self: flex-end;
        }
        .global-chat-msg-wrapper.others .global-chat-time {
            align-self: flex-start;
        }
        .global-chat-input-area {
            padding: 12px;
            border-top: 1px solid #E2E8F0;
            display: flex;
            gap: 8px;
            background: white;
            flex-shrink: 0;
        }
        .global-chat-input {
            flex: 1;
            border: 1px solid #CBD5E1;
            border-radius: 20px;
            padding: 8px 16px;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }
        .global-chat-input:focus {
            border-color: #4F46E5;
        }
        .global-chat-send-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #4F46E5;
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: background 0.2s, transform 0.2s;
        }
        .global-chat-send-btn:hover {
            background: #4338CA;
            transform: scale(1.05);
        }
    `;

    var styleEl = document.createElement('style');
    styleEl.innerHTML = chatStyles;
    document.head.appendChild(styleEl);

    // Inject HTML
    var htmlString = `
        <div class="global-chat-widget" id="globalChatWidget">
            <button class="global-chat-toggle-btn" id="globalChatToggleBtn">
                <i class="fa-solid fa-comments"></i>
                <span class="global-chat-badge" id="globalChatBadge" style="display: none;">0</span>
            </button>
            <div class="global-chat-window" id="globalChatWindow" style="display: none;">
                <div class="global-chat-header" id="globalChatHeader">
                    <div class="global-chat-header-title" id="globalChatHeaderTitle">
                        <i class="fa-solid fa-comments"></i> Trò chuyện hệ thống
                    </div>
                    <button class="global-chat-close-btn" id="globalChatCloseBtn">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="global-chat-body" id="globalChatBody">
                    <!-- Dynamic view goes here -->
                </div>
                <form class="global-chat-input-area" id="globalChatForm" style="display: none;">
                    <input type="text" class="global-chat-input" id="globalChatInput" placeholder="Nhập tin nhắn..." autocomplete="off">
                    <button type="submit" class="global-chat-send-btn">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        </div>
    `;

    var chatDiv = document.createElement('div');
    chatDiv.innerHTML = htmlString;
    document.body.appendChild(chatDiv);

    // State Variables
    var currentMode = 'list'; // 'list', 'general', 'private'
    var currentRecipientId = null;
    var currentRecipientName = '';
    var allowedUsers = [];
    var pollInterval = null;
    var cachedMessages = {}; // roomId -> messages
    var unreads = {}; // roomId -> count

    // DOM Elements
    var toggleBtn = document.getElementById('globalChatToggleBtn');
    var chatWindow = document.getElementById('globalChatWindow');
    var chatBody = document.getElementById('globalChatBody');
    var chatForm = document.getElementById('globalChatForm');
    var chatInput = document.getElementById('globalChatInput');
    var headerTitle = document.getElementById('globalChatHeaderTitle');
    var closeBtn = document.getElementById('globalChatCloseBtn');
    var mainBadge = document.getElementById('globalChatBadge');

    // Setup Listeners
    toggleBtn.onclick = function() {
        if (chatWindow.style.display === 'none') {
            chatWindow.style.display = 'flex';
            mainBadge.style.display = 'none';
            loadAllowedUsers().then(function() {
                renderView();
            });
            if (!pollInterval) {
                pollInterval = setInterval(fetchUpdates, 5000);
            }
        } else {
            closeChatWindow();
        }
    };

    closeBtn.onclick = closeChatWindow;

    chatForm.onsubmit = async function(e) {
        e.preventDefault();
        var msg = chatInput.value.trim();
        if (!msg) return;

        chatInput.value = '';
        chatInput.disabled = true;

        try {
            var res = await fetch('/api/chat/messages', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipient_id: currentRecipientId,
                    message: msg
                })
            });

            if (res.ok) {
                var newMsg = await res.json();
                var roomId = currentRecipientId === null ? 'general' : String(currentRecipientId);
                if (!cachedMessages[roomId]) cachedMessages[roomId] = [];
                cachedMessages[roomId].push(newMsg);
                
                // Save last read
                localStorage.setItem('chat_last_read_' + roomId + '_' + currentUser.id, String(newMsg.id));
                
                renderMessagesView(cachedMessages[roomId]);
            }
        } catch (err) {
            console.error("Error sending message:", err);
        } finally {
            chatInput.disabled = false;
            chatInput.focus();
        }
    };

    function closeChatWindow() {
        chatWindow.style.display = 'none';
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        updateMainBadge();
    }

    async function loadAllowedUsers() {
        try {
            var res = await fetch('/api/chat/users', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.ok) {
                allowedUsers = await res.json();
            }
        } catch (e) {
            console.error("Error loading chat contacts:", e);
        }
    }

    function renderView() {
        if (currentMode === 'list') {
            headerTitle.innerHTML = '<i class="fa-solid fa-comments"></i> Trò chuyện hệ thống';
            chatForm.style.display = 'none';
            renderListView();
        } else {
            // Mode is general or private
            var backBtn = '<button class="global-chat-back-btn" id="globalChatBackBtn"><i class="fa-solid fa-arrow-left"></i></button>';
            var displayName = currentMode === 'general' ? 'Nhóm chung' : currentRecipientName;
            headerTitle.innerHTML = backBtn + '<span>' + displayName + '</span>';
            
            document.getElementById('globalChatBackBtn').onclick = function() {
                currentMode = 'list';
                currentRecipientId = null;
                renderView();
            };

            chatForm.style.display = 'flex';
            chatInput.placeholder = currentMode === 'general' ? 'Nhắn tin nhóm...' : 'Nhắn cho ' + displayName + '...';
            chatInput.focus();
            
            var roomId = currentRecipientId === null ? 'general' : String(currentRecipientId);
            renderMessagesLoader();
            loadMessages(currentRecipientId).then(function(msgs) {
                renderMessagesView(msgs);
                if (msgs.length > 0) {
                    var latestId = msgs[msgs.length - 1].id;
                    localStorage.setItem('chat_last_read_' + roomId + '_' + currentUser.id, String(latestId));
                    unreads[roomId] = 0;
                }
            });
        }
    }

    function renderListView() {
        var html = '<div class="global-chat-list-section">';
        
        // 1. General Group
        var genUnread = unreads['general'] || 0;
        var genUnreadBadge = genUnread > 0 ? '<span class="global-chat-item-badge">' + genUnread + '</span>' : '';
        html += `
            <div class="global-chat-item" id="item_general">
                <div class="global-chat-item-icon"><i class="fa-solid fa-earth-americas"></i></div>
                <div class="global-chat-item-info">
                    <div class="global-chat-item-name">Nhóm chung</div>
                    <div class="global-chat-item-subtitle">Phòng trò chuyện cho tất cả thành viên</div>
                </div>
                ${genUnreadBadge}
            </div>
        `;

        // 2. Direct Messages Title
        html += '<div class="global-chat-section-title">Tin nhắn riêng</div>';

        // 3. Allowed Users List
        if (allowedUsers.length === 0) {
            html += '<div style="text-align:center;padding:16px;font-size:12px;color:#94A3B8">Không có danh bạ khả dụng</div>';
        } else {
            allowedUsers.forEach(function(u) {
                var initials = (u.username || 'NL').substring(0, 2).toUpperCase();
                var uUnread = unreads[String(u.id)] || 0;
                var uUnreadBadge = uUnread > 0 ? '<span class="global-chat-item-badge">' + uUnread + '</span>' : '';
                var roleLabel = u.role === 'admin' 
                    ? '<span class="global-chat-sender-role role-admin">Admin</span>' 
                    : '<span class="global-chat-sender-role role-user">User</span>';
                var nameText = u.full_name || u.username;

                var avatarHtml = u.avatar_url 
                    ? '<img class="global-chat-item-avatar" src="' + u.avatar_url + '" alt="Avatar">'
                    : '<div class="global-chat-item-avatar">' + initials + '</div>';

                html += `
                    <div class="global-chat-item" id="item_${u.id}">
                        ${avatarHtml}
                        <div class="global-chat-item-info">
                            <div class="global-chat-item-name">${nameText} ${roleLabel}</div>
                            <div class="global-chat-item-subtitle">@${u.username}</div>
                        </div>
                        ${uUnreadBadge}
                    </div>
                `;
            });
        }

        html += '</div>';
        chatBody.innerHTML = html;

        // Add item click handlers
        document.getElementById('item_general').onclick = function() {
            currentMode = 'general';
            currentRecipientId = null;
            renderView();
        };

        allowedUsers.forEach(function(u) {
            var item = document.getElementById('item_' + u.id);
            if (item) {
                item.onclick = function() {
                    currentMode = 'private';
                    currentRecipientId = u.id;
                    currentRecipientName = u.full_name || u.username;
                    renderView();
                };
            }
        });
    }

    function renderMessagesLoader() {
        chatBody.innerHTML = `
            <div class="global-chat-empty">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px;"></i>
                <br>Đang tải tin nhắn...
            </div>
        `;
    }

    async function loadMessages(recipientId) {
        var roomId = recipientId === null ? 'general' : String(recipientId);
        try {
            var url = '/api/chat/messages';
            if (recipientId !== null) {
                url += '?recipient_id=' + recipientId;
            }
            var res = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.ok) {
                var msgs = await res.json();
                cachedMessages[roomId] = msgs;
                return msgs;
            }
        } catch (e) {
            console.error("Error loading chat messages:", e);
        }
        return cachedMessages[roomId] || [];
    }

    function renderMessagesView(msgs) {
        if (msgs.length === 0) {
            chatBody.innerHTML = `
                <div class="global-chat-empty">
                    Chưa có tin nhắn nào.<br>Hãy gửi tin nhắn để bắt đầu cuộc trò chuyện!
                </div>
            `;
            return;
        }

        var listHtml = '<div class="global-chat-messages" id="globalChatMsgsContainer">';
        listHtml += msgs.map(function(m) {
            var isMine = m.sender_id === currentUser.id;
            var wrapperClass = isMine ? 'mine' : 'others';
            
            var date = new Date(m.created_at);
            var timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + 
                            date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            
            var roleLabel = m.sender_role === 'admin' 
                ? '<span class="global-chat-sender-role role-admin">Admin</span>' 
                : '<span class="global-chat-sender-role role-user">User</span>';
            var senderName = m.sender_full_name || m.sender_username;
            
            return `
                <div class="global-chat-msg-wrapper ${wrapperClass}">
                    <div class="global-chat-sender-info">
                        <span class="global-chat-sender-name">${senderName}</span>
                        ${roleLabel}
                    </div>
                    <div class="global-chat-bubble">${escapeHtml(m.message)}</div>
                    <div class="global-chat-time">${timeStr}</div>
                </div>
            `;
        }).join('');
        listHtml += '</div>';

        chatBody.innerHTML = listHtml;
        
        var container = document.getElementById('globalChatMsgsContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Routine polling for new messages & calculating unread counts
    async function fetchUpdates() {
        // Only run polling if logged in
        if (!token) return;

        // 1. Fetch general room messages to compute unreads
        try {
            var resGen = await fetch('/api/chat/messages', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (resGen.ok) {
                var msgs = await resGen.json();
                cachedMessages['general'] = msgs;
                var lastReadId = parseInt(localStorage.getItem('chat_last_read_general_' + currentUser.id) || '0');
                var count = msgs.filter(function(m) { return m.id > lastReadId; }).length;
                unreads['general'] = count;
            }
        } catch(e) {}

        // 2. Fetch direct messages for each contact
        for (var i = 0; i < allowedUsers.length; i++) {
            var u = allowedUsers[i];
            try {
                var resPriv = await fetch('/api/chat/messages?recipient_id=' + u.id, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (resPriv.ok) {
                    var msgsPriv = await resPriv.json();
                    cachedMessages[String(u.id)] = msgsPriv;
                    var lastReadIdPriv = parseInt(localStorage.getItem('chat_last_read_' + u.id + '_' + currentUser.id) || '0');
                    var countPriv = msgsPriv.filter(function(m) { return m.id > lastReadIdPriv; }).length;
                    unreads[String(u.id)] = countPriv;
                }
            } catch(e) {}
        }

        // If open, redraw current view
        if (chatWindow.style.display === 'flex') {
            if (currentMode === 'list') {
                renderListView();
            } else {
                var roomId = currentRecipientId === null ? 'general' : String(currentRecipientId);
                var msgsToRender = cachedMessages[roomId] || [];
                renderMessagesView(msgsToRender);
                if (msgsToRender.length > 0) {
                    var latestId = msgsToRender[msgsToRender.length - 1].id;
                    localStorage.setItem('chat_last_read_' + roomId + '_' + currentUser.id, String(latestId));
                    unreads[roomId] = 0;
                }
            }
        }
        updateMainBadge();
    }

    function updateMainBadge() {
        var totalUnread = 0;
        for (var k in unreads) {
            totalUnread += unreads[k] || 0;
        }
        if (totalUnread > 0) {
            mainBadge.textContent = totalUnread;
            mainBadge.style.display = 'block';
        } else {
            mainBadge.style.display = 'none';
        }
    }

    // Run first unread scan
    setTimeout(function() {
        loadAllowedUsers().then(function() {
            fetchUpdates();
            // Regular update interval for unreads even if closed
            setInterval(fetchUpdates, 8000);
        });
    }, 1500);

})();
