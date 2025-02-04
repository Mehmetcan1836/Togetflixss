// Global state
let currentUser = null;
let currentRoom = null;
let isTyping = false;
let typingTimeout = null;
let isModerator = false;
let youtubePlayer = null;
let socket = null;

// DOM elementleri
let chatMessages, messageInput, videoOverlay, roomIdSpan, userCountSpan, typingIndicator;
let sendBtn, shareScreenBtn, copyBtn, leaveBtn, youtubeContainer, youtubeUrlInput, youtubePlayBtn;
let userList, permissionsModal;

// Socket.IO olaylarını başlat
function initializeSocket() {
    const serverUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000'
        : 'https://togetflix-mehmetcan1836s-projects.vercel.app';
    
    socket = io(serverUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling']
    });

    // Temel socket olayları
    socket.on('connect', () => {
        console.log('Socket.IO bağlantısı kuruldu');
        const roomId = window.location.pathname.split('/').pop();
        const username = localStorage.getItem('username') || 'Misafir-' + Math.random().toString(36).substr(2, 4);
        socket.emit('joinRoom', { roomId, username });
    });

    socket.on('roomJoined', (data) => {
        currentRoom = data.roomId;
        isModerator = data.isModerator;
        updateUIForRole();
        
        if (data.youtube && data.youtube.videoId) {
            loadYoutubeVideo(data.youtube.videoId, data.youtube.timestamp);
        }
    });

    socket.on('userJoined', (data) => {
        if (userCountSpan) {
            userCountSpan.textContent = data.userCount;
        }
        updateUserList(data.users);
        showNotification(`${data.user.username} odaya katıldı`, 'info');
    });

    socket.on('userLeft', (data) => {
        if (userCountSpan) {
            userCountSpan.textContent = data.userCount;
        }
        updateUserList(data.users);
        showNotification(`${data.username} odadan ayrıldı`, 'info');
    });

    socket.on('chatMessage', (data) => {
        if (chatMessages) {
            appendMessage(data);
        }
    });

    socket.on('typing', (data) => {
        if (typingIndicator) {
            typingIndicator.textContent = `${data.username} yazıyor...`;
            typingIndicator.style.display = 'block';
        }
    });

    socket.on('stopTyping', () => {
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    });

    socket.on('permissionGranted', ({ permission }) => {
        if (permission === 'screenShare') {
            shareScreenBtn.disabled = false;
        } else if (permission === 'youtubeControl') {
            youtubeUrlInput.disabled = false;
            youtubePlayBtn.disabled = false;
        }
    });

    socket.on('permissionRevoked', ({ permission }) => {
        if (permission === 'screenShare') {
            shareScreenBtn.disabled = true;
        } else if (permission === 'youtubeControl') {
            youtubeUrlInput.disabled = true;
            youtubePlayBtn.disabled = true;
        }
    });

    socket.on('youtubeVideoUpdated', (youtubeState) => {
        if (!youtubePlayer) {
            loadYoutubeVideo(youtubeState.videoId, youtubeState.timestamp);
        } else {
            updateYoutubePlayer(youtubeState);
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket.IO bağlantısı kesildi');
        showNotification('Sunucu bağlantısı kesildi', 'error');
    });

    socket.on('error', (error) => {
        console.error('Socket.IO hatası:', error);
        showNotification('Bir hata oluştu', 'error');
    });
}

// DOM yüklendikten sonra elementleri al ve olayları başlat
document.addEventListener('DOMContentLoaded', () => {
    // DOM elementlerini al
    chatMessages = document.getElementById('chatMessages');
    messageInput = document.getElementById('messageInput');
    videoOverlay = document.getElementById('videoOverlay');
    roomIdSpan = document.querySelector('.room-id');
    userCountSpan = document.querySelector('.user-count span');
    typingIndicator = document.querySelector('.typing-indicator');
    sendBtn = document.querySelector('.send-btn');
    shareScreenBtn = document.querySelector('.share-screen-btn');
    copyBtn = document.querySelector('.copy-btn');
    leaveBtn = document.querySelector('.leave-btn');
    youtubeContainer = document.getElementById('youtubeContainer');
    youtubeUrlInput = document.getElementById('youtubeUrl');
    youtubePlayBtn = document.getElementById('youtubePlayBtn');
    userList = document.getElementById('userList');
    permissionsModal = document.getElementById('permissionsModal');

    // Event listener'ları ekle
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (shareScreenBtn) shareScreenBtn.addEventListener('click', startScreenShare);
    if (copyBtn) copyBtn.addEventListener('click', copyRoomLink);
    if (leaveBtn) leaveBtn.addEventListener('click', leaveRoom);
    if (youtubePlayBtn) youtubePlayBtn.addEventListener('click', handleYoutubeVideo);
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        messageInput.addEventListener('input', () => {
            if (!socket) return;
            
            if (!typingTimeout) {
                socket.emit('typing', { roomId: currentRoom, username: currentUser });
            }
            
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('stopTyping', { roomId: currentRoom, username: currentUser });
                typingTimeout = null;
            }, 1000);
        });
    }

    // Socket.IO bağlantısını başlat
    initializeSocket();
});

