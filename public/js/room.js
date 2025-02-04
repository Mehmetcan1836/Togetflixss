// Global state
let socket = null;
let currentUser = null;
let currentRoom = null;
let isTyping = false;
let typingTimeout = null;

// Socket.IO bağlantısı
const socket = io(window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://togetflix-mehmetcan1836s-projects.vercel.app');

// DOM elementleri
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const videoOverlay = document.getElementById('videoOverlay');
const roomIdSpan = document.querySelector('.room-id');
const userCountSpan = document.querySelector('.user-count span');
const typingIndicator = document.querySelector('.typing-indicator');
const sendBtn = document.querySelector('.send-btn');
const shareScreenBtn = document.querySelector('.share-screen-btn');
const copyBtn = document.querySelector('.copy-btn');
const leaveBtn = document.querySelector('.leave-btn');

// Oda ID'sini URL'den al
const roomId = window.location.pathname.split('/').pop();
roomIdSpan.textContent = `Room ID: ${roomId}`;

// Kullanıcı adını localStorage'dan al veya oluştur
let username = localStorage.getItem('username');
if (!username) {
    username = 'User_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('username', username);
}

// Odaya katıl
socket.emit('joinRoom', { roomId, username });

// Bağlantı durumu
socket.on('connect', () => {
    showNotification('Connected to server', 'success');
});

socket.on('disconnect', () => {
    showNotification('Disconnected from server', 'error');
});

// Kullanıcı sayısını güncelle
socket.on('userCount', (count) => {
    userCountSpan.textContent = count;
});

// Mesaj gönderme işlevi
function sendMessage() {
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

// Enter tuşu ile mesaj gönderme
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Send butonu ile mesaj gönderme
if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}

// Mesaj alma
socket.on('chatMessage', (data) => {
    appendMessage(data);
});

// Mesajı sohbete ekle
function appendMessage(data) {
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
let typingTimeout;
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

socket.on('typing', (data) => {
    if (data.username !== username) {
        typingIndicator.textContent = `${data.username} is typing...`;
        typingIndicator.style.display = 'block';
    }
});

socket.on('stopTyping', () => {
    typingIndicator.style.display = 'none';
});

// Ekran paylaşımı
async function startScreenShare() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.controls = true; // Video kontrollerini ekle
        
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

// Ekran paylaşma butonu
if (shareScreenBtn) {
    shareScreenBtn.addEventListener('click', startScreenShare);
}

// Oda linkini kopyala
function copyRoomLink() {
    const roomLink = window.location.href;
    navigator.clipboard.writeText(roomLink)
        .then(() => showNotification('Room link copied to clipboard!', 'success'))
        .catch(() => showNotification('Failed to copy room link', 'error'));
}

// Oda linkini kopyalama butonu
if (copyBtn) {
    copyBtn.addEventListener('click', copyRoomLink);
}

// Odadan ayrıl
function leaveRoom() {
    socket.emit('leaveRoom', { roomId, username });
    window.location.href = '/';
}

// Odadan ayrılma butonu
if (leaveBtn) {
    leaveBtn.addEventListener('click', leaveRoom);
}

// Yardımcı fonksiyonlar
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Bildirim göster
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const container = document.querySelector('.notification-container');
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}
