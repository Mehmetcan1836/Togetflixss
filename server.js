const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["*"]
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling']
});

const path = require('path');
const PORT = process.env.PORT || 3000;
const { v4: uuidv4 } = require('uuid');

// Store active rooms and users
const rooms = new Map();
const users = new Map();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// API Routes
app.post('/api/rooms', (req, res) => {
    try {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const room = {
            id: roomId,
            users: new Set(),
            messages: [],
            createdAt: Date.now()
        };
        rooms.set(roomId, room);
        console.log('Room created:', roomId);
        res.json({ roomId, created: true });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

app.get('/api/rooms/:roomId', (req, res) => {
    try {
        const { roomId } = req.params;
        const room = rooms.get(roomId);
        if (room) {
            const roomUsers = Array.from(room.users)
                .map(userId => users.get(userId))
                .filter(Boolean);
            res.json({ 
                exists: true, 
                users: roomUsers,
                messages: room.messages
            });
        } else {
            res.status(404).json({ exists: false });
        }
    } catch (error) {
        console.error('Error getting room:', error);
        res.status(500).json({ error: 'Failed to get room info' });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle room routes
app.get('/room/:roomId', (req, res) => {
    const { roomId } = req.params;
    console.log('Accessing room:', roomId);
    
    // Validate room ID format
    if (!/^[A-Z0-9]{6}$/.test(roomId)) {
        console.log('Invalid room ID format:', roomId);
        return res.redirect('/');
    }
    
    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
        console.log('Creating new room:', roomId);
        rooms.set(roomId, {
            id: roomId,
            users: new Set(),
            messages: [],
            createdAt: Date.now()
        });
    }
    
    // Send room.html file
    const roomHtmlPath = path.join(__dirname, 'public', 'room.html');
    console.log('Serving room.html from:', roomHtmlPath);
    res.sendFile(roomHtmlPath);
});

// Catch-all route for static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

// Socket.IO connection handling
io.on('connection', socket => {
    let currentUser = null;
    let currentRoom = null;

    socket.on('join-room', ({ roomId, username }) => {
        try {
            // Generate a unique user ID
            const userId = uuidv4();
            
            // Create user object
            const user = {
                id: userId,
                name: username || generateUsername(),
                roomId: roomId
            };
            
            // Store user
            users.set(userId, user);
            currentUser = user;
            
            // Initialize room if it doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                    id: roomId,
                    users: new Map(),
                    messages: []
                });
            }
            
            currentRoom = rooms.get(roomId);
            currentRoom.users.set(userId, user);
            
            // Join socket room
            socket.join(roomId);
            
            // Send room state to the user
            socket.emit('room-joined', {
                user: user,
                roomState: {
                    users: Array.from(currentRoom.users.values()),
                    messages: currentRoom.messages
                }
            });
            
            // Notify others
            socket.to(roomId).emit('user-connected', user);
            
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on('send-message', ({ message }) => {
        if (!currentUser || !currentRoom) return;

        const messageData = {
            id: uuidv4(),
            userId: currentUser.id,
            username: currentUser.name,
            content: message,
            timestamp: Date.now()
        };

        currentRoom.messages.push(messageData);
        io.to(currentUser.roomId).emit('chat-message', messageData);
    });

    socket.on('start-typing', () => {
        if (!currentUser || !currentRoom) return;
        socket.to(currentUser.roomId).emit('user-typing', currentUser.id);
    });

    socket.on('stop-typing', () => {
        if (!currentUser || !currentRoom) return;
        socket.to(currentUser.roomId).emit('user-typing-stop', currentUser.id);
    });

    socket.on('disconnect', () => {
        try {
            if (currentUser && currentRoom) {
                // Remove user from room
                currentRoom.users.delete(currentUser.id);
                
                // Notify others
                socket.to(currentUser.roomId).emit('user-disconnected', currentUser.id);
                
                // Clean up empty room
                if (currentRoom.users.size === 0) {
                    rooms.delete(currentRoom.id);
                }
                
                // Remove user
                users.delete(currentUser.id);
            }
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Generate random username
function generateUsername() {
    const adjectives = ['Happy', 'Lucky', 'Sunny', 'Clever', 'Swift'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Lion'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Server shut down');
    });
});

module.exports = app;