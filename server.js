const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: ["https://togetflix-mehmetcan1836s-projects.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    },
    path: '/socket.io/',
    allowEIO3: true,
    serveClient: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e8,
    transports: ['polling', 'websocket'],
    connectTimeout: 45000,
    cleanupEmptyChildNamespaces: true
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
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    
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

// Generate random username
function generateUsername() {
    const adjectives = ['Happy', 'Lucky', 'Sunny', 'Clever', 'Swift', 'Bright', 'Cool', 'Smart'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Lion', 'Fox', 'Wolf', 'Bear'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

// API Routes
app.post('/api/rooms', (req, res) => {
    try {
        const roomId = generateRoomId();
        const room = {
            id: roomId,
            users: new Set(),
            screenSharer: null,
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
                screenSharer: room.screenSharer,
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
            screenSharer: null,
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
                    avatar: `https://api.dicebear.com/6.x/adventurer/svg?seed=${userId}`,
                    roomId: roomId,
                    joinedAt: Date.now()
                });
            }

            const user = users.get(userId);

            // Initialize room if doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                    id: roomId,
                    users: new Set(),
                    screenSharer: null,
                    messages: [],
                    createdAt: Date.now()
                });
            }

            const room = rooms.get(roomId);
            room.users.add(userId);
            socket.join(roomId);

            // Broadcast to others in room
            socket.to(roomId).emit('user-connected', user);

            // Send current room state to the new user
            const roomUsers = Array.from(room.users)
                .map(id => users.get(id))
                .filter(Boolean);

            socket.emit('room-state', {
                users: roomUsers,
                screenSharer: room.screenSharer,
                messages: room.messages
            });

            // Handle screen sharing
            socket.on('screen-sharing-started', stream => {
                console.log('Screen sharing started:', userId);
                if (room) {
                    room.screenSharer = userId;
                    socket.to(roomId).emit('user-screen-share', userId, stream);
                }
            });

            socket.on('screen-sharing-stopped', () => {
                console.log('Screen sharing stopped:', userId);
                if (room && room.screenSharer === userId) {
                    room.screenSharer = null;
                    socket.to(roomId).emit('user-screen-share-stopped', userId);
                }
            });

            // Handle chat messages
            socket.on('chat-message', message => {
                console.log('Chat message:', message);
                const messageObj = {
                    id: Date.now(),
                    userId,
                    userName: user.name,
                    message,
                    timestamp: Date.now()
                };
                room.messages.push(messageObj);
                io.to(roomId).emit('chat-message', messageObj);
            });

            // Handle user typing
            socket.on('typing-start', () => {
                socket.to(roomId).emit('user-typing', userId);
            });

            socket.on('typing-stop', () => {
                socket.to(roomId).emit('user-typing-stop', userId);
            });

        } catch (error) {
            console.error('Error in join-room:', error);
            socket.emit('error', 'Failed to join room');
        }
    });

    socket.on('disconnect', () => {
        try {
            console.log('User disconnected:', socket.id);
            // Find and remove user from their room
            for (const [roomId, room] of rooms.entries()) {
                for (const userId of room.users) {
                    const user = users.get(userId);
                    if (user && user.socketId === socket.id) {
                        room.users.delete(userId);
                        
                        // Clear screen sharer if disconnected user was sharing
                        if (room.screenSharer === userId) {
                            room.screenSharer = null;
                            io.to(roomId).emit('user-screen-share-stopped', userId);
                        }
                        
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

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});