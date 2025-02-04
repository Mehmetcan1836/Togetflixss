// Global state
let currentUser = null;
let currentRoom = null;
let isTyping = false;
let typingTimeout = null;

// Socket.IO bağlantısı
let socket = null;

// DOM elementleri
let chatMessages, messageInput, videoOverlay, roomIdSpan, userCountSpan, typingIndicator;
let sendBtn, shareScreenBtn, copyBtn, leaveBtn;

// DOM yüklendikten sonra elementleri al
document.addEventListener('DOMContentLoaded', () => {
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

    socket = io(window.location.hostname === 'localhost' 
        ? 'http://localhost:3000'
        : 'https://togetflix-mehmetcan1836s-projects.vercel.app');

    // Event listener'ları ekle
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (shareScreenBtn) shareScreenBtn.addEventListener('click', startScreenShare);
    if (copyBtn) copyBtn.addEventListener('click', copyRoomLink);
    if (leaveBtn) leaveBtn.addEventListener('click', leaveRoom);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        messageInput.addEventListener('input', () => {
            if (!typingTimeout) {
                socket.emit('typing', { roomId, username });
            }
            
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('stopTyping', { roomId, username });
                typingTimeout = null;
            }, 1000);
        });
    }

    // Oda ID'sini ayarla
    if (roomIdSpan) {
        roomIdSpan.textContent = `Room ID: ${roomId}`;
    }

    // Odaya katıl
    socket.emit('joinRoom', { roomId, username });
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
