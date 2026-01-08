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

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', v: '1.1', timestamp: new Date().toISOString() });
});

app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'API route not found' });
});

// Socket.io logic
io.on('connection', (socket) => {
    socket.on('join', (username) => {
        socket.username = username;
        socket.broadcast.emit('system_message', `${username} has joined the chat`);
        socket.emit('system_message', `Welcome to PEACE CHAT, ${username}!`);
    });

    socket.on('chat_message', (msg) => {
        io.emit('chat_message', {
            user: socket.username,
            text: msg,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('system_message', `${socket.username} has left the chat`);
        }
    });
});

// Export the app for Vercel
module.exports = app;

// Local development support
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
