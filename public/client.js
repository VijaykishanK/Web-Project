// ================================================================
// CLIENT.JS - Client-side Logic (Frontend)
// ================================================================

// Check if file is opened directly
if (location.protocol === 'file:') {
    alert('CRITICAL ERROR: You are opening this file directly in your browser. \n\nYou MUST access this website via the server URL: http://localhost:3000\n\nPlease check the instructions in walkthrough.md');
}

// Initialize Socket.io client connection safely
let socket;
try {
    socket = io();
} catch (e) {
    console.warn('Socket.io library not loaded. Real-time features disabled until connected to server.');
}

// Helper: Get username from LocalStorage to keep user logged in
function getStoredUser() {
    return localStorage.getItem('chat_username');
}

// ================================================================
// LOGIN / REGISTER PAGE LOGIC
// ================================================================

// Get references to DOM elements
const loginForm = document.getElementById('form-login');
const registerForm = document.getElementById('form-register');

// Check if we are on the login page (by checking if loginForm exists)
if (loginForm) {
    const showRegisterDetails = document.getElementById('show-register');
    const showLoginDetails = document.getElementById('show-login');
    const loginDiv = document.getElementById('login-form');
    const registerDiv = document.getElementById('register-form');

    // Toggle to Show Register Form
    showRegisterDetails.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default link behavior
        loginDiv.classList.add('hidden'); // Hide login
        registerDiv.classList.remove('hidden'); // Show register
    });

    // Toggle to Show Login Form
    showLoginDetails.addEventListener('click', (e) => {
        e.preventDefault();
        registerDiv.classList.add('hidden'); // Hide register
        loginDiv.classList.remove('hidden'); // Show login
    });

    // Handle Login Submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent page reload
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();

        try {
            // Send login request to server
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) {
                // If server returns 401 or 400
                const errData = await res.json();
                throw new Error(errData.message || 'Login failed');
            }

            const data = await res.json();
            // If login successful, save username and redirect to chat
            if (data.success) {
                localStorage.setItem('chat_username', data.username);
                window.location.href = '/chat.html';
            } else {
                alert(data.message); // Show error message
            }
        } catch (err) {
            console.error(err);
            alert('Login Error: ' + err.message + '\nMake sure the server is running on http://localhost:3000');
        }
    });

    // Handle Register Submission
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value.trim();

        try {
            // Send register request to server
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (data.success) {
                alert('Registration successful! Please login.');
                registerDiv.classList.add('hidden');
                loginDiv.classList.remove('hidden'); // Switch to login view
            } else {
                alert(data.message);
            }
        } catch (err) {
            console.error(err);
            alert('Registration Error: ' + err.message);
        }
    });
}

// ================================================================
// CHAT PAGE LOGIC
// ================================================================

const messageInput = document.getElementById('message-input');
// Check if we are on the chat page
if (messageInput) {
    const username = getStoredUser();
    // Redirect to login if no user found in local storage
    if (!username) {
        window.location.href = '/index.html';
    }

    // Emit 'join' event to server to announce presence
    if (socket) socket.emit('join', username);

    const messagesDiv = document.getElementById('messages');
    const sendBtn = document.getElementById('send-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // Function to send a message
    function sendMessage() {
        const text = messageInput.value.trim();
        if (text && socket) {
            socket.emit('chat_message', text); // Send message to server
            messageInput.value = ''; // Clear input
        }
    }

    // Send on button click
    sendBtn.addEventListener('click', sendMessage);

    // Send on 'Enter' key press
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Handle Logout
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('chat_username'); // Clear session
        window.location.href = '/index.html'; // Go back to login
    });

    // ============================================================
    // SOCKET EVENT LISTENERS (Receiving Data)
    // ============================================================

    if (socket) {
        // Receive a new chat message
        socket.on('chat_message', (data) => {
            const div = document.createElement('div');
            // Check if message is from me or someone else
            const isOwn = data.user === username;

            // Add styling classes based on sender
            div.className = `message ${isOwn ? 'own' : 'other'}`;
            div.innerHTML = `
                <div class="message-meta">${isOwn ? 'You' : data.user} • ${data.time}</div>
                ${data.text}
            `;

            messagesDiv.appendChild(div);
            messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to bottom
        });

        // Receive system messages (e.g. user joined/left)
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
}
