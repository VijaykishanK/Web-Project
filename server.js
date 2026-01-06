// ================================================================
// SERVER.JS - Main Backend Entry Point
// ================================================================

// 1. Import necessary Node.js modules
const express = require('express');       // Framework for building the web server
const http = require('http');             // Standard HTTP module to work with Socket.io
const { Server } = require('socket.io');  // Library for real-time, bi-directional communication
const fs = require('fs');                 // File System module to read/write files (for users.json)
const path = require('path');             // Utility to work with file paths

// 2. Initialize the Application
const app = express();                    // Create the Express app
const server = http.createServer(app);    // Create an HTTP server using the Express app
const io = new Server(server);            // Initialize Socket.io on this HTTP server

// Path to the file where user data is stored
const USERS_FILE = path.join(__dirname, 'users.json');

// 3. Middlewares
// Serve static files (HTML, CSS, JS) from the 'public' folder directly
app.use(express.static('public'));
// Parse JSON bodies (needed for receiving data from login/register forms)
app.use(express.json());

// ================================================================
// DATA HANDLING (Simple File-based Database)
// ================================================================

// Helper function: Read users from the JSON file
// Returns: Array of user objects
function getUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        // If file doesn't exist or error, return empty array
        return [];
    }
}

// Helper function: Save users array back to the JSON file
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ================================================================
// API ROUTES (Authentication)
// ================================================================

// Route: Register a new user
// POST /api/register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body; // Extract data from request body

    console.log('Register attempt:', username);

    // Validation: Check if fields are empty
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const users = getUsers(); // Get current list of users

    // Validation: Check if username already exists
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    // Save new user (SECURITY NOTE: In a real app, never save plain text passwords! Use bcrypt.)
    users.push({ username, password });
    saveUsers(users);

    console.log('User registered:', username);
    // Send success response
    res.json({ success: true, message: 'Registration successful' });
});

// Route: Login a user
// POST /api/login
app.post('/api/login', (req, res) => {
    console.log('Login attempt received:', req.body); // DEBUG LOG
    const { username, password } = req.body;
    const users = getUsers();
    console.log(`Loaded ${users.length} users.`); // DEBUG LOG

    // Find user matching both username and password
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        console.log('Login success for:', username); // DEBUG LOG
        // Login successful
        res.json({ success: true, username: user.username });
    } else {
        console.log('Login failed: Invalid credentials'); // DEBUG LOG
        // Login failed
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// ================================================================
// REAL-TIME CHAT LOGIC (Socket.io)
// ================================================================

io.on('connection', (socket) => {
    console.log('A user connected'); // Log when a client connects

    // Event: User joins the chat
    socket.on('join', (username) => {
        socket.username = username; // Attach username to the socket session
        // Broadcast to everyone ELSE that a user joined
        io.emit('system_message', `${username} has joined the chat`);
    });

    // Event: User sends a message
    socket.on('chat_message', (msg) => {
        // Broadcast the message object to ALL connected users
        io.emit('chat_message', {
            user: socket.username,
            text: msg,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // Event: User disconnects (closes tab/browser)
    socket.on('disconnect', () => {
        if (socket.username) {
            // Notify others
            io.emit('system_message', `${socket.username} has left the chat`);
        }
    });
});

// ================================================================
// START SERVER
// ================================================================
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
