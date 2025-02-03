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
    path: '/socket.io/',
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 5000,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e8,
    transports: ['websocket', 'polling']
});

const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Store active rooms and users with error handling
class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.users = new Map();
    }

    createRoom(roomId) {
        if (!roomId) throw new Error('Room ID is required');
        if (this.rooms.has(roomId)) return false;
        
        this.rooms.set(roomId, {
            id: roomId,
            users: new Set(),
            screenSharer: null,
            createdAt: Date.now()
        });
        return true;
    }

    addUserToRoom(roomId, userId, socket) {
        if (!this.rooms.has(roomId)) {
            this.createRoom(roomId);
        }

        const room = this.rooms.get(roomId);
        room.users.add(userId);

        const user = {
            id: userId,
            socketId: socket.id,
            name: this.generateUsername(),
            avatar: this.getRandomAvatar(),
            joinedAt: Date.now()
        };

        this.users.set(userId, user);
        return user;
    }

    removeUserFromRoom(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.users.delete(userId);
            if (room.users.size === 0) {
                this.rooms.delete(roomId);
            }
            return true;
        }
        return false;
    }

    getRoomUsers(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return [];
        
        return Array.from(room.users)
            .map(userId => this.users.get(userId))
            .filter(Boolean);
    }

    getRandomAvatar() {
        const avatarTypes = ['adventurer', 'adventurer-neutral', 'avataaars', 'big-ears', 'big-ears-neutral', 'big-smile'];
        const type = avatarTypes[Math.floor(Math.random() * avatarTypes.length)];
        return `https://api.dicebear.com/6.x/${type}/svg?seed=${uuidv4()}`;
    }

    generateUsername() {
        const adjectives = ['Happy', 'Lucky', 'Sunny', 'Clever', 'Swift', 'Bright', 'Cool', 'Smart'];
        const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Lion', 'Fox', 'Wolf', 'Bear'];
        return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
    }

    cleanup() {
        const now = Date.now();
        const timeout = 24 * 60 * 60 * 1000; // 24 hours

        for (const [roomId, room] of this.rooms.entries()) {
            if (now - room.createdAt > timeout) {
                this.rooms.delete(roomId);
            }
        }
    }
}

const roomManager = new RoomManager();

// Middleware
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Socket.IO error handling
io.engine.on("connection_error", (err) => {
    console.error('Connection error:', err);
});

// Socket connection handling
io.on('connection', socket => {
    console.log('User connected:', socket.id);

    socket.on('join-room', async (roomId, userId) => {
        try {
            const user = roomManager.addUserToRoom(roomId, userId, socket);
            socket.join(roomId);

            // Send room users to the new user
            socket.emit('room-users', roomManager.getRoomUsers(roomId));

            // Notify others
            socket.to(roomId).emit('user-connected', user);

            // Handle screen sharing
            socket.on('screen-sharing-started', stream => {
                const room = roomManager.rooms.get(roomId);
                if (room) {
                    room.screenSharer = userId;
                    socket.to(roomId).emit('user-screen-share', userId, stream);
                }
            });

            socket.on('screen-sharing-stopped', () => {
                const room = roomManager.rooms.get(roomId);
                if (room && room.screenSharer === userId) {
                    room.screenSharer = null;
                    socket.to(roomId).emit('user-screen-share-stopped', userId);
                }
            });

            // Handle chat messages
            socket.on('chat-message', message => {
                const user = roomManager.users.get(userId);
                if (user) {
                    io.to(roomId).emit('chat-message', {
                        userId,
                        userName: user.name,
                        message,
                        timestamp: Date.now()
                    });
                }
            });

        } catch (error) {
            console.error('Error in join-room:', error);
            socket.emit('error', error.message);
        }
    });

    socket.on('disconnect', () => {
        try {
            for (const [roomId, room] of roomManager.rooms.entries()) {
                for (const userId of room.users) {
                    const user = roomManager.users.get(userId);
                    if (user && user.socketId === socket.id) {
                        roomManager.removeUserFromRoom(roomId, userId);
                        roomManager.users.delete(userId);
                        io.to(roomId).emit('user-disconnected', userId);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });
});

// Clean up old rooms periodically
setInterval(() => {
    try {
        roomManager.cleanup();
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}, 60 * 60 * 1000); // Every hour

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// API Routes
app.post('/api/rooms', (req, res) => {
    try {
        const roomId = uuidv4();
        const created = roomManager.createRoom(roomId);
        res.json({ roomId, created });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rooms/:roomId', (req, res) => {
    try {
        const { roomId } = req.params;
        const users = roomManager.getRoomUsers(roomId);
        res.json({ exists: users.length > 0, users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});