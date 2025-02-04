const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: ["https://togetflix-mehmetcan1836s-projects.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["*"]
    },
    transports: ['polling', 'websocket'],
    path: '/socket.io/',
    pingTimeout: 60000,
    pingInterval: 25000,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

const path = require('path');
const PORT = process.env.PORT || 3000;

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

// Generate random username
function generateUsername() {
    const adjectives = ['Happy', 'Lucky', 'Sunny', 'Clever', 'Swift', 'Bright', 'Cool', 'Smart'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Lion', 'Fox', 'Wolf', 'Bear'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

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

// Socket connection handling
io.on('connection', socket => {
    console.log('User connected:', socket.id);
    
    socket.on('join-room', (roomId, userId) => {
        try {
            console.log('User joining room:', { roomId, userId });
            
            // Create user if doesn't exist
            if (!users.has(userId)) {
                users.set(userId, {
                    id: userId,
                    socketId: socket.id,
                    name: generateUsername(),
                    roomId: roomId
                });
            }

            const user = users.get(userId);
            user.socketId = socket.id;
            user.roomId = roomId;

            // Initialize room if doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                    id: roomId,
                    users: new Set(),
                    messages: []
                });
            }

            const room = rooms.get(roomId);
            room.users.add(userId);
            socket.join(roomId);

            // Send current room state
            socket.emit('room-state', {
                users: Array.from(room.users).map(id => users.get(id)),
                messages: room.messages
            });

            // Broadcast to others
            socket.to(roomId).emit('user-connected', user);
        } catch (error) {
            console.error('Error joining room:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Find and clean up user
        for (const [userId, user] of users.entries()) {
            if (user.socketId === socket.id) {
                const room = rooms.get(user.roomId);
                if (room) {
                    room.users.delete(userId);
                    socket.to(user.roomId).emit('user-disconnected', userId);
                    
                    if (room.users.size === 0) {
                        rooms.delete(user.roomId);
                    }
                }
                users.delete(userId);
                break;
            }
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});