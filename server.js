const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["*"],
        credentials: true
    }
});

const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Store active rooms and users
const rooms = new Map();
const users = new Map();

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Generate random avatar
function getRandomAvatar() {
    const avatarTypes = ['adventurer', 'adventurer-neutral', 'avataaars', 'big-ears', 'big-ears-neutral', 'big-smile'];
    const type = avatarTypes[Math.floor(Math.random() * avatarTypes.length)];
    return `https://api.dicebear.com/6.x/${type}/svg?seed=${Math.random()}`;
}

// Generate random username
function generateUsername() {
    const adjectives = ['Happy', 'Lucky', 'Sunny', 'Clever', 'Swift', 'Bright'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Lion', 'Fox'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

io.on('connection', socket => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        // Create user if doesn't exist
        if (!users.has(userId)) {
            users.set(userId, {
                id: userId,
                name: generateUsername(),
                avatar: getRandomAvatar(),
                roomId: roomId
            });
        }

        const user = users.get(userId);
        
        // Initialize room if doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        
        // Add user to room
        rooms.get(roomId).add(userId);
        socket.join(roomId);
        
        // Broadcast to others in room
        socket.to(roomId).emit('user-connected', user);
        
        // Send current users in room to the new user
        const roomUsers = Array.from(rooms.get(roomId))
            .map(id => users.get(id))
            .filter(u => u !== undefined);
            
        socket.emit('room-users', roomUsers);
        
        // Handle screen sharing
        socket.on('screen-sharing-started', stream => {
            socket.to(roomId).emit('user-screen-share', userId, stream);
        });
        
        socket.on('screen-sharing-stopped', () => {
            socket.to(roomId).emit('user-screen-share-stopped', userId);
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find and remove user from their room
        for (const [roomId, userIds] of rooms.entries()) {
            for (const userId of userIds) {
                if (users.get(userId)?.socketId === socket.id) {
                    userIds.delete(userId);
                    io.to(roomId).emit('user-disconnected', userId);
                    users.delete(userId);
                    break;
                }
            }
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