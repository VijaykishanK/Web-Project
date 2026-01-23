// ================================================================
// API/INDEX.JS - Vercel Serverless Entry Point
// ================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Track online users: socket.id -> username
const onlineUsers = new Map();
// Track user status metadata: username -> { lastSeen: timestamp, onlineSince: timestamp }
const userStatus = new Map();

// detect if running on Vercel
const IS_VERCEL = process.env.VERCEL === '1';

// Path to users.json
// On Vercel, we MUST use /tmp for write access.
// We also need to copy the seed file there if it doesn't exist.
const SEED_FILE = path.join(process.cwd(), 'users.json');
const USERS_FILE = IS_VERCEL ? '/tmp/users.json' : SEED_FILE;

// Initialize Storage (Copy seed to /tmp if needed)
if (IS_VERCEL) {
    if (!fs.existsSync(USERS_FILE)) {
        try {
            if (fs.existsSync(SEED_FILE)) {
                fs.copyFileSync(SEED_FILE, USERS_FILE);
                console.log('Copied seed users.json to /tmp');
            } else {
                fs.writeFileSync(USERS_FILE, '[]');
                console.log('Created empty users.json in /tmp');
            }
        } catch (e) {
            console.error('Failed to initialize /tmp storage:', e);
        }
    }
}

app.use(express.static('public'));
app.use(express.json());

function getUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            return [];
        }
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading users.json:', err.message);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('CRITICAL ERROR: Failed to save users.json:', err.message);
    }
}

// API ROUTES
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    console.log('Register attempt:', username);

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const users = getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    users.push({ username, password, lastCleared: 0 });
    saveUsers(users);

    console.log('User registered success:', username);
    res.json({ success: true, message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (user) {
        res.json({ success: true, username: user.username });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/reset-password', (req, res) => {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
        return res.status(400).json({ success: false, message: 'Username and new password required' });
    }

    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (user) {
        user.password = newPassword;
        saveUsers(users);
        res.json({ success: true, message: 'Password reset successful' });
    } else {
        res.status(404).json({ success: false, message: 'Username not found' });
    }
});

app.post('/api/clear-chat', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Username required' });

    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (user) {
        user.lastCleared = Date.now();
        saveUsers(users);
        res.json({ success: true, message: 'Chat history cleared' });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

app.post('/api/delete-account', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const users = getUsers();
    const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (userIndex !== -1) {
        users.splice(userIndex, 1);
        saveUsers(users);
        if (userStatus.has(username)) userStatus.delete(username);
        res.json({ success: true, message: 'Account deleted successfully' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// In-memory message store for polling fallback (Vercel compatible)
let messages = [];

// API: Get User List (Fallback/Polling)
app.get('/api/users', (req, res) => {
    const users = getUsers(); // Read fresh from file
    const now = Date.now();

    // enhance with status
    const publicUsers = users.map(u => {
        const statusMeta = userStatus.get(u.username) || {};
        // Consider online if active in last 30 seconds
        const isOnline = statusMeta.lastActive && (now - statusMeta.lastActive < 30000);

        return {
            username: u.username,
            status: isOnline ? 'online' : 'offline',
            lastSeen: statusMeta.lastActive || null,
            onlineSince: isOnline ? statusMeta.onlineSince : null
        };
    });

    res.json(publicUsers);
});

// HEARTBEAT ENDPOINT (For Vercel-compatible online status)
app.post('/api/heartbeat', (req, res) => {
    const { username } = req.body;
    if (username) {
        const currentStatus = userStatus.get(username) || {};
        userStatus.set(username, {
            ...currentStatus,
            lastActive: Date.now(),
            onlineSince: currentStatus.onlineSince || Date.now()
        });
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false });
    }
});

app.get('/api/messages', (req, res) => {
    const { username, targetUser } = req.query;

    // Filter messages for privacy
    // If username is provided, show:
    // 1. Messages SENT by username
    // 2. Messages SENT TO username
    // 3. Public messages (to: null/undefined) - (if we supported them, but now request is private)

    let resultMessages = messages;
    if (username) {
        // First filter by persistence/clear
        const users = getUsers();
        const user = users.find(u => u.username === username);
        if (user && user.lastCleared) {
            resultMessages = resultMessages.filter(m => m.timestamp > user.lastCleared);
        }

        // Then filter by conversation partner if specified
        if (targetUser) {
            resultMessages = resultMessages.filter(m =>
                (m.user === username && m.to === targetUser) ||
                (m.user === targetUser && m.to === username)
            );
        } else {
            // General fetch (e.g. on load?): Return ALL messages relevant to me?
            // User asked: "messages should not be visible to everyone".
            // So we strictly return messages where (user == me OR to == me).
            resultMessages = resultMessages.filter(m => m.user === username || m.to === username);
        }
    }

    res.json(resultMessages);
});

app.post('/api/messages', (req, res) => {
    const { username, text, clientMsgId, to } = req.body; // Accept ID and 'to' from client
    if (!username || !text) {
        return res.status(400).json({ success: false, message: 'Missing username or text' });
    }

    // Use client provided ID if available, otherwise generate one (fallback)
    const msgId = clientMsgId || (Date.now() + Math.random());

    const newMessage = {
        user: username,
        text: text,
        timestamp: Date.now(),
        id: msgId,
        to: to // Store recipient
    };

    // Check if we already have this message (deduplication on server side)
    if (!messages.find(m => m.id === newMessage.id)) {
        messages.push(newMessage);
        // Limit to last 100 messages
        if (messages.length > 1000) messages.shift(); // Increase limit for multi-user chat history
    }

    // NOTE: We do NOT emit via socket.io here to avoid duplicates.
    // The socket.io 'chat_message' handler will handle real-time broadcasting.
    // This API endpoint is purely for fallback/polling when socket.io is unavailable.

    res.json({ success: true, message: newMessage });
});

app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'API route not found' });
});

