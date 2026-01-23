// ================================================================
// CLIENT.JS - Client-side Logic (Frontend)
// ================================================================

// Check if file is opened directly
if (location.protocol === 'file:') {
    alert('CRITICAL ERROR: You are opening this file directly in your browser. \n\nYou MUST access this website via the server URL: http://localhost:3000\n\nPlease check the instructions in walkthrough.md');
}

// Initialize Socket.io client connection safely
let socket;
if (typeof io !== 'undefined') {
    try {
        socket = io();
        socket.on('connect', () => {
            console.log('Socket connected successfully:', socket.id);
            updateConnectionStatus(true);
            // Request latest user list on connect
            const username = getStoredUser();
            if (username) socket.emit('join', username);
        });
        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            updateConnectionStatus(false);
        });
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            updateConnectionStatus(false);
        });
    } catch (e) {
        console.error('Socket.io initialization error:', e);
    }
} else {
    console.warn('Socket.io library not loaded. Real-time features disabled.');
}

// Track displayed message IDs to avoid duplicates
const displayedMessageIds = new Set();
// Private Chat State
let activeChatPartner = null;

// Initialize Heartbeat (Vercel Keep-Alive)
setInterval(() => {
    if (localStorage.getItem('chat_username')) {
        fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: localStorage.getItem('chat_username') })
        }).catch(err => console.error('Heartbeat failed:', err));
    }
}, 10000); // 10 seconds

function displayMessage(data) {
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) return;

    // PRIVATE CHAT FILTERING:
    // Only show message if it belongs to the current conversation
    // 1. If I am the sender, show it (provided I sent it TO the current partner)
    // 2. If I am the receiver, show it ONLY if it came FROM the current partner
    const currentUser = getStoredUser();

    // If we haven't selected a chat partner, we shouldn't see chat messages (except system)
    if (!activeChatPartner && data.user !== 'System') {
        return;
    }

    if (activeChatPartner) {
        // If I sent it, but not to this partner -> Hide
        if (data.user === currentUser && data.to !== activeChatPartner) return;
        // If someone else sent it, but not my partner -> Hide (maybe add notification later)
        if (data.user !== currentUser && data.user !== activeChatPartner && data.user !== 'System') return;
    }

    // Deduplicate based on ID - Force String comparison
    const msgId = String(data.id || `${data.user}-${data.text}-${data.timestamp}`);

    if (displayedMessageIds.has(msgId)) {
        return; // Skip duplicate messages
    }
    displayedMessageIds.add(msgId);

    // Format time locally
    const messageDate = data.timestamp ? new Date(data.timestamp) : new Date();
    const timeString = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    const username = getStoredUser();
    const isOwn = data.user === username;
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.innerHTML = `
        <div class="message-meta">${isOwn ? 'You' : (data.user || 'Unknown')} • ${timeString}</div>
        ${data.text}
    `;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function clearMessagesUI() {
    const messagesDiv = document.getElementById('messages');
    if (messagesDiv) {
        messagesDiv.innerHTML = '';
        displayedMessageIds.clear();
        // Re-add welcome message
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'message other';
        if (activeChatPartner) {
            welcomeDiv.innerHTML = `<div class="message-meta">System</div>Started conversation with ${activeChatPartner}`;
        } else {
            welcomeDiv.innerHTML = `<div class="message-meta">System</div>Please select a user from the sidebar to start chatting.`;
        }
        messagesDiv.appendChild(welcomeDiv);
    }
}

// User List Management
let usersMap = new Map(); // username -> { status, lastSeen, onlineSince }
let isSidebarOpen = false;

function toggleSidebar() {
    const sidebar = document.getElementById('user-sidebar');
    const toggleBtn = document.getElementById('users-toggle-btn');
    if (!sidebar) return;

    isSidebarOpen = !isSidebarOpen;
    if (isSidebarOpen) {
        sidebar.classList.add('active');
        if (toggleBtn) toggleBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    } else {
        sidebar.classList.remove('active');
        if (toggleBtn) toggleBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    }
}

