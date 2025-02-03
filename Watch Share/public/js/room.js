// Global state
let socket = null;
let localStream = null;
let screenStream = null;
let roomId = null;
let isScreenSharing = false;
let isModerator = false;
let moderatorId = null;
let peerConnections = {};
let selectedUser = null;

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Initialize socket connection
socket = io();

// DOM Elements
let screenShare;
let localVideo;
let remoteVideos = {};
let chatMessages;
let chatForm;
let chatInput;
let roomIdElement;
let chatPanel;
let usersPanel;
let usersList;
let userActions;
let tabButtons;
let panelContents;

document.addEventListener('DOMContentLoaded', () => {
    // Get room ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('roomId');

    if (!roomId) {
        alert('Oda ID bulunamadı!');
        window.location.href = '/';
        return;
    }

    // Initialize DOM elements
    screenShare = document.getElementById('screen-share');
    localVideo = document.getElementById('local-video');
    chatMessages = document.getElementById('chat-messages');
    chatForm = document.getElementById('chat-form');
    chatInput = document.getElementById('chat-input');
    roomIdElement = document.getElementById('room-id');
    chatPanel = document.getElementById('chat-panel');
    usersPanel = document.getElementById('users-panel');
    usersList = document.getElementById('users-list');
    userActions = document.getElementById('user-actions');
    tabButtons = document.querySelectorAll('.tab-btn');
    panelContents = document.querySelectorAll('.panel-content');

    // Set room ID in UI
    if (roomIdElement) {
        roomIdElement.textContent = `Oda ID: ${roomId}`;
    }

    // Initialize tab system
    initializeTabs();

    // Initialize control buttons
    initializeControlButtons();

    // Initialize chat form
    if (chatForm) {
        chatForm.addEventListener('submit', handleChatSubmit);
    }

    // Join room
    socket.emit('join-room', roomId);
});

// Socket event listeners
socket.on('user-list', users => {
    console.log('Received user list:', users);
    updateUsersList(users);
});

socket.on('user-joined', user => {
    console.log('User joined:', user);
    addUserToList(user);
    createPeerConnection(user.id);
});

socket.on('user-left', userId => {
    console.log('User left:', userId);
    removeUserFromList(userId);
    removePeerConnection(userId);
});

socket.on('moderator-updated', newModeratorId => {
    console.log('Moderator updated:', newModeratorId);
    moderatorId = newModeratorId;
    isModerator = socket.id === newModeratorId;
    updateUsersList();
});

socket.on('chat-message', data => {
    addChatMessage(data);
});

// WebRTC event listeners
socket.on('offer', async data => {
    console.log('Received offer from:', data.senderId);
    const pc = getOrCreatePeerConnection(data.senderId);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', {
        targetId: data.senderId,
        answer: answer
    });
});

socket.on('answer', async data => {
    console.log('Received answer from:', data.senderId);
    const pc = peerConnections[data.senderId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on('ice-candidate', async data => {
    console.log('Received ICE candidate from:', data.senderId);
    const pc = peerConnections[data.senderId];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

socket.on('screen-sharing-started', userId => {
    console.log('User started screen sharing:', userId);
    if (userId !== socket.id) {
        const pc = getOrCreatePeerConnection(userId);
        pc.ontrack = event => {
            screenShare.srcObject = event.streams[0];
            screenShare.classList.remove('hidden');
        };
    }
});

socket.on('screen-sharing-stopped', userId => {
    console.log('User stopped screen sharing:', userId);
    if (userId !== socket.id) {
        screenShare.srcObject = null;
        screenShare.classList.add('hidden');
    }
});

// WebRTC functions
function getOrCreatePeerConnection(userId) {
    if (!peerConnections[userId]) {
        createPeerConnection(userId);
    }
    return peerConnections[userId];
}

function createPeerConnection(userId) {
    if (peerConnections[userId]) return;

    const pc = new RTCPeerConnection(configuration);
    peerConnections[userId] = pc;

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetId: userId,
                candidate: event.candidate
            });
        }
    };

    pc.ontrack = event => {
        if (!screenShare.srcObject) {
            screenShare.srcObject = event.streams[0];
            screenShare.classList.remove('hidden');
        }
    };

    if (screenStream) {
        screenStream.getTracks().forEach(track => {
            pc.addTrack(track, screenStream);
        });
    }

    return pc;
}

function removePeerConnection(userId) {
    const pc = peerConnections[userId];
    if (pc) {
        pc.close();
        delete peerConnections[userId];
    }
}

// User management functions
function updateUsersList(users = []) {
    if (!usersList) return;
    
    console.log('Updating users list:', users);
    usersList.innerHTML = '';
    users.forEach(user => addUserToList(user));
}

function addUserToList(user) {
    if (!usersList) return;
    
    console.log('Adding user to list:', user);
    const userElement = document.createElement('div');
    userElement.className = `user-item ${user.id === moderatorId ? 'moderator' : ''}`;
    userElement.dataset.userId = user.id;
    
    userElement.innerHTML = `
        <div class="user-avatar">
            <i class="fas fa-user"></i>
        </div>
        <div class="user-info">
            <div class="user-name">${user.name || 'Anonim'} ${user.id === socket.id ? '(Sen)' : ''}</div>
            <div class="user-role">${user.id === moderatorId ? 'Moderatör' : 'Kullanıcı'}</div>
        </div>
    `;

    if (isModerator && user.id !== socket.id) {
        userElement.addEventListener('click', () => selectUser(user));
    }

    usersList.appendChild(userElement);
}

function removeUserFromList(userId) {
    if (!usersList) return;
    
    console.log('Removing user from list:', userId);
    const userElement = usersList.querySelector(`[data-user-id="${userId}"]`);
    if (userElement) {
        userElement.remove();
    }
}

function selectUser(user) {
    if (!userActions) return;
    
    console.log('Selecting user:', user);
    const previousSelected = usersList.querySelector('.selected');
    if (previousSelected) {
        previousSelected.classList.remove('selected');
    }

    const userElement = usersList.querySelector(`[data-user-id="${user.id}"]`);
    if (userElement) {
        userElement.classList.add('selected');
        selectedUser = user;
        userActions.classList.remove('hidden');
        userActions.classList.add('visible');
    }
}

// Initialize user action buttons
const makeModeratorBtn = document.querySelector('[data-action="make-moderator"]');
const removeUserBtn = document.querySelector('[data-action="remove-user"]');

if (makeModeratorBtn) {
    makeModeratorBtn.addEventListener('click', () => {
        if (selectedUser) {
            socket.emit('make-moderator', selectedUser.id);
        }
    });
}

if (removeUserBtn) {
    removeUserBtn.addEventListener('click', () => {
        if (selectedUser) {
            socket.emit('remove-user', selectedUser.id);
        }
    });
}

// Tab system
function initializeTabs() {
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;
            
            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            panelContents.forEach(panel => panel.classList.remove('active'));
            
            button.classList.add('active');
            document.querySelector(`[data-panel="${tab}"]`).classList.add('active');
        });
    });
}

