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

// Path to users.json - Use /tmp for limited write access if needed, 
// but for now, we'll try to read from the project root.
// Note: Writes to process.cwd() will NOT persist on Vercel.
const USERS_FILE = path.join(process.cwd(), 'users.json');

app.use(express.static('public'));
app.use(express.json());

function getUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            console.log('users.json not found, returning empty array');
            return [];
        }
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading or parsing users.json:', err.message);
        return [];
    }
}

function saveUsers(users) {
    try {
        // NOTE: This will fail on Vercel production but work locally.
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
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    users.push({ username, password });
    saveUsers(users);

    console.log('User registered success:', username);
    res.json({ success: true, message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

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
    const user = users.find(u => u.username === username);

    if (user) {
        user.password = newPassword;
        saveUsers(users);
        res.json({ success: true, message: 'Password reset successful' });
    } else {
        res.status(404).json({ success: false, message: 'Username not found' });
    }
});

// In-memory message store for polling fallback (Vercel compatible)
let messages = [];

app.get('/api/messages', (req, res) => {
    res.json(messages);
});

app.post('/api/messages', (req, res) => {
    const { username, text } = req.body;
    if (!username || !text) {
        return res.status(400).json({ success: false, message: 'Missing username or text' });
    }

    const newMessage = {
        user: username,
        text: text,
        timestamp: Date.now(),
        id: Date.now() + Math.random()
    };

    messages.push(newMessage);

    // Limit to last 100 messages
    if (messages.length > 100) messages.shift();

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
        console.log(`User ${username} joined (ID: ${socket.id})`);
        socket.broadcast.emit('system_message', `${username} has joined the chat`);
        socket.emit('system_message', `Welcome to PEACE CHAT, ${username}!`);
    });

    socket.on('chat_message', (msg) => {
        console.log(`Message from ${socket.username}: ${msg}`);
        const newMessage = {
            user: socket.username,
            text: msg,
            timestamp: Date.now(),
            id: Date.now() + Math.random()
        };

        // Save to in-memory store for polling clients
        messages.push(newMessage);
        if (messages.length > 100) messages.shift();

        // Send to ALL clients including sender
        // Using io.emit ensures everyone gets the message exactly once
        io.emit('chat_message', newMessage);
    });

    socket.on('disconnect', (reason) => {
        console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
        if (socket.username) {
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
