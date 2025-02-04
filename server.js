const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: ["http://localhost:3000", "https://togetflix-mehmetcan1836s-projects.vercel.app"],
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["my-custom-header"]
    }
});
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const PORT = process.env.PORT || 3000;

// CORS yapılandırması
app.use(cors({
    origin: ["http://localhost:3000", "https://togetflix-mehmetcan1836s-projects.vercel.app"],
    credentials: true
}));

// Store active rooms and users
const rooms = new Map();
const users = new Map();

// Room permissions
const PERMISSIONS = {
    SCREEN_SHARE: 'screenShare',
    YOUTUBE_CONTROL: 'youtubeControl'
};

// Middleware
app.use(express.json());

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        // Add cache control for better performance
        res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
}));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/rooms', (req, res) => {
    const roomId = uuidv4().substring(0, 8);
    rooms.set(roomId, {
        id: roomId,
        users: new Map(),
        messages: [],
        created: Date.now(),
        moderator: null,
        youtube: {
            videoId: null,
            state: 'paused',
            timestamp: 0,
            volume: 100
        },
        permissions: new Map()
    });
    res.json({ roomId });
});

app.get('/room/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            users: new Map(),
            messages: [],
            created: Date.now(),
            moderator: null,
            youtube: {
                videoId: null,
                state: 'paused',
                timestamp: 0,
                volume: 100
            },
            permissions: new Map()
        });
    }
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Socket.IO connection handling
io.on('connection', socket => {
    let currentUser = null;
    let currentRoom = null;

    socket.on('join-room', async ({ roomId, username }) => {
        try {
            if (!roomId) {
                socket.emit('error', { message: 'Room ID is required' });
                return;
            }

            // Create room if it doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                    id: roomId,
                    users: new Map(),
                    messages: [],
                    created: Date.now(),
                    moderator: null,
                    youtube: {
                        videoId: null,
                        state: 'paused',
                        timestamp: 0,
                        volume: 100
                    },
                    permissions: new Map()
                });
            }

            const room = rooms.get(roomId);

            // Create user object
            currentUser = {
                id: socket.id,
                name: username,
                media: {
                    video: false,
                    audio: false,
                    screen: false
                }
            };

            // Add user to room
            room.users.set(socket.id, currentUser);
            currentRoom = room;

            // Join socket room
            socket.join(roomId);

            // Notify all users in room
            io.to(roomId).emit('room-joined', {
                user: currentUser,
                participants: Array.from(room.users.values())
            });

            // Send room state to new user
            socket.emit('room-state', {
                youtube: room.youtube,
                participants: Array.from(room.users.values()),
                messages: room.messages
            });
        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on('chat-message', (message) => {
        if (currentUser && currentRoom) {
            const messageData = {
                user: currentUser,
                message,
                timestamp: Date.now()
            };
            currentRoom.messages.push(messageData);
            io.to(currentRoom.id).emit('chat-message', messageData);
        }
    });

    socket.on('media-state-change', (data) => {
        if (currentUser && currentRoom) {
            currentUser.media[data.type] = data.enabled;
            io.to(currentRoom.id).emit('media-state-change', {
                userId: currentUser.id,
                type: data.type,
                enabled: data.enabled
            });
        }
    });

    socket.on('disconnect', () => {
        if (currentUser && currentRoom) {
            // Remove user from room
            currentRoom.users.delete(socket.id);
            
            // Notify others
            io.to(currentRoom.id).emit('user-left', {
                user: currentUser,
                participants: Array.from(currentRoom.users.values())
            });

            // Clean up empty room
            if (currentRoom.users.size === 0) {
                rooms.delete(currentRoom.id);
            }
        }
    });
});

// Clean up inactive rooms periodically
setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
        if (room.users.size === 0 && now - room.created > 24 * 60 * 60 * 1000) {
            rooms.delete(roomId);
        }
    }
}, 60 * 60 * 1000); // Check every hour

// Start server
const server = http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Server terminated');
    });
});

process.on('SIGINT', () => {
    server.close(() => {
        console.log('Server interrupted');
    });
});