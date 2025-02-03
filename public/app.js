// Initialize socket connection
const socket = io(window.location.origin, {
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    upgrade: true,
    rememberUpgrade: true,
    secure: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
    autoConnect: true,
    forceNew: true
});

// Handle socket connection events
socket.on('connect', () => {
    console.log('Socket connected successfully');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    // Try to reconnect with polling if WebSocket fails
    if (socket.io.opts.transports.includes('websocket')) {
        console.log('Falling back to polling transport');
        socket.io.opts.transports = ['polling'];
        socket.connect();
    }
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect') {
        // Try to reconnect if server disconnected
        socket.connect();
    }
});

// Initialize room functionality
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');
    const roomInput = document.getElementById('roomInput');

    createRoomBtn?.addEventListener('click', async () => {
        console.log('Create room clicked');
        try {
            const room = await createRoom();
            if (room) {
                window.location.href = `/room/${room.roomId}`;
            }
        } catch (error) {
            console.error('Error creating room:', error);
            alert('Failed to create room. Please try again.');
        }
    });

    joinRoomBtn?.addEventListener('click', () => {
        const roomId = roomInput.value.trim().toUpperCase();
        if (roomId) {
            window.location.href = `/room/${roomId}`;
        } else {
            alert('Please enter a room ID');
        }
    });
});

async function createRoom() {
    console.log('Creating room...');
    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Response:', response);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Room created:', data);
        return data;
    } catch (error) {
        console.error('Error creating room:', error);
        throw error;
    }
}
