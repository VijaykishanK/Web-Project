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

    // Deduplicate based on unique attributes if ID is missing, or use ID
    const msgId = data.id || `${data.user}-${data.text}-${data.time}`;
    if (displayedMessageIds.has(msgId)) return;
    displayedMessageIds.add(msgId);

    const div = document.createElement('div');
    const username = getStoredUser();
    const isOwn = data.user === username;
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.innerHTML = `
        <div class="message-meta">${isOwn ? 'You' : (data.user || 'Unknown')} • ${data.time}</div>
        ${data.text}
    `;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
        const showRegisterDetails = document.getElementById('show-register');
        const showLoginDetails = document.getElementById('show-login');
        const loginDiv = document.getElementById('login-form');
        const registerDiv = document.getElementById('register-form');

        showRegisterDetails.addEventListener('click', (e) => {
            e.preventDefault();
            loginDiv.classList.add('hidden');
            registerDiv.classList.remove('hidden');
        });

        showLoginDetails.addEventListener('click', (e) => {
            e.preventDefault();
            registerDiv.classList.add('hidden');
            loginDiv.classList.remove('hidden');
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

        async function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            // Try sending via API (more reliable on Vercel)
            try {
                const res = await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, text })
                });

                if (res.ok) {
                    messageInput.value = '';
                    const data = await res.json();
                    if (data.success) {
                        displayMessage(data.message);
                    }
                } else {
                    throw new Error('API failed');
                }
            } catch (err) {
                console.warn('API send failed, falling back to socket:', err);
                if (socket && socket.connected) {
                    socket.emit('chat_message', text);
                    messageInput.value = '';
                } else {
                    alert('Connection lost. Please try again in a moment.');
                }
            }
        }

        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('chat_username');
            window.location.href = '/index.html';
        });

        if (socket) {
            socket.on('chat_message', (data) => {
                displayMessage(data);
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

        // --- API POLLING (Vercel Fix) ---
        async function pollMessages() {
            try {
                const res = await fetch('/api/messages');
                if (res.ok) {
                    const messages = await res.json();
                    messages.forEach(msg => displayMessage(msg));
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }

        // Poll every 3 seconds for new messages
        setInterval(pollMessages, 3000);
        pollMessages(); // Initial poll
    }
});
