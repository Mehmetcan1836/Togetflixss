// Global state
let socket = null;
let localStream = null;
let screenStream = null;
let userId = null;
let roomId = null;
let isScreenSharing = false;

// Initialize socket connection
function initializeSocket() {
    socket = io(window.location.origin, {
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        timeout: 20000
    });

    // Socket connection events
    socket.on('connect', () => {
        console.log('Connected to server');
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').style.color = 'green';
        joinRoom();
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        document.getElementById('status').textContent = 'Connection Error';
        document.getElementById('status').style.color = 'red';
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').style.color = 'red';
    });

    // Room events
    socket.on('user-connected', (user) => {
        console.log('User connected:', user);
        addUserToList(user);
    });

    socket.on('user-disconnected', (userId) => {
        console.log('User disconnected:', userId);
        removeUserFromList(userId);
    });

    socket.on('room-state', (state) => {
        console.log('Room state:', state);
        updateRoomState(state);
    });

    socket.on('chat-message', (message) => {
        console.log('Chat message:', message);
        addChatMessage(message);
    });

    socket.on('user-typing', (userId) => {
        showTypingIndicator(userId);
    });

    socket.on('user-typing-stop', (userId) => {
        hideTypingIndicator(userId);
    });

    // Screen sharing events
    socket.on('user-screen-share', (userId, stream) => {
        console.log('User started screen sharing:', userId);
        handleRemoteScreenShare(userId, stream);
    });

    socket.on('user-screen-share-stopped', (userId) => {
        console.log('User stopped screen sharing:', userId);
        stopRemoteScreenShare(userId);
    });
}

// Room functions
function joinRoom() {
    roomId = window.location.pathname.split('/').pop();
    userId = generateUserId();
    
    if (!roomId) {
        console.error('No room ID found');
        window.location.href = '/';
        return;
    }

    console.log('Joining room:', roomId);
    socket.emit('join-room', roomId, userId);
    
    // Display room ID
    document.getElementById('roomIdDisplay').textContent = roomId;
}

function generateUserId() {
    return Math.random().toString(36).substring(2, 15);
}

// UI functions
function addUserToList(user) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    const userElement = document.createElement('div');
    userElement.id = `user-${user.id}`;
    userElement.className = 'user-item';
    userElement.innerHTML = `
        <img src="${user.avatar}" alt="${user.name}" class="user-avatar">
        <span class="user-name">${user.name}</span>
    `;
    usersList.appendChild(userElement);
}

function removeUserFromList(userId) {
    const userElement = document.getElementById(`user-${userId}`);
    if (userElement) {
        userElement.remove();
    }
}

function updateRoomState(state) {
    // Update users list
    const usersList = document.getElementById('usersList');
    if (usersList) {
        usersList.innerHTML = '';
        state.users.forEach(user => addUserToList(user));
    }

    // Update screen sharing state
    if (state.screenSharer) {
        handleRemoteScreenShare(state.screenSharer);
    }

    // Update chat messages
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
        state.messages.forEach(message => addChatMessage(message));
    }
}

// Screen sharing functions
function startScreenShare() {
    if (isScreenSharing) return;

    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        .then(stream => {
            screenStream = stream;
            isScreenSharing = true;
            
            // Show the video element
            const video = document.getElementById('screenVideo');
            video.srcObject = stream;
            
            // Update UI
            document.getElementById('startScreenShare').style.display = 'none';
            document.getElementById('stopScreenShare').style.display = 'block';
            
            // Notify server
            socket.emit('screen-sharing-started', stream);

            // Handle stream end
            stream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };
        })
        .catch(error => {
            console.error('Error starting screen share:', error);
            alert('Failed to start screen sharing. Please try again.');
        });
}

function stopScreenShare() {
    if (!isScreenSharing) return;

    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }

    // Update UI
    const video = document.getElementById('screenVideo');
    video.srcObject = null;
    document.getElementById('startScreenShare').style.display = 'block';
    document.getElementById('stopScreenShare').style.display = 'none';

    isScreenSharing = false;
    socket.emit('screen-sharing-stopped');
}

function handleRemoteScreenShare(userId, stream) {
    const video = document.getElementById('screenVideo');
    if (stream) {
        video.srcObject = stream;
    }
    video.style.display = 'block';
}

function stopRemoteScreenShare() {
    const video = document.getElementById('screenVideo');
    video.srcObject = null;
    video.style.display = 'none';
}

// Chat functions
function addChatMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${message.userId === userId ? 'own-message' : ''}`;
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-user">${message.userName}</span>
            <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="message-content">${message.message}</div>
    `;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

let typingTimeout;
function handleTyping() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    socket.emit('typing-start');
    typingTimeout = setTimeout(() => {
        socket.emit('typing-stop');
    }, 1000);
}

function showTypingIndicator(userId) {
    const typingIndicator = document.getElementById('typingIndicator');
    const user = document.querySelector(`#user-${userId} .user-name`)?.textContent;
    if (typingIndicator && user) {
        typingIndicator.textContent = `${user} is typing...`;
        typingIndicator.style.display = 'block';
    }
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.style.display = 'none';
    }
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();

    // Set up screen sharing buttons
    document.getElementById('startScreenShare')?.addEventListener('click', startScreenShare);
    document.getElementById('stopScreenShare')?.addEventListener('click', stopScreenShare);

    // Set up chat input
    const messageInput = document.getElementById('messageInput');
    const sendMessage = document.getElementById('sendMessage');

    messageInput?.addEventListener('input', handleTyping);
    messageInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage.click();
        }
    });

    sendMessage?.addEventListener('click', () => {
        const message = messageInput.value.trim();
        if (message) {
            socket.emit('chat-message', message);
            messageInput.value = '';
        }
    });

    // Set up room ID copy button
    document.getElementById('copyRoomId')?.addEventListener('click', () => {
        navigator.clipboard.writeText(roomId)
            .then(() => alert('Room ID copied to clipboard!'))
            .catch(err => console.error('Failed to copy room ID:', err));
    });

    // Set up leave room button
    document.getElementById('leaveRoom')?.addEventListener('click', () => {
        window.location.href = '/';
    });
});