// Control buttons
function initializeControlButtons() {
    // Screen share button
    const screenBtn = document.querySelector('[data-action="toggle-screen"]');
    if (screenBtn) {
        screenBtn.addEventListener('click', async () => {
            try {
                if (!isScreenSharing) {
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                        video: true,
                        audio: true
                    }).catch(error => {
                        if (error.name === 'NotAllowedError') {
                            alert('Ekran paylaşımı için izin vermeniz gerekmektedir.');
                        } else {
                            console.error('Ekran paylaşımı hatası:', error);
                            alert('Ekran paylaşımı başlatılırken bir hata oluştu.');
                        }
                        throw error;
                    });

                    screenStream = stream;
                    screenShare.srcObject = stream;
                    screenShare.classList.remove('hidden');
                    isScreenSharing = true;
                    
                    // Stream ended event
                    stream.getVideoTracks()[0].onended = () => {
                        stopScreenShare();
                    };

                    // Broadcast screen to all peers
                    socket.emit('screen-sharing-started');
                    Object.keys(peerConnections).forEach(peerId => {
                        const pc = peerConnections[peerId];
                        stream.getTracks().forEach(track => {
                            pc.addTrack(track, stream);
                        });
                    });
                } else {
                    stopScreenShare();
                }
            } catch (error) {
                console.error('Screen sharing error:', error);
            }
        });
    }

    // Chat toggle button
    const chatToggleBtn = document.querySelector('[data-action="toggle-chat"]');
    const sidePanel = document.getElementById('side-panel');
    
    if (chatToggleBtn && sidePanel) {
        chatToggleBtn.addEventListener('click', () => {
            sidePanel.classList.toggle('open');
            const isOpen = sidePanel.classList.contains('open');
            chatToggleBtn.innerHTML = `<i class="fas fa-${isOpen ? 'times' : 'comments'}"></i>`;
        });
    }

    // Leave room button
    const leaveBtn = document.querySelector('[data-action="leave-room"]');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            if (confirm('Odadan ayrılmak istediğinize emin misiniz?')) {
                window.location.href = '/';
            }
        });
    }
}

// Screen sharing functions
function replaceTrack(peerConnection, track) {
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === track.kind);
    if (sender) {
        sender.replaceTrack(track);
    } else {
        peerConnection.addTrack(track);
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    screenShare.srcObject = null;
    screenShare.classList.add('hidden');
    isScreenSharing = false;
    socket.emit('screen-sharing-stopped');
}

// Chat functions
function handleChatSubmit(e) {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('chat-message', { message, roomId });
        addChatMessage({ message, sender: socket.id });
        chatInput.value = '';
    }
}

function addChatMessage(data) {
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${data.sender === socket.id ? 'sent' : 'received'}`;
    messageDiv.textContent = data.message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
