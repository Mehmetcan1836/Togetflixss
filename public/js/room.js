// Global state
let socket = null;
let localStream = null;
let screenStream = null;
let userId = null;
let roomId = null;
let isScreenSharing = false;
let peerConnections = {};

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Initialize socket connection
function initializeSocket() {
    socket = io(window.location.origin, {
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        query: {
            roomId: window.location.pathname.split('/').pop()
        }
    });

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        updateConnectionStatus(true);
        joinRoom(); // Automatically join room after connection
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        updateConnectionStatus(false);
        setTimeout(() => {
            socket.connect();
        }, 2000);
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        updateConnectionStatus(false);
        
        if (reason === 'io server disconnect') {
            // Sunucu tarafından bağlantı kesildi, yeniden bağlanmayı dene
            setTimeout(() => {
                socket.connect();
            }, 1000);
        }
        // Diğer disconnect sebepleri için socket.io otomatik olarak yeniden bağlanmayı deneyecek
    });

    // Room events
    socket.on('user-connected', async (user) => {
        console.log('User connected:', user);
        addUserToList(user);
        
        // If we are currently sharing screen, send it to the new user
        if (isScreenSharing && screenStream) {
            const pc = createPeerConnection(user.id);
            screenStream.getTracks().forEach(track => {
                pc.addTrack(track, screenStream);
            });
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', {
                targetId: user.id,
                offer: offer
            });
        }
    });

    socket.on('user-disconnected', (userId) => {
        console.log('User disconnected:', userId);
        removeUserFromList(userId);
        closePeerConnection(userId);
    });

    socket.on('room-state', (state) => {
        console.log('Room state:', state);
        updateRoomState(state);
    });

    // WebRTC events
    socket.on('offer', async ({ senderId, offer }) => {
        console.log('Received offer from:', senderId);
        const pc = createPeerConnection(senderId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
            targetId: senderId,
            answer: answer
        });
    });

    socket.on('answer', async ({ senderId, answer }) => {
        console.log('Received answer from:', senderId);
        const pc = peerConnections[senderId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    socket.on('ice-candidate', async ({ senderId, candidate }) => {
        console.log('Received ICE candidate from:', senderId);
        const pc = peerConnections[senderId];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    // Chat events
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
}

// WebRTC functions
function createPeerConnection(targetId) {
    if (peerConnections[targetId]) {
        closePeerConnection(targetId);
    }

    const pc = new RTCPeerConnection(configuration);
    peerConnections[targetId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetId: targetId,
                candidate: event.candidate
            });
        }
    };

    pc.ontrack = (event) => {
        console.log('Received remote track');
        const video = document.getElementById('screenVideo');
        if (video.srcObject !== event.streams[0]) {
            video.srcObject = event.streams[0];
            document.getElementById('noScreenMessage').style.display = 'none';
        }
    };

    return pc;
}

function closePeerConnection(targetId) {
    const pc = peerConnections[targetId];
    if (pc) {
        pc.close();
        delete peerConnections[targetId];
    }
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
    socket.emit('join-room', { roomId, userId });
    
    // Display room ID
    document.getElementById('roomIdDisplay').textContent = roomId;
}

function generateUserId() {
    return Math.random().toString(36).substring(2, 15);
}

// Screen sharing functions
async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        const video = document.getElementById('screenVideo');
        video.srcObject = screenStream;
        document.getElementById('noScreenMessage').style.display = 'none';
        
        // Update UI
        document.getElementById('startScreenShare').style.display = 'none';
        document.getElementById('stopScreenShare').style.display = 'inline-flex';
        
        isScreenSharing = true;

        // Send stream to all connected peers
        Object.keys(peerConnections).forEach(async (peerId) => {
            const pc = peerConnections[peerId];
            screenStream.getTracks().forEach(track => {
                pc.addTrack(track, screenStream);
            });
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', {
                targetId: peerId,
                offer: offer
            });
        });

        // Handle stream end
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };
    } catch (error) {
        console.error('Error starting screen share:', error);
        if (error.name === 'NotAllowedError') {
            alert('You need to allow screen sharing to use this feature.');
        } else {
            alert('Failed to start screen sharing. Please try again.');
        }
    }
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
    document.getElementById('noScreenMessage').style.display = 'flex';
    document.getElementById('startScreenShare').style.display = 'inline-flex';
    document.getElementById('stopScreenShare').style.display = 'none';

    isScreenSharing = false;

    // Notify peers
    socket.emit('screen-sharing-stopped');
}

// UI functions
function updateConnectionStatus(connected) {
    const status = document.getElementById('status');
    const indicator = document.getElementById('statusIndicator');
    
    if (connected) {
        status.textContent = 'Connected';
        indicator.classList.add('connected');
    } else {
        status.textContent = 'Disconnected';
        indicator.classList.remove('connected');
    }
}

function addUserToList(user) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    // Remove existing user if present
    const existingUser = document.getElementById(`user-${user.id}`);
    if (existingUser) {
        existingUser.remove();
    }

    const userElement = document.createElement('div');
    userElement.id = `user-${user.id}`;
    userElement.className = 'user-item';
    userElement.innerHTML = `
        <div class="user-avatar">${user.name[0].toUpperCase()}</div>
        <div class="user-info">
            <div class="user-name">${user.name}${user.id === userId ? ' (You)' : ''}</div>
            <div class="user-role">${user.isScreenSharing ? 'Sharing screen' : 'Viewer'}</div>
        </div>
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
    if (state.screenSharer && state.screenSharer !== userId) {
        document.getElementById('startScreenShare').disabled = true;
    } else {
        document.getElementById('startScreenShare').disabled = false;
    }
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
        <div class="message-content">${message.text}</div>
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
    const userName = document.querySelector(`#user-${userId} .user-name`)?.textContent;
    if (typingIndicator && userName) {
        typingIndicator.textContent = `${userName} is typing...`;
        typingIndicator.style.display = 'block';
    }
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.style.display = 'none';
    }
}

// Mobile UI functions
function toggleSidePanel() {
    const sidePanel = document.getElementById('sidePanel');
    sidePanel.classList.toggle('open');
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
            socket.emit('chat-message', {
                text: message,
                timestamp: Date.now()
            });
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
        if (confirm('Are you sure you want to leave the room?')) {
            window.location.href = '/';
        }
    });

    // Set up mobile panel toggle
    document.getElementById('togglePanel')?.addEventListener('click', toggleSidePanel);

    // Handle window resize
    window.addEventListener('resize', () => {
        const sidePanel = document.getElementById('sidePanel');
        if (window.innerWidth > 768) {
            sidePanel.classList.remove('open');
        }
    });
});
