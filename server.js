const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    path: '/socket.io/',
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false,
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    allowEIO3: true,
    transports: ['websocket', 'polling']
});

const path = require('path');

// Middleware for CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Serve static files with proper MIME types
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

// Store room and user information
const rooms = new Map();

// Socket connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    socket.on('join-room', (roomId) => {
        try {
            console.log('User joining room:', roomId);
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
            room.users.set(socket.id, {
                id: socket.id,
                name: `User ${socket.id.substr(0, 4)}`,
                isModerator: room.users.size === 0
            });

            if (room.users.size === 1) {
                room.moderatorId = socket.id;
            }

            // Notify others in the room
            socket.to(roomId).emit('user-joined', {
                userId: socket.id,
                userName: room.users.get(socket.id).name
            });

            // Send current room state to the joining user
            socket.emit('room-state', {
                users: Array.from(room.users.values()),
                screenSharer: room.screenSharer,
                moderatorId: room.moderatorId
            });

            console.log('Room state sent to user');
        } catch (error) {
            console.error('Error in join-room:', error);
            socket.emit('error', 'Failed to join room');
        }
    });

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

// API Routes
app.post('/api/rooms', async (req, res) => {
    try {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                users: new Map(),
                screenSharer: null,
                moderatorId: null
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

// HTML routes
app.get('/room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server if not in production
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

module.exports = server;