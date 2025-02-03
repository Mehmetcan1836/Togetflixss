// Get room ID from URL
const roomId = window.location.pathname.split('/').pop();
const userId = Math.random().toString(36).substring(2);

// Initialize socket connection
const socket = io(window.location.origin, {
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    timeout: 20000
});

// DOM Elements
const status = document.getElementById('status');
const screenVideo = document.getElementById('screenVideo');
const startScreenShare = document.getElementById('startScreenShare');
const stopScreenShare = document.getElementById('stopScreenShare');
const usersList = document.getElementById('usersList');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessage = document.getElementById('sendMessage');
const typingIndicator = document.getElementById('typingIndicator');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const copyRoomId = document.getElementById('copyRoomId');
const leaveRoom = document.getElementById('leaveRoom');

// Set room ID in display
roomIdDisplay.textContent = roomId;

// Socket connection handlers
socket.on('connect', () => {
    console.log('Connected to server');
    status.textContent = 'Connected';
    status.style.color = 'green';
    socket.emit('join-room', roomId, userId);
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    status.textContent = 'Connection Error';
    status.style.color = 'red';
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    status.textContent = 'Disconnected';
    status.style.color = 'red';
});

// Room state handlers
socket.on('room-state', (state) => {
    console.log('Room state:', state);
    updateUsersList(state.users);
    state.messages.forEach(addMessage);
    if (state.screenSharer) {
        handleScreenShare(state.screenSharer);
    }
});

socket.on('user-connected', (user) => {
    console.log('User connected:', user);
    addUserToList(user);
    addSystemMessage(`${user.name} joined the room`);
});

socket.on('user-disconnected', (userId) => {
    console.log('User disconnected:', userId);
    removeUserFromList(userId);
    addSystemMessage(`User left the room`);
});

// Screen sharing handlers
let screenStream = null;

startScreenShare.addEventListener('click', async () => {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        screenVideo.srcObject = screenStream;
        socket.emit('screen-sharing-started', { userId });
        startScreenShare.style.display = 'none';
        stopScreenShare.style.display = 'inline-block';

        // Handle stream end
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopScreenSharing();
        });
    } catch (error) {
        console.error('Error sharing screen:', error);
        alert('Failed to share screen');
    }
});

stopScreenShare.addEventListener('click', stopScreenSharing);

function stopScreenSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenVideo.srcObject = null;
        socket.emit('screen-sharing-stopped');
        startScreenShare.style.display = 'inline-block';
        stopScreenShare.style.display = 'none';
        screenStream = null;
    }
}

socket.on('user-screen-share', (userId, stream) => {
    console.log('User started screen sharing:', userId);
    handleScreenShare(userId);
});

socket.on('user-screen-share-stopped', (userId) => {
    console.log('User stopped screen sharing:', userId);
    screenVideo.srcObject = null;
});

// Chat handlers
let typingTimeout;

messageInput.addEventListener('input', () => {
    if (!typingTimeout) {
        socket.emit('typing-start');
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing-stop');
        typingTimeout = null;
    }, 1000);
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage.click();
    }
});

sendMessage.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('chat-message', message);
        messageInput.value = '';
    }
});

socket.on('chat-message', addMessage);

socket.on('user-typing', (userId) => {
    typingIndicator.textContent = 'Someone is typing...';
});

socket.on('user-typing-stop', (userId) => {
    typingIndicator.textContent = '';
});

// Helper functions
function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(addUserToList);
}

function addUserToList(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.setAttribute('data-user-id', user.id);
    userElement.innerHTML = `
        <img src="${user.avatar}" alt="${user.name}" class="user-avatar">
        <span class="user-name">${user.name}</span>
    `;
    usersList.appendChild(userElement);
}

function removeUserFromList(userId) {
    const userElement = usersList.querySelector(`[data-user-id="${userId}"]`);
    if (userElement) {
        userElement.remove();
    }
}

function addMessage(message) {
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

function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Room controls
copyRoomId.addEventListener('click', () => {
    navigator.clipboard.writeText(roomId)
        .then(() => alert('Room ID copied to clipboard!'))
        .catch(err => console.error('Failed to copy room ID:', err));
});

leaveRoom.addEventListener('click', () => {
    window.location.href = '/';
});