// Oda ID'sini URL'den al
const roomId = window.location.pathname.split('/').pop();

// Kullanıcı adını localStorage'dan al veya oluştur
let username = localStorage.getItem('username');
if (!username) {
    username = 'User_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('username', username);
}

// Bağlantı durumu
socket.on('connect', () => {
    showNotification('Connected to server', 'success');
});

socket.on('disconnect', () => {
    showNotification('Disconnected from server', 'error');
});

// Kullanıcı sayısını güncelle
socket.on('userCount', (count) => {
    if (userCountSpan) {
        userCountSpan.textContent = count;
    }
});

// Mesaj gönderme işlevi
function sendMessage() {
    if (!messageInput) return;
    
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('chatMessage', {
            roomId,
            username,
            message,
            timestamp: new Date().toISOString()
        });
        messageInput.value = '';
    }
}

// Mesaj alma
socket.on('chatMessage', (data) => {
    appendMessage(data);
});

// Mesajı sohbete ekle
function appendMessage(data) {
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.username === username ? 'own-message' : ''}`;
    
    const messageContent = `
        <div class="message-header">
            <span class="username">${data.username}</span>
            <span class="timestamp">${formatTimestamp(data.timestamp)}</span>
        </div>
        <div class="message-content">${data.message}</div>
    `;
    
    messageDiv.innerHTML = messageContent;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Yazıyor göstergesi
socket.on('typing', (data) => {
    if (!typingIndicator) return;
    
    if (data.username !== username) {
        typingIndicator.textContent = `${data.username} is typing...`;
        typingIndicator.style.display = 'block';
    }
});

socket.on('stopTyping', () => {
    if (!typingIndicator) return;
    typingIndicator.style.display = 'none';
});

// Ekran paylaşımı
async function startScreenShare() {
    if (!videoOverlay || !player) return;

    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.controls = true;
        
        const player = document.getElementById('player');
        player.innerHTML = '';
        player.appendChild(video);
        
        videoOverlay.style.display = 'none';
        
        // Stream kapandığında
        stream.getVideoTracks()[0].onended = () => {
            video.remove();
            videoOverlay.style.display = 'flex';
            showNotification('Screen sharing ended', 'info');
        };

        showNotification('Screen sharing started', 'success');
        
    } catch (error) {
        console.error('Error sharing screen:', error);
        showNotification('Failed to start screen sharing', 'error');
    }
}

// Oda linkini kopyala
function copyRoomLink() {
    const roomLink = window.location.href;
    navigator.clipboard.writeText(roomLink)
        .then(() => showNotification('Room link copied to clipboard!', 'success'))
        .catch(() => showNotification('Failed to copy room link', 'error'));
}

// Odadan ayrıl
function leaveRoom() {
    socket.emit('leaveRoom', { roomId, username });
    window.location.href = '/';
}

// Yardımcı fonksiyonlar
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Bildirim göster
function showNotification(message, type = 'info') {
    const container = document.querySelector('.notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// Socket events
socket.on('roomJoined', (data) => {
    isModerator = data.isModerator;
    updateUIForRole();
    
    if (data.youtube.videoId) {
        loadYoutubeVideo(data.youtube.videoId, data.youtube.timestamp);
    }
});

socket.on('permissionGranted', ({ permission }) => {
    if (permission === 'screenShare') {
        shareScreenBtn.disabled = false;
    } else if (permission === 'youtubeControl') {
        youtubeUrlInput.disabled = false;
        youtubePlayBtn.disabled = false;
    }
});

socket.on('permissionRevoked', ({ permission }) => {
    if (permission === 'screenShare') {
        shareScreenBtn.disabled = true;
    } else if (permission === 'youtubeControl') {
        youtubeUrlInput.disabled = true;
        youtubePlayBtn.disabled = true;
    }
});

socket.on('youtubeVideoUpdated', (youtubeState) => {
    if (!youtubePlayer) {
        loadYoutubeVideo(youtubeState.videoId, youtubeState.timestamp);
    } else {
        updateYoutubePlayer(youtubeState);
    }
});

// YouTube işlevleri
function loadYoutubeVideo(videoId, startTime = 0) {
    if (!youtubeContainer) return;
    
    if (!youtubePlayer) {
        youtubePlayer = new YT.Player('youtubeContainer', {
            height: '360',
            width: '640',
            videoId: videoId,
            playerVars: {
                start: Math.floor(startTime),
                controls: 1,
                modestbranding: 1
            },
            events: {
                onStateChange: onYoutubePlayerStateChange,
                onReady: () => {
                    youtubePlayer.seekTo(startTime, true);
                }
            }
        });
    } else {
        youtubePlayer.loadVideoById({
            videoId: videoId,
            startSeconds: startTime
        });
    }
}

function handleYoutubeVideo() {
    const url = youtubeUrlInput.value;
    const videoId = extractYoutubeVideoId(url);
    
    if (!videoId) {
        showNotification('Geçerli bir YouTube URL\'si girin', 'error');
        return;
    }
    
    socket.emit('youtubeVideoUpdate', {
        roomId: currentRoom,
        videoId: videoId,
        state: 'playing',
        timestamp: 0,
        volume: 100
    });
}

function onYoutubePlayerStateChange(event) {
    if (!isModerator && !hasPermission('youtubeControl')) return;
    
    const states = {
        '-1': 'unstarted',
        '0': 'ended',
        '1': 'playing',
        '2': 'paused',
        '3': 'buffering',
        '5': 'cued'
    };
    
    socket.emit('youtubeVideoUpdate', {
        roomId: currentRoom,
        videoId: youtubePlayer.getVideoData().video_id,
        state: states[event.data],
        timestamp: youtubePlayer.getCurrentTime(),
        volume: youtubePlayer.getVolume()
    });
}

function updateYoutubePlayer(state) {
    if (!youtubePlayer) return;
    
    if (state.state === 'playing') {
        youtubePlayer.playVideo();
    } else if (state.state === 'paused') {
        youtubePlayer.pauseVideo();
    }
    
    if (Math.abs(youtubePlayer.getCurrentTime() - state.timestamp) > 2) {
        youtubePlayer.seekTo(state.timestamp, true);
    }
    
    youtubePlayer.setVolume(state.volume);
}

function extractYoutubeVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : false;
}

// UI güncelleme
function updateUIForRole() {
    if (isModerator) {
        shareScreenBtn.disabled = false;
        youtubeUrlInput.disabled = false;
        youtubePlayBtn.disabled = false;
        document.querySelectorAll('.moderator-only').forEach(el => el.style.display = 'block');
    } else {
        shareScreenBtn.disabled = true;
        youtubeUrlInput.disabled = true;
        youtubePlayBtn.disabled = true;
        document.querySelectorAll('.moderator-only').forEach(el => el.style.display = 'none');
    }
}

function hasPermission(permission) {
    return isModerator || socket.hasPermission?.(permission);
}

// Kullanıcı listesini güncelle
function updateUserList(users) {
    if (!userList) return;
    
    userList.innerHTML = '';
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.innerHTML = `
            ${user.username} ${user.isModerator ? '(Moderatör)' : ''}
            ${isModerator && !user.isModerator ? `
                <button onclick="togglePermission('${user.id}', 'screenShare')">
                    ${hasPermission(user.id, 'screenShare') ? 'Ekran Paylaşımını Kapat' : 'Ekran Paylaşımına İzin Ver'}
                </button>
                <button onclick="togglePermission('${user.id}', 'youtubeControl')">
                    ${hasPermission(user.id, 'youtubeControl') ? 'Video Kontrolünü Kapat' : 'Video Kontrolüne İzin Ver'}
                </button>
            ` : ''}
        `;
        userList.appendChild(userElement);
    });
}

// İzinleri kontrol et
function hasPermission(userId, permission) {
    if (!socket) return false;
    const room = rooms?.get(currentRoom);
    if (!room) return false;
    return room.permissions.get(userId)?.has(permission) || false;
}
