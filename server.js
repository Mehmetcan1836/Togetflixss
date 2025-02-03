const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["*"],
        credentials: true
    },
    transports: ['polling', 'websocket']
});

const path = require('path');

// Store active rooms and users
const rooms = new Map();
const users = new Map();

// Middleware
app.use(express.static('public'));
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// API Routes
app.post('/api/rooms', (req, res) => {
    try {
        const roomId = generateRoomId();
        rooms.set(roomId, {
            users: new Set(),
            screenSharer: null,
            createdAt: Date.now()
        });
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
            res.json({ exists: true, users: roomUsers });
        } else {
            res.status(404).json({ exists: false });
        }
    } catch (error) {
        console.error('Error getting room:', error);
        res.status(500).json({ error: 'Failed to get room info' });
    }
});

// Socket connection handling
io.on('connection', socket => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        try {
            // Create user if doesn't exist
            if (!users.has(userId)) {
                users.set(userId, {
                    id: userId,
                    socketId: socket.id,
                    name: `User ${Math.random().toString(36).substring(2, 6)}`,
                    avatar: `https://api.dicebear.com/6.x/adventurer/svg?seed=${userId}`,
                    roomId: roomId
                });
            }

            const user = users.get(userId);

            // Initialize room if doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                    users: new Set(),
                    screenSharer: null
                });
            }

            // Add user to room
            const room = rooms.get(roomId);
            room.users.add(userId);
            socket.join(roomId);

            // Broadcast to others in room
            socket.to(roomId).emit('user-connected', user);

            // Send current users in room to the new user
            const roomUsers = Array.from(room.users)
                .map(id => users.get(id))
                .filter(Boolean);

            socket.emit('room-users', roomUsers);

            // Handle screen sharing
            socket.on('screen-sharing-started', stream => {
                if (room) {
                    room.screenSharer = userId;
                    socket.to(roomId).emit('user-screen-share', userId, stream);
                }
            });

            socket.on('screen-sharing-stopped', () => {
                if (room && room.screenSharer === userId) {
                    room.screenSharer = null;
                    socket.to(roomId).emit('user-screen-share-stopped', userId);
                }
            });

        } catch (error) {
            console.error('Error in join-room:', error);
            socket.emit('error', 'Failed to join room');
        }
    });

    socket.on('disconnect', () => {
        try {
            // Find and remove user from their room
            for (const [roomId, room] of rooms.entries()) {
                for (const userId of room.users) {
                    const user = users.get(userId);
                    if (user && user.socketId === socket.id) {
                        room.users.delete(userId);
                        io.to(roomId).emit('user-disconnected', userId);
                        users.delete(userId);
                        
                        // Clean up empty rooms
                        if (room.users.size === 0) {
                            rooms.delete(roomId);
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});