const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"]
    },
    transports: ['websocket', 'polling'],
    path: '/socket.io/',
    pingTimeout: 10000,
    pingInterval: 2500
});
const path = require('path');

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Store room and user information
const rooms = new Map();

// API Routes
app.post('/api/rooms', async (req, res) => {
    try {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                moderatorId: null,
                users: new Map(),
                screenSharer: null
            });
            
            res.json({ roomId, exists: false });
        } else {
            res.json({ exists: true });
        }
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = rooms.get(roomId);
    
    if (room) {
        res.json({
            exists: true,
            userCount: room.users.size
        });
    } else {
        res.status(404).json({ exists: false });
    }
});

// Socket connection handling
io.on('connection', socket => {
    console.log('User connected:', socket.id);

    socket.on('join-room', roomId => {
        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error', 'Room not found');
                return;
            }

            // Leave previous room if any
            const previousRoom = [...socket.rooms].find(room => room !== socket.id);
            if (previousRoom) {
                socket.leave(previousRoom);
                const prevRoom = rooms.get(previousRoom);
                if (prevRoom) {
                    prevRoom.users.delete(socket.id);
                    if (prevRoom.users.size === 0) {
                        rooms.delete(previousRoom);
                    }
                }
            }

            socket.join(roomId);
            const user = {
                id: socket.id,
                name: `User ${socket.id.substr(0, 4)}`,
                isModerator: socket.id === room.moderatorId
            };
            room.users.set(socket.id, user);

            // Notify others in the room
            socket.to(roomId).emit('user-joined', user);

            // Send current room state to the joining user
            socket.emit('room-state', {
                users: Array.from(room.users.values()),
                screenSharer: room.screenSharer
            });

            // Notify everyone about the new user
            io.to(roomId).emit('user-list', Array.from(room.users.values()));
            io.to(roomId).emit('moderator-updated', room.moderatorId);

            // If someone is sharing screen, notify the new user
            if (room.screenSharer) {
                socket.emit('screen-sharing-started', room.screenSharer);
            }
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', 'Failed to join room');
        }
    });

    // WebRTC Signaling
    socket.on('offer', data => {
        socket.to(data.targetId).emit('offer', {
            offer: data.offer,
            senderId: socket.id
        });
    });

    socket.on('answer', data => {
        socket.to(data.targetId).emit('answer', {
            answer: data.answer,
            senderId: socket.id
        });
    });

    socket.on('ice-candidate', data => {
        socket.to(data.targetId).emit('ice-candidate', {
            candidate: data.candidate,
            senderId: socket.id
        });
    });

    // Screen Sharing
    socket.on('screen-sharing-started', () => {
        const roomId = [...socket.rooms].find(room => room !== socket.id);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.screenSharer = socket.id;
                socket.to(roomId).emit('screen-sharing-started', socket.id);
            }
        }
    });

    socket.on('screen-sharing-stopped', () => {
        const roomId = [...socket.rooms].find(room => room !== socket.id);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room && room.screenSharer === socket.id) {
                room.screenSharer = null;
                socket.to(roomId).emit('screen-sharing-stopped', socket.id);
            }
        }
    });

    // Chat Messages
    socket.on('chat-message', data => {
        const room = rooms.get(data.roomId);
        if (room) {
            const user = room.users.get(socket.id);
            socket.to(data.roomId).emit('chat-message', {
                message: data.message,
                sender: socket.id,
                isModerator: user?.isModerator
            });
        }
    });

    // User Management
    socket.on('make-moderator', targetUserId => {
        const roomId = [...socket.rooms].find(room => room !== socket.id);
        const room = rooms.get(roomId);
        
        if (room && room.moderatorId === socket.id) {
            room.moderatorId = targetUserId;
            io.to(roomId).emit('moderator-updated', targetUserId);
        }
    });

    socket.on('remove-user', targetUserId => {
        const roomId = [...socket.rooms].find(room => room !== socket.id);
        const room = rooms.get(roomId);
        
        if (room && room.moderatorId === socket.id) {
            const targetSocket = io.sockets.sockets.get(targetUserId);
            if (targetSocket) {
                targetSocket.leave(roomId);
                room.users.delete(targetUserId);
                io.to(roomId).emit('user-list', Array.from(room.users.values()));
            }
        }
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (roomId === socket.id) continue;
            
            const room = rooms.get(roomId);
            if (room) {
                room.users.delete(socket.id);
                
                if (room.moderatorId === socket.id && room.users.size > 0) {
                    room.moderatorId = Array.from(room.users.keys())[0];
                    io.to(roomId).emit('moderator-updated', room.moderatorId);
                }
                
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                } else {
                    io.to(roomId).emit('user-list', Array.from(room.users.values()));
                }
                
                socket.to(roomId).emit('user-left', socket.id);
            }
        }
    });
});

// HTML routes
app.get('/room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server if not in production
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    http.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

// Export for serverless
module.exports = http;