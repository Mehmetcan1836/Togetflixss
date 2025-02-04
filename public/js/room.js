// Global state
let socket = null;
let currentUser = null;
let isTyping = false;
let typingTimeout = null;

// Initialize socket connection
function initializeSocket() {
    const roomId = window.location.pathname.split('/').pop();
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
            updateConnectionStatus(false);
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            updateConnectionStatus(true);
            
            // Join room after successful connection
            if (roomId) {
                socket.emit('join-room', {
                    roomId: roomId,
                    username: localStorage.getItem('username') || null
                });
            }
        });

        socket.on('room-joined', ({ user, roomState }) => {
            currentUser = user;
            localStorage.setItem('username', user.name);
            
            // Update UI with room state
            updateRoomState(roomState);
            updateUserList(roomState.users);
        });

        socket.on('user-connected', (user) => {
            console.log('User connected to room:', user);
            addUserToList(user);
            showNotification(`${user.name} joined the room`);
        });

        socket.on('user-disconnected', (userId) => {
            console.log('User disconnected from room:', userId);
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

        socket.on('user-typing-stop', (userId) => {
            hideTypingIndicator();
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            showNotification(error.message, 'error');
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            updateConnectionStatus(false);
            showNotification('Disconnected from server', 'error');
        });

    } catch (error) {
        console.error('Error initializing socket:', error);
        updateConnectionStatus(false);
        showNotification('Failed to connect to server', 'error');
    }
}

// UI Functions
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = connected ? 'Connected' : 'Disconnected';
        statusElement.style.color = connected ? 'green' : 'red';
    }
}

function updateRoomState(state) {
    updateUserList(state.users);
    state.messages.forEach(addChatMessage);
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

function addUserToList(user) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;
    
    const existingUser = usersList.querySelector(`[data-user-id="${user.id}"]`);
    if (!existingUser) {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.dataset.userId = user.id;
        userElement.innerHTML = `
            <span class="user-name">${user.name}</span>
            ${user.id === currentUser?.id ? ' (You)' : ''}
        `;
        usersList.appendChild(userElement);
    }
}

function removeUserFromList(userId) {
    const userElement = document.querySelector(`[data-user-id="${userId}"]`);
    if (userElement) {
        userElement.remove();
    }
}

function addChatMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.userId === currentUser?.id ? 'own-message' : ''}`;
    messageElement.innerHTML = `
        <span class="message-user">${message.username}</span>
        <span class="message-content">${message.content}</span>
        <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
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
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Helper Functions
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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    
    // Add event listeners
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', handleChatInput);
    }
});