function updateUserListUI() {
    const userListDiv = document.getElementById('user-list');
    if (!userListDiv) return;

    userListDiv.innerHTML = '';
    const currentUsername = getStoredUser();
    const now = Date.now();

    // Convert map to array and sort (online first, close second)
    const users = Array.from(usersMap.entries()).map(([username, data]) => ({
        username,
        ...data
    })).sort((a, b) => { // Online users first
        const aOnline = a.status === 'online';
        const bOnline = b.status === 'online';
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return a.username.localeCompare(b.username);
    });

    users.forEach(u => {
        // Don't show myself in the contact list (1:1 chat style)
        if (u.username === currentUsername) return;

        const div = document.createElement('div');
        div.className = 'user-item';
        // STYLE: Highlight active chat
        if (activeChatPartner === u.username) {
            div.style.background = 'rgba(255, 255, 255, 0.2)';
            div.style.borderLeft = '3px solid #fff';
        } else {
            div.style.background = 'rgba(255, 255, 255, 0.05)';
        }

        div.style.padding = '0.5rem';
        div.style.marginBottom = '0.5rem';
        div.style.borderRadius = '8px';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '0.5rem';
        div.style.cursor = 'pointer'; // Make clickable

        // CLICK HANDLER: Select user to chat
        // Now explicit via button, but keeping row click for convenience
        div.onclick = () => {
            activeChatPartner = u.username;
            updateChatUIState();
            updateUserListUI(); // Re-render to show highlight
            loadChatHistory();  // Fetch conversation
        };

        const statusColor = u.status === 'online' ? '#22c55e' : '#94a3b8';
        let statusText = 'Offline';
        const options = { hour: '2-digit', minute: '2-digit' };

        if (u.status === 'online') {
            if (u.onlineSince) {
                const mins = Math.floor((now - u.onlineSince) / 60000);
                statusText = mins < 1 ? 'Online' : `Online ${mins}m`;
            } else {
                statusText = 'Online';
            }
        } else {
            if (u.lastSeen) {
                const mins = Math.floor((now - u.lastSeen) / 60000);
                statusText = mins < 60 ? `Seen ${mins}m ago` : `Seen ${new Date(u.lastSeen).toLocaleTimeString([], options)}`;
            }
        }

        div.innerHTML = `
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor};"></div>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">${u.username}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${statusText}</div>
            </div>
            <button class="chat-btn-small" style="background: var(--primary); border: none; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; opacity: 0.8;">Chat</button>
        `;

        // Prevent button click from bubbling if needed, but row click is fine too
        const btn = div.querySelector('button');
        if (btn) {
            btn.onclick = (e) => {
                e.stopPropagation(); // Prevent double trigger
                activeChatPartner = u.username;
                updateChatUIState();
                updateUserListUI();
                loadChatHistory();
            };
        }

        userListDiv.appendChild(div);
    });
}

function updateChatUIState() {
    // Find trigger button text
    const triggerText = document.getElementById('current-chat-user');
    if (triggerText) {
        if (activeChatPartner) {
            triggerText.innerText = `Chatting with ${activeChatPartner}`;
        } else {
            triggerText.innerText = 'Select User';
        }
    }

    // Find header (assume h1 in chat-header) - LEGACY FALLBACK or remove if unused
    const header = document.querySelector('.chat-header h1');
    if (header) {
        // If we still have an H1 (mobile?), update it too
        if (activeChatPartner) {
            header.innerText = `Chatting with ${activeChatPartner}`;
        } else {
            header.innerText = 'Select a user to chat';
        }
    }

    // Update Input/Button State
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    if (messageInput && sendBtn) {
        if (activeChatPartner) {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.placeholder = "Type a message...";
            // Automatically focus input when user selected
            if (document.activeElement !== messageInput) {
                messageInput.focus();
            }
        } else {
            messageInput.disabled = true;
            sendBtn.disabled = true;
            messageInput.placeholder = "Select a user to chat...";
        }
    }

    // Update Input Label (Bottom)
    let recipientLabel = document.getElementById('recipient-label');
    const inputArea = document.querySelector('.chat-input-area');

    if (!recipientLabel && inputArea) {
        // Create label if missing
        recipientLabel = document.createElement('div');
        recipientLabel.id = 'recipient-label';
        recipientLabel.style.width = '100%';
        recipientLabel.style.fontSize = '0.8rem';
        recipientLabel.style.color = 'var(--primary)';
        recipientLabel.style.marginBottom = '8px';
        recipientLabel.style.fontWeight = '600';

        // Insert before current contents
        inputArea.insertBefore(recipientLabel, inputArea.firstChild);

        // Ensure input area stacks vertically
        inputArea.style.flexDirection = 'column';
        inputArea.style.alignItems = 'flex-start';

        // Wrap input and button in a horizontal row
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        if (messageInput && sendBtn) {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.width = '100%';
            wrapper.style.gap = '0.8rem';

            // Move elements into wrapper
            inputArea.appendChild(wrapper);
            wrapper.appendChild(messageInput);
            wrapper.appendChild(sendBtn);
        }
    }

    if (recipientLabel) {
        if (activeChatPartner) {
            recipientLabel.innerText = `Sending to: ${activeChatPartner}`;
            recipientLabel.style.display = 'block';
        } else {
            recipientLabel.innerText = '';
            recipientLabel.style.display = 'none';
        }
    }
}

