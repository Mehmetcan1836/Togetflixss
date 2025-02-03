const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

const path = require('path');
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms and their states
const rooms = new Map();

// Socket connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ roomId, userId }) => {
        console.log(`User ${userId} joining room ${roomId}`);
        
        // Create room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: new Map(),
                screenSharer: null,
                messages: []
            });
        }

        const room = rooms.get(roomId);
        
        // Add user to room
        room.users.set(userId, {
            id: userId,
            socketId: socket.id,
            name: `User ${userId.slice(0, 4)}`,
            isScreenSharing: false
        });

        // Join socket room
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userId = userId;

        // Notify others in room
        socket.to(roomId).emit('user-connected', {
            id: userId,
            name: `User ${userId.slice(0, 4)}`,
            isScreenSharing: false
        });

        // Send room state to new user
        io.to(socket.id).emit('room-state', {
            users: Array.from(room.users.values()),
            screenSharer: room.screenSharer,
            messages: room.messages
        });
    });

    // Handle WebRTC signaling
    socket.on('offer', ({ targetId, offer }) => {
        const room = rooms.get(socket.roomId);
        if (room) {
            const targetUser = Array.from(room.users.values()).find(u => u.id === targetId);
            if (targetUser) {
                io.to(targetUser.socketId).emit('offer', {
                    senderId: socket.userId,
                    offer: offer
                });
            }
        }
    });

    socket.on('answer', ({ targetId, answer }) => {
        const room = rooms.get(socket.roomId);
        if (room) {
            const targetUser = Array.from(room.users.values()).find(u => u.id === targetId);
            if (targetUser) {
                io.to(targetUser.socketId).emit('answer', {
                    senderId: socket.userId,
                    answer: answer
                });
            }
        }
    });

    socket.on('ice-candidate', ({ targetId, candidate }) => {
        const room = rooms.get(socket.roomId);
        if (room) {
            const targetUser = Array.from(room.users.values()).find(u => u.id === targetId);
            if (targetUser) {
                io.to(targetUser.socketId).emit('ice-candidate', {
                    senderId: socket.userId,
                    candidate: candidate
                });
            }
        }
    });

    // Handle chat messages
    socket.on('chat-message', (message) => {
        const room = rooms.get(socket.roomId);
        if (room) {
            const user = room.users.get(socket.userId);
            const fullMessage = {
                ...message,
                userId: socket.userId,
                userName: user ? user.name : 'Unknown User'
            };
            room.messages.push(fullMessage);
            io.to(socket.roomId).emit('chat-message', fullMessage);
        }
    });

    // Handle typing indicators
    socket.on('typing-start', () => {
        socket.to(socket.roomId).emit('user-typing', socket.userId);
    });

    socket.on('typing-stop', () => {
        socket.to(socket.roomId).emit('user-typing-stop', socket.userId);
    });

    // Handle screen sharing status
    socket.on('screen-sharing-started', () => {
        const room = rooms.get(socket.roomId);
        if (room) {
            room.screenSharer = socket.userId;
            const user = room.users.get(socket.userId);
            if (user) {
                user.isScreenSharing = true;
            }
            io.to(socket.roomId).emit('room-state', {
                users: Array.from(room.users.values()),
                screenSharer: room.screenSharer,
                messages: room.messages
            });
        }
    });

    socket.on('screen-sharing-stopped', () => {
        const room = rooms.get(socket.roomId);
        if (room && room.screenSharer === socket.userId) {
            room.screenSharer = null;
            const user = room.users.get(socket.userId);
            if (user) {
                user.isScreenSharing = false;
            }
            io.to(socket.roomId).emit('room-state', {
                users: Array.from(room.users.values()),
                screenSharer: null,
                messages: room.messages
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const roomId = socket.roomId;
        const userId = socket.userId;
        
        if (roomId && userId) {
            const room = rooms.get(roomId);
            if (room) {
                // Remove user from room
                room.users.delete(userId);
                
                // Clear screen sharer if disconnected user was sharing
                if (room.screenSharer === userId) {
                    room.screenSharer = null;
                }
                
                // Delete room if empty
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                } else {
                    // Notify others about disconnection
                    socket.to(roomId).emit('user-disconnected', userId);
                    
                    // Send updated room state
                    io.to(roomId).emit('room-state', {
                        users: Array.from(room.users.values()),
                        screenSharer: room.screenSharer,
                        messages: room.messages
                    });
                }
            }
        }
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Start server
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});