// Socket.io logic
io.on('connection', (socket) => {
    console.log('New socket connection:', socket.id);

    socket.on('join', (username) => {
        socket.username = username;
        // Don't rely solely on socket for online status but update it here too
        const currentStatus = userStatus.get(username) || {};
        userStatus.set(username, { ...currentStatus, lastActive: Date.now(), onlineSince: currentStatus.onlineSince || Date.now() });

        console.log(`User ${username} joined (ID: ${socket.id})`);

        // Send user list based on Heartbeat status
        const now = Date.now();
        const allUsers = getUsers().map(u => {
            const statusMeta = userStatus.get(u.username) || {};
            // Consider online if active in last 30 seconds
            const isOnline = statusMeta.lastActive && (now - statusMeta.lastActive < 30000);
            return {
                username: u.username,
                status: isOnline ? 'online' : 'offline',
                lastSeen: statusMeta.lastActive || null,
                onlineSince: isOnline ? statusMeta.onlineSince : null
            };
        });
        socket.emit('user_list', allUsers);

        // Notify others that a user is potentially active (optional, heartbeat does this periodically)
        // socket.broadcast.emit('system_message', `${username} has joined the chat`);
    });

    socket.on('chat_message', (payload) => {
        // Payload can be string (old client) or object { text, id, to }
        const msgText = typeof payload === 'object' ? payload.text : payload;
        const msgId = typeof payload === 'object' ? payload.id : (Date.now() + Math.random());
        const msgTo = typeof payload === 'object' ? payload.to : null;

        console.log(`Message from ${socket.username} to ${msgTo}: ${msgText}`);

        const newMessage = {
            user: socket.username,
            text: msgText,
            timestamp: Date.now(),
            id: msgId,
            to: msgTo
        };

        // Save
        if (!messages.find(m => m.id === newMessage.id)) {
            messages.push(newMessage);
            if (messages.length > 1000) messages.shift();
        }

        // Broadcast to all (Clients filter) - Most reliable for Vercel
        io.emit('chat_message', newMessage);
    });

    socket.on('disconnect', (reason) => {
        console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
        if (socket.username) {
            onlineUsers.delete(socket.id);
            userStatus.set(socket.username, { lastSeen: Date.now() });

            // Broadcast offline status
            io.emit('status_update', {
                username: socket.username,
                status: 'offline',
                lastSeen: Date.now()
            });

            // Only send system message if they are truly gone (not just a refresh which might reconnect quickly, but simple logic for now)
            io.emit('system_message', `${socket.username} has left the chat`);
        }
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });
});

// Export the app for Vercel
module.exports = app;

// Local development support
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`CRITICAL ERROR: Port ${PORT} is already in use.`);
            console.error('The server cannot start. Please stop any other process running on this port.');
            process.exit(1);
        } else {
            console.error('SERVER ERROR:', err);
        }
    });
}