async function loadChatHistory() {
    clearMessagesUI(); // Clear current view
    const username = getStoredUser();
    if (!username || !activeChatPartner) return;

    // Show loading?

    try {
        const res = await fetch(`/api/messages?username=${username}&targetUser=${activeChatPartner}`);
        if (res.ok) {
            const data = await res.json();
            data.forEach(m => displayMessage(m)); // dedupe handles it, but we cleared anyway
        }
    } catch (e) { console.error('History load failed', e); }
}

function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    if (statusDot && statusText) {
        if (connected) {
            statusDot.style.backgroundColor = '#22c55e';
            statusText.innerText = 'Connected (Real-time)';
        } else {
            // Since we have polling fallback, we aren't "disconnected" from the service
            statusDot.style.backgroundColor = '#eab308'; // Amber for polling
            statusText.innerText = 'API Active (Polling Mode)';
        }
    }
}

// Helper: Get username from LocalStorage to keep user logged in
function getStoredUser() {
    return localStorage.getItem('chat_username');
}

// Wrap in DOMContentLoaded to ensure elements are available
document.addEventListener('DOMContentLoaded', () => {
    // ================================================================
    // LOGIN / REGISTER PAGE LOGIC
    // ================================================================

    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');

    if (loginForm) {
        // Elements
        const loginDiv = document.getElementById('login-form');
        const registerDiv = document.getElementById('register-form');
        const forgotDiv = document.getElementById('forgot-form');

        const showRegisterDetails = document.getElementById('show-register');
        const showLoginDetails = document.getElementById('show-login');
        const showForgotDetails = document.getElementById('show-forgot');
        const backToLoginDetails = document.getElementById('back-to-login');

        const resetForm = document.getElementById('form-reset');

        // Toggles
        showRegisterDetails.addEventListener('click', (e) => {
            e.preventDefault();
            loginDiv.classList.add('hidden');
            forgotDiv.classList.add('hidden');
            registerDiv.classList.remove('hidden');
        });

        showLoginDetails.addEventListener('click', (e) => {
            e.preventDefault();
            registerDiv.classList.add('hidden');
            forgotDiv.classList.add('hidden');
            loginDiv.classList.remove('hidden');
        });

        showForgotDetails.addEventListener('click', (e) => {
            e.preventDefault();
            loginDiv.classList.add('hidden');
            forgotDiv.classList.remove('hidden');
        });

        backToLoginDetails.addEventListener('click', (e) => {
            e.preventDefault();
            forgotDiv.classList.add('hidden');
            loginDiv.classList.remove('hidden');
        });

        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reset-username').value.trim();
            const newPassword = document.getElementById('reset-password').value.trim();

            try {
                const res = await fetch('/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, newPassword })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    alert('Password updated successfully! Please login.');
                    forgotDiv.classList.add('hidden');
                    loginDiv.classList.remove('hidden');
                } else {
                    alert(data.message || 'Reset failed');
                }
            } catch (err) {
                console.error('Reset Error:', err);
                alert('Reset Error: ' + err.message);
            }
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value.trim();

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('Server returned an invalid response');
                }

                const data = await res.json();

                if (res.ok && data.success) {
                    localStorage.setItem('chat_username', data.username);
                    window.location.href = '/chat.html';
                } else {
                    alert(data.message || 'Login failed');
                }
            } catch (err) {
                console.error('Login Error:', err);
                alert('Login Error: ' + err.message);
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value.trim();
            const password = document.getElementById('reg-password').value.trim();

            if (!username || !password) {
                alert('Username and password are required');
                return;
            }

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('Server returned an invalid response (not JSON)');
                }

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Registration failed');
                }

                // VISUAL FEEDBACK: Change button to show success
                const regBtn = registerForm.querySelector('button');
                const originalText = regBtn.innerText;
                regBtn.innerText = 'Account Created! Clicking to Login';
                regBtn.style.backgroundColor = '#22c55e';
                regBtn.type = 'button'; // Prevent re-submit

                // When they click the "Success" button, take them to login
                regBtn.onclick = () => {
                    registerDiv.classList.add('hidden');
                    loginDiv.classList.remove('hidden');
                    // Reset button state
                    regBtn.innerText = originalText;
                    regBtn.style.backgroundColor = '';
                    regBtn.type = 'submit';
                    regBtn.onclick = null;
                };

                // Also auto-switch after 2 seconds if they don't click
                setTimeout(() => {
                    if (!registerDiv.classList.contains('hidden')) {
                        regBtn.click();
                    }
                }, 2500);
            } catch (err) {
                console.error('Registration Error:', err);
                alert('Registration Error: ' + err.message);
            }
        });
    }

    // ================================================================
    // CHAT PAGE LOGIC
    // ================================================================

    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        const username = getStoredUser();
        if (!username) {
            window.location.href = '/index.html';
            return;
        }

        if (socket) {
            // Ensure we join if we have a socket connection already or when it connects
            if (socket.connected) {
                socket.emit('join', username);
            }
        }

        const messagesDiv = document.getElementById('messages');
        const sendBtn = document.getElementById('send-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const clearChatBtn = document.getElementById('clear-chat-btn');
        const toggleUsersBtn = document.getElementById('users-toggle-btn');

        if (toggleUsersBtn) {
            toggleUsersBtn.addEventListener('click', toggleSidebar);
        }

        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', async () => {
                if (!confirm('Are you sure you want to clear your chat history?')) return;

                try {
                    const res = await fetch('/api/clear-chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username })
                    });

                    if (res.ok) {
                        clearMessagesUI();
                    } else {
                        alert('Failed to clear chat');
                    }
                } catch (err) {
                    console.error('Clear Chat Error:', err);
                    alert('Error clearing chat');
                }
            });
        }

        let isSending = false; // Flag to prevent duplicate sends

        async function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            if (!activeChatPartner) {
                alert('Please select a user to chat with first!');
                return;
            }

            // Prevent duplicate sends
            if (isSending) {
                return;
            }

            isSending = true;
            messageInput.value = '';

            // Generate ID on client size (timestamp + random string)
            const clientMsgId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

            // PRIORITY 1: Use Socket.io if connected (real-time, no duplicates)
            if (socket && socket.connected) {
                // Send object with ID explicitly and TO recipient
                socket.emit('chat_message', { text, id: clientMsgId, to: activeChatPartner });
                isSending = false;
            } else {
                // FALLBACK: Use API when socket.io is unavailable
                // Show optimistic message since polling has 3-second delay
                const optimisticMsg = {
                    user: username,
                    text: text,
                    timestamp: Date.now(),
                    id: clientMsgId, // Use the SAME ID
                    to: activeChatPartner
                };
                displayMessage(optimisticMsg);

                try {
                    const res = await fetch('/api/messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, text, clientMsgId, to: activeChatPartner }) // Send ID to server
                    });

                    if (!res.ok) {
                        throw new Error('API failed');
                    }
                } catch (err) {
                    console.error('Failed to send message via API:', err);
                    alert('Failed to send message. Please check your connection.');
                } finally {
                    isSending = false; // Reset flag after API call completes
                }
            }
        }

        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent any default behavior
                sendMessage();
            }
        });

        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('chat_username');
            window.location.href = '/index.html';
        });

        if (socket) {
            socket.on('chat_message', (data) => {
                displayMessage(data);
            });

            socket.on('user_list', (users) => {
                // Initial full list
                users.forEach(u => {
                    usersMap.set(u.username, {
                        status: u.status,
                        lastSeen: u.lastSeen,
                        onlineSince: u.onlineSince
                    });
                });
                updateUserListUI();
            });

            socket.on('status_update', (data) => {
                const { username, status, lastSeen, onlineSince } = data;
                const existing = usersMap.get(username) || {};
                usersMap.set(username, { ...existing, status, lastSeen, onlineSince });
                updateUserListUI();
            });

            socket.on('system_message', (msg) => {
                const div = document.createElement('div');
                div.style.textAlign = 'center';
                div.style.fontSize = '0.8rem';
                div.style.color = '#94a3b8';
                div.style.margin = '1rem 0';
                div.innerText = msg;
                messagesDiv.appendChild(div);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            });
        }

        // --- API POLLING (Fallback when Socket.io is unavailable) ---
        async function pollMessages() {
            // Only poll if socket.io is NOT connected
            if (socket && socket.connected) {
                return; // Skip polling when real-time connection is active
            }

            try {
                // Pass username to filter messages based on lastCleared timestamp
                // AND targetUser (active chat)
                const target = activeChatPartner ? `&targetUser=${encodeURIComponent(activeChatPartner)}` : '';
                const res = await fetch(`/api/messages?username=${encodeURIComponent(username)}${target}`);

                if (res.ok) {
                    const messages = await res.json();
                    messages.forEach(msg => displayMessage(msg));
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }

        // Poll every 3 seconds for new messages (only when socket.io is down)
        setInterval(pollMessages, 3000);
        pollMessages(); // Initial poll

        // Initial UI State Update
        updateChatUIState();
    }

    // ================================================================
    // DROPDOWN USER SELECTION LOGIC
    // ================================================================
    const userSelectBtn = document.getElementById('user-select-btn');
    const userDropdownMenu = document.getElementById('user-dropdown-menu');

    if (userSelectBtn && userDropdownMenu) {
        // Toggle Dropdown
        userSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdownMenu.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', () => {
            userDropdownMenu.classList.add('hidden');
        });

        // Prevent closing when clicking inside menu
        userDropdownMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Wrap the original updateUserListUI to also update the dropdown
    const originalUpdateUserListUI = updateUserListUI;
    updateUserListUI = function () {
        if (typeof originalUpdateUserListUI === 'function') {
            originalUpdateUserListUI();
        }
        updateUserDropdownUI();
    };

    function updateUserDropdownUI() {
        if (!userDropdownMenu) return;

        userDropdownMenu.innerHTML = '';
        const currentUsername = getStoredUser();
        const now = Date.now();

        // Convert map to array and sort (online first, close second)
        const users = Array.from(usersMap.entries()).map(([username, data]) => ({
            username,
            ...data
        })).sort((a, b) => { // Online users first
            const aOnline = a.status === 'online';
            const bOnline = b.status === 'online';
            if (aOnline && !bOnline) return -1;
            if (!aOnline && bOnline) return 1;
            return a.username.localeCompare(b.username);
        });

        users.forEach(u => {
            if (u.username === currentUsername) return;

            const div = document.createElement('div');
            div.className = `dropdown-item ${activeChatPartner === u.username ? 'active' : ''}`;

            const statusColor = u.status === 'online' ? '#22c55e' : '#94a3b8';
            let statusText = 'Offline';
            const options = { hour: '2-digit', minute: '2-digit' };

            if (u.status === 'online') {
                statusText = 'Online';
            } else if (u.lastSeen) {
                const mins = Math.floor((now - u.lastSeen) / 60000);
                statusText = mins < 60 ? `Seen ${mins}m ago` : `Seen ${new Date(u.lastSeen).toLocaleTimeString([], options)}`;
            }

            div.innerHTML = `
                <div class="status-indicator" style="background-color: ${statusColor};"></div>
                <div class="user-info">
                    <span class="username">${u.username}</span>
                    <span class="status-text">${statusText}</span>
                </div>
            `;

            div.onclick = () => {
                activeChatPartner = u.username;
                updateChatUIState();
                updateUserListUI(); // Refreshes both sidebar and dropdown
                loadChatHistory();
                userDropdownMenu.classList.add('hidden'); // Close dropdown
            };

            userDropdownMenu.appendChild(div);
        });

        if (users.length === 0 || (users.length === 1 && users[0].username === currentUsername)) {
            userDropdownMenu.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.9rem;">No other users found</div>';
        }
    }
});
