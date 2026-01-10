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

function displayMessage(data) {
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) return;

    // Deduplicate based on ID
    const msgId = data.id || `${data.user}-${data.text}-${data.timestamp}`;

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
        welcomeDiv.innerHTML = `<div class="message-meta">System</div>Welcome to the chat!`;
        messagesDiv.appendChild(welcomeDiv);
    }
}

// User List Management
let usersMap = new Map(); // username -> { status, lastSeen }

function updateUserListUI() {
    const userListDiv = document.getElementById('user-list');
    if (!userListDiv) return;

    userListDiv.innerHTML = '';

    const currentUsername = getStoredUser();

    // Convert map to array and sort (online first, then by name)
    const users = Array.from(usersMap.entries()).map(([username, data]) => ({
        username,
        ...data
    })).sort((a, b) => {
        if (a.status === b.status) return a.username.localeCompare(b.username);
        return a.status === 'online' ? -1 : 1;
    });

    users.forEach(u => {
        const isMe = u.username === currentUsername;
        const div = document.createElement('div');
        div.className = 'user-item';
        div.style.padding = '0.5rem';
        div.style.marginBottom = '0.5rem';
        div.style.borderRadius = '8px';
        div.style.background = 'rgba(255, 255, 255, 0.05)';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '0.5rem';

        const statusColor = u.status === 'online' ? '#22c55e' : '#94a3b8';
        const statusText = u.status === 'online'
            ? 'Online'
            : (u.lastSeen ? `Last seen: ${new Date(u.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline');

        div.innerHTML = `
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor};"></div>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">${u.username} ${isMe ? '(You)' : ''}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${statusText}</div>
            </div>
        `;
        userListDiv.appendChild(div);
    });
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
            socket.emit('join', username);
        }

        const messagesDiv = document.getElementById('messages');
        const sendBtn = document.getElementById('send-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const clearChatBtn = document.getElementById('clear-chat-btn');

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

            // Prevent duplicate sends
            if (isSending) {
                return;
            }

            isSending = true;
            messageInput.value = '';

            // PRIORITY 1: Use Socket.io if connected (real-time, no duplicates)
            if (socket && socket.connected) {
                socket.emit('chat_message', text);
                // No optimistic display needed - socket.io is fast enough
                // and we'll receive the message back via the 'chat_message' event
                isSending = false; // Reset flag immediately for socket.io
            } else {
                // FALLBACK: Use API when socket.io is unavailable
                // Show optimistic message since polling has 3-second delay
                const optimisticMsg = {
                    user: username,
                    text: text,
                    timestamp: Date.now(),
                    id: 'opt-' + Date.now() + Math.random()
                };
                displayMessage(optimisticMsg);

                try {
                    const res = await fetch('/api/messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, text })
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
                    usersMap.set(u.username, { status: u.status, lastSeen: u.lastSeen });
                });
                updateUserListUI();
            });

            socket.on('status_update', (data) => {
                const { username, status, lastSeen } = data;
                const existing = usersMap.get(username) || {};
                usersMap.set(username, { ...existing, status, lastSeen });
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
                const res = await fetch(`/api/messages?username=${encodeURIComponent(username)}`);
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
    }
});
