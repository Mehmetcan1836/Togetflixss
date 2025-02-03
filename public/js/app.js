// Initialize socket connection with retry logic
let socket;
let retryCount = 0;
const maxRetries = 3;

function initializeSocket() {
    socket = io(window.location.origin, {
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: maxRetries,
        reconnectionDelay: 1000,
        timeout: 20000
    });

    // Socket event handlers
    socket.on('connect', () => {
        console.log('Socket connected successfully');
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').style.color = 'green';
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        document.getElementById('status').textContent = 'Connection Error';
        document.getElementById('status').style.color = 'red';
        
        if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
            setTimeout(() => {
                socket.connect();
            }, 2000);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').style.color = 'red';
    });

    return socket;
}

// Initialize room functionality
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    initializeSocket();

    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');
    const roomInput = document.getElementById('roomInput');

    // Enable/disable join button based on input
    roomInput?.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (joinRoomBtn) {
            joinRoomBtn.disabled = value.length === 0;
        }
    });

    createRoomBtn?.addEventListener('click', async () => {
        console.log('Create room clicked');
        try {
            const response = await fetch('/api/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Room created:', data);

            if (data.roomId) {
                window.location.href = `/room/${data.roomId}`;
            } else {
                throw new Error('No room ID received');
            }
        } catch (error) {
            console.error('Error creating room:', error);
            alert('Failed to create room. Please try again.');
        }
    });

    joinRoomBtn?.addEventListener('click', async () => {
        const roomId = roomInput.value.trim().toUpperCase();
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        try {
            const response = await fetch(`/api/rooms/${roomId}`);
            const data = await response.json();

            if (data.exists) {
                window.location.href = `/room/${roomId}`;
            } else {
                alert('Room not found. Please check the room ID and try again.');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            alert('Failed to join room. Please try again.');
        }
    });

    // Handle enter key in room input
    roomInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !joinRoomBtn.disabled) {
            joinRoomBtn.click();
        }
    });
});
