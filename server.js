const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;

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
app.use(express.static('public'));

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
        permissions: new Map() // Store user permissions
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
            permissions: new Map() // Store user permissions
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
                    permissions: new Map() // Store user permissions
                });
            }

            currentRoom = rooms.get(roomId);

            // Create user
            const userId = uuidv4();
            currentUser = {
                id: userId,
                name: username || generateUsername(),
                roomId: roomId,
                joinedAt: Date.now()
            };

            // Add user to room
            currentRoom.users.set(userId, currentUser);
            users.set(userId, currentUser);

            // Join socket room
            await socket.join(roomId);

            // Send room state to the user
            socket.emit('room-joined', {
                user: currentUser,
                roomState: {
                    id: roomId,
                    users: Array.from(currentRoom.users.values()),
                    messages: currentRoom.messages
                }
            });

            // Notify others
            socket.to(roomId).emit('user-connected', currentUser);

            // Clean up inactive rooms periodically
            cleanupInactiveRooms();

        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on('send-message', ({ message }) => {
        if (!currentUser || !currentRoom) {
            socket.emit('error', { message: 'Not in a room' });
            return;
        }

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
        if (currentUser && currentRoom) {
            socket.to(currentUser.roomId).emit('user-typing', currentUser.id);
        }
    });

    socket.on('stop-typing', () => {
        if (currentUser && currentRoom) {
            socket.to(currentUser.roomId).emit('user-typing-stop', currentUser.id);
        }
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

    // Permission management
    socket.on('grantPermission', ({ roomId, userId, permission }) => {
        const room = rooms.get(roomId);
        if (!room || room.moderator !== socket.id) return;
        
        if (!room.permissions.has(userId)) {
            room.permissions.set(userId, new Set());
        }
        room.permissions.get(userId).add(permission);
        
        const targetSocket = io.sockets.sockets.get(userId);
        if (targetSocket) {
            targetSocket.emit('permissionGranted', { permission });
        }
    });

    socket.on('revokePermission', ({ roomId, userId, permission }) => {
        const room = rooms.get(roomId);
        if (!room || room.moderator !== socket.id) return;
        
        if (room.permissions.has(userId)) {
            room.permissions.get(userId).delete(permission);
        }
        
        const targetSocket = io.sockets.sockets.get(userId);
        if (targetSocket) {
            targetSocket.emit('permissionRevoked', { permission });
        }
    });

    // YouTube sync events
    socket.on('youtubeVideoUpdate', ({ roomId, videoId, state, timestamp, volume }) => {
        const room = rooms.get(roomId);
        if (!room || (room.moderator !== socket.id && 
            (!room.permissions.has(socket.id) || 
             !room.permissions.get(socket.id).has(PERMISSIONS.YOUTUBE_CONTROL)))) return;
        
        room.youtube = { videoId, state, timestamp, volume };
        socket.to(roomId).emit('youtubeVideoUpdated', room.youtube);
    });
});

// Helper functions
function generateUsername() {
    const adjectives = ['Happy', 'Lucky', 'Sunny', 'Clever', 'Swift'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Lion'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

function cleanupInactiveRooms() {
    const now = Date.now();
    const inactivityPeriod = 24 * 60 * 60 * 1000; // 24 hours

    for (const [roomId, room] of rooms.entries()) {
        if (room.users.size === 0 && (now - room.created) > inactivityPeriod) {
            rooms.delete(roomId);
        }
    }
}

// Start server
const server = http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Server shutdown complete');
    });
});