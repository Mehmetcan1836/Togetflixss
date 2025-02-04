// Global state
let socket = null;
let currentUser = null;
let currentRoom = null;
let isTyping = false;
let typingTimeout = null;

// Initialize socket connection
function initializeSocket() {
    const roomId = getRoomIdFromUrl();
    if (!roomId) {
        showError('Invalid room ID');
        return;
    }

    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000'
        : 'https://togetflix-mehmetcan1836s-projects.vercel.app';

    const socketOptions = {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true
    };

    try {
        socket = io(socketUrl, socketOptions);

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showError('Connection error. Retrying...');
            updateConnectionStatus(false);
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            updateConnectionStatus(true);
            joinRoom(roomId);
        });

        socket.on('room-joined', ({ user, roomState }) => {
            console.log('Joined room:', roomState.id);
            currentUser = user;
            currentRoom = roomState;
            
            // Save username for future use
            if (user.name) {
                localStorage.setItem('username', user.name);
            }
            
            // Update UI
            updateRoomInfo(roomState);
            updateUserList(roomState.users);
            loadChatHistory(roomState.messages);
            showSuccess('Successfully joined the room!');
        });

        socket.on('user-connected', (user) => {
            console.log('User connected:', user);
            addUserToList(user);
            showNotification(`${user.name} joined the room`);
        });

        socket.on('user-disconnected', (userId) => {
            console.log('User disconnected:', userId);
            removeUserFromList(userId);
            const user = findUserById(userId);
            if (user) {
                showNotification(`${user.name} left the room`);
            }
        });

        socket.on('chat-message', (message) => {
            addChatMessage(message);
        });

        socket.on('user-typing', (userId) => {
            const user = findUserById(userId);
            if (user) {
                showTypingIndicator(user.name);
            }
        });

        socket.on('user-typing-stop', () => {
            hideTypingIndicator();
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            showError(error.message);
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            updateConnectionStatus(false);
            showError('Disconnected from server. Attempting to reconnect...');
        });

    } catch (error) {
        console.error('Error initializing socket:', error);
        showError('Failed to connect to server');
    }
}

// Room Functions
function getRoomIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/room\/([^\/]+)/);
    return match ? match[1] : null;
}

function joinRoom(roomId) {
    if (!socket) return;
    
    const username = localStorage.getItem('username');
    socket.emit('join-room', {
        roomId: roomId,
        username: username
    });
}

function updateRoomInfo(roomState) {
    const roomIdElement = document.getElementById('roomId');
    if (roomIdElement) {
        roomIdElement.textContent = roomState.id;
    }

    const roomLinkElement = document.getElementById('roomLink');
    if (roomLinkElement) {
        const roomUrl = `${window.location.origin}/room/${roomState.id}`;
        roomLinkElement.value = roomUrl;
    }
}

// UI Functions
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = connected ? 'Connected' : 'Disconnected';
        statusElement.className = `status ${connected ? 'connected' : 'disconnected'}`;
    }
}

function updateUserList(users) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.dataset.userId = user.id;
        userElement.innerHTML = `
            <span class="user-name">${user.name}</span>
            ${user.id === currentUser?.id ? ' (You)' : ''}
        `;
        usersList.appendChild(userElement);
    });
}

function loadChatHistory(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = '';
    messages.forEach(addChatMessage);
}

function addChatMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.userId === currentUser?.id ? 'own-message' : ''}`;
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-user">${message.username}</span>
            <span class="message-time">${formatTime(message.timestamp)}</span>
        </div>
        <div class="message-content">${formatMessage(message.content)}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator(username) {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.textContent = `${username} is typing...`;
        typingIndicator.style.display = 'block';
    }
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.style.display = 'none';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const container = document.getElementById('notificationContainer') || document.body;
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

function showError(message) {
    showNotification(message, 'error');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

// Helper Functions
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
}

function formatMessage(content) {
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function findUserById(userId) {
    const userElement = document.querySelector(`[data-user-id="${userId}"]`);
    if (userElement) {
        return {
            id: userId,
            name: userElement.querySelector('.user-name').textContent
        };
    }
    return null;
}

// Event Handlers
function handleChatInput(event) {
    if (!socket || !currentUser) return;

    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const input = event.target;
        const message = input.value.trim();
        
        if (message) {
            socket.emit('send-message', { message });
            input.value = '';
            stopTyping();
        }
    } else {
        if (!isTyping) {
            isTyping = true;
            socket.emit('start-typing');
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(stopTyping, 1000);
    }
}

function stopTyping() {
    if (isTyping) {
        isTyping = false;
        socket.emit('stop-typing');
    }
}

function copyRoomLink() {
    const roomLinkElement = document.getElementById('roomLink');
    if (roomLinkElement) {
        roomLinkElement.select();
        document.execCommand('copy');
        showSuccess('Room link copied to clipboard!');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    
    // Add event listeners
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', handleChatInput);
    }
    
    const copyLinkButton = document.getElementById('copyLink');
    if (copyLinkButton) {
        copyLinkButton.addEventListener('click', copyRoomLink);
    }
});
