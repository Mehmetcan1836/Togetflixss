// Constants
const NOTIFICATION_DURATION = 3000;

// Global Variables
let socket;
let player;
let currentUser = {
    id: generateUserId(),
    name: localStorage.getItem('username') || generateRandomUsername(),
    isHost: false
};
let roomId = window.location.pathname.split('/').pop();
let localStream = null;
let screenStream = null;
let nextPageToken = '';
let isSearching = false;
let lastSearchQuery = '';

// ============ Utility Functions ============
function generateUserId() {
    return `user_${Math.random().toString(36).substr(2, 9)}`;
}

function generateRandomUsername() {
    const adjectives = ['Neşeli', 'Heyecanlı', 'Enerjik', 'Sevimli', 'Şaşkın'];
    const nouns = ['Penguen', 'Panda', 'Aslan', 'Kaplan', 'Tavşan'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 100)}`;
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}-circle"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, NOTIFICATION_DURATION);
}

// ============ YouTube Player Functions ============
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'enablejsapi': 1,
            'origin': window.location.origin,
            'widget_referrer': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log('Player ready');
}

function onPlayerStateChange(event) {
    const videoOverlay = document.getElementById('videoOverlay');
    
    switch(event.data) {
        case YT.PlayerState.PLAYING:
            videoOverlay.style.display = 'none';
            if (socket) {
                socket.emit('video-state', {
                    state: 'play',
                    time: player.getCurrentTime()
                });
            }
            break;
            
        case YT.PlayerState.PAUSED:
            if (socket) {
                socket.emit('video-state', {
                    state: 'pause',
                    time: player.getCurrentTime()
                });
            }
            break;
            
        case YT.PlayerState.ENDED:
            videoOverlay.style.display = 'flex';
            break;
    }
}

// ============ Media Control Functions ============
async function toggleCamera() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const button = document.getElementById('toggleCameraBtn');
            button.classList.toggle('active', videoTrack.enabled);
            
            if (socket) {
                socket.emit('media-state-change', {
                    type: 'camera',
                    enabled: videoTrack.enabled
                });
            }
            
            showNotification(
                videoTrack.enabled ? 'Kamera açıldı' : 'Kamera kapatıldı',
                'info'
            );
        }
    } catch (error) {
        console.error('Camera toggle error:', error);
        showNotification('Kamera erişimi sağlanamadı', 'error');
    }
}

async function toggleMicrophone() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const button = document.getElementById('toggleMicBtn');
            button.classList.toggle('active', audioTrack.enabled);
            
            if (socket) {
                socket.emit('media-state-change', {
                    type: 'mic',
                    enabled: audioTrack.enabled
                });
            }
            
            showNotification(
                audioTrack.enabled ? 'Mikrofon açıldı' : 'Mikrofon kapatıldı',
                'info'
            );
        }
    } catch (error) {
        console.error('Microphone toggle error:', error);
        showNotification('Mikrofon erişimi sağlanamadı', 'error');
    }
}

async function toggleScreenShare() {
    try {
        const button = document.getElementById('screenShareBtn');
        const screenVideo = document.getElementById('screenShareVideo');
        const videoOverlay = document.getElementById('videoOverlay');
        
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            screenVideo.style.display = 'none';
            screenVideo.srcObject = null;
            button.classList.remove('active');
            showNotification('Ekran paylaşımı durduruldu', 'info');
            
            if (!player || !player.getVideoUrl()) {
                videoOverlay.style.display = 'flex';
            }
        } else {
            const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { 
                    cursor: "always",
                    displaySurface: "monitor"
                },
                audio: false
            });
            
            screenStream = stream;
            screenVideo.srcObject = stream;
            screenVideo.style.display = 'block';
            button.classList.add('active');
            videoOverlay.style.display = 'none';
            showNotification('Ekran paylaşımı başlatıldı', 'success');
            
            stream.getVideoTracks()[0].onended = () => {
                screenStream = null;
                screenVideo.style.display = 'none';
                screenVideo.srcObject = null;
                button.classList.remove('active');
                showNotification('Ekran paylaşımı durduruldu', 'info');
                
                if (!player || !player.getVideoUrl()) {
                    videoOverlay.style.display = 'flex';
                }
            };
        }
        
        if (socket) {
            socket.emit('media-state-change', {
                type: 'screen',
                enabled: button.classList.contains('active')
            });
        }
    } catch (error) {
        console.error('Screen share error:', error);
        showNotification('Ekran paylaşımında hata oluştu', 'error');
    }
}

// ============ Room Control Functions ============
function copyRoomLink() {
    const roomUrl = window.location.href;
    navigator.clipboard.writeText(roomUrl)
        .then(() => {
            showNotification('Oda bağlantısı kopyalandı', 'success');
        })
        .catch(() => {
            showNotification('Bağlantı kopyalanamadı', 'error');
        });
}

function leaveRoom() {
    if (confirm('Odadan ayrılmak istediğinize emin misiniz?')) {
        if (socket) {
            socket.disconnect();
        }
        window.location.href = '/';
    }
}

// ============ Chat Functions ============
function initializeChat() {
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const chatMessages = document.getElementById('chatMessages');

    // Send message on button click
    sendMessageBtn.addEventListener('click', () => {
        sendMessage();
    });

    // Send message on Enter key
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Socket event for receiving messages
    socket.on('chat-message', (data) => {
        addMessageToChat(data.sender, data.message, false);
    });
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (message) {
        socket.emit('chat-message', {
            roomId: roomId,
            message: message
        });
        
        addMessageToChat('You', message, true);
        messageInput.value = '';
    }
}

function addMessageToChat(sender, message, isOwn = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.className = `message${isOwn ? ' own' : ''}`;
    
    const time = new Date().toLocaleTimeString('tr-TR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${sender}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${message}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============ User List Functions ============
function updateUsersList(participants) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    participants.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.setAttribute('data-user-id', user.id);
        
        userItem.innerHTML = `
            <span class="user-name">${user.name}</span>
            <div class="user-media-status">
                <i class="fas fa-video camera-icon ${user.media.video ? 'active' : ''}"></i>
                <i class="fas fa-microphone mic-icon ${user.media.audio ? 'active' : ''}"></i>
                ${user.media.screen ? '<i class="fas fa-desktop screen-icon active"></i>' : ''}
            </div>
        `;
        
        usersList.appendChild(userItem);
    });
    
    // Update participant count
    const participantCount = document.getElementById('participantCount');
    if (participantCount) {
        participantCount.textContent = participants.length;
    }
}

// ============ Socket.IO Functions ============
function initializeSocket() {
    if (!localStorage.getItem('username')) {
        localStorage.setItem('username', currentUser.name);
    }

    socket = io(window.location.origin, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('Socket connected');
        socket.emit('join-room', { 
            roomId, 
            username: localStorage.getItem('username')
        });
        showNotification('Odaya bağlanıldı', 'success');
    });

    socket.on('room-joined', (data) => {
        updateUsersList(data.participants);
        showNotification(`${data.user.name} odaya katıldı`, 'info');
    });

    socket.on('user-left', (data) => {
        updateUsersList(data.participants);
        showNotification(`${data.user.name} odadan ayrıldı`, 'info');
    });

    socket.on('video-state', (data) => {
        if (data.userId !== socket.id && player) {
            if (data.state === 'play') {
                player.seekTo(data.time);
                player.playVideo();
            } else if (data.state === 'pause') {
                player.seekTo(data.time);
                player.pauseVideo();
            }
        }
    });

    socket.on('video-load', (data) => {
        if (data.userId !== socket.id && player) {
            player.loadVideoById(data.videoId);
            document.getElementById('videoOverlay').style.display = 'none';
        }
    });

    socket.on('media-state-change', (data) => {
        const userItem = document.querySelector(`[data-user-id="${data.userId}"]`);
        if (userItem) {
            const icon = userItem.querySelector(`.${data.type}-icon`);
            if (icon) {
                icon.classList.toggle('active', data.enabled);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        showNotification('Bağlantı kesildi', 'error');
    });

    socket.on('error', (error) => {
        console.error('Room error:', error);
        showNotification(error.message || 'Oda hatası', 'error');
    });
}

// ============ YouTube API Functions ============
async function searchYouTubeVideos(query, pageToken = '') {
    try {
        if (!query) return null;
        
        const API_KEY = 'AIzaSyAXwAfkwgrauvqXAi_Yo4QDRkIYQjVsUIc'; // Replace with your actual API key
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}${pageToken ? '&pageToken=' + pageToken : ''}`);
        
        if (!response.ok) {
            throw new Error('YouTube API error');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('YouTube search error:', error);
        showNotification('Video arama hatası', 'error');
        return null;
    }
}

function displayVideoResults(videos, append = false) {
    const resultsContainer = document.getElementById('videoResults');
    if (!resultsContainer) return;
    
    if (!append) {
        resultsContainer.innerHTML = '';
    }
    
    if (!videos || !videos.items || !Array.isArray(videos.items)) {
        resultsContainer.innerHTML = '<div class="no-results">Sonuç bulunamadı</div>';
        return;
    }
    
    videos.items.forEach(video => {
        const videoElement = document.createElement('div');
        videoElement.className = 'video-item';
        videoElement.innerHTML = `
            <div class="video-thumbnail">
                <img src="${video.snippet.thumbnails.medium.url}" alt="${video.snippet.title}">
            </div>
            <div class="video-info">
                <h4 class="video-title">${video.snippet.title}</h4>
                <p class="video-channel">${video.snippet.channelTitle}</p>
                <p class="video-metadata">
                    ${new Date(video.snippet.publishedAt).toLocaleDateString()}
                </p>
            </div>
        `;
        
        videoElement.addEventListener('click', () => {
            if (player && video.id && video.id.videoId) {
                player.loadVideoById(video.id.videoId);
                closeVideoModal();
                document.getElementById('videoOverlay').style.display = 'none';
                if (socket) {
                    socket.emit('video-load', {
                        videoId: video.id.videoId
                    });
                }
            }
        });
        
        resultsContainer.appendChild(videoElement);
    });
}

function handleVideoSearch() {
    const query = document.getElementById('videoSearchInput').value.trim();
    if (query === lastSearchQuery) return;
    
    lastSearchQuery = query;
    nextPageToken = '';
    isSearching = true;
    
    searchYouTubeVideos(query)
        .then(data => {
            if (data) {
                nextPageToken = data.nextPageToken;
                displayVideoResults(data.items);
            }
            isSearching = false;
        });
}

function handleVideoScroll(event) {
    const container = event.target;
    if (isSearching || !nextPageToken) return;
    
    const scrollPosition = container.scrollTop + container.clientHeight;
    const scrollHeight = container.scrollHeight;
    
    if (scrollPosition >= scrollHeight - 100) {
        isSearching = true;
        
        searchYouTubeVideos(lastSearchQuery, nextPageToken)
            .then(data => {
                if (data) {
                    nextPageToken = data.nextPageToken;
                    displayVideoResults(data.items, true);
                }
                isSearching = false;
            });
    }
}

function showVideoModal() {
    const modalOverlay = document.getElementById('videoModalOverlay');
    const modal = document.getElementById('videoSearchModal');
    if (modalOverlay && modal) {
        modalOverlay.style.display = 'block';
        modal.style.display = 'block';
        const searchInput = document.getElementById('videoSearchInput');
        if (searchInput) {
            searchInput.focus();
        }
    }
}

function closeVideoModal() {
    const modalOverlay = document.getElementById('videoModalOverlay');
    const modal = document.getElementById('videoSearchModal');
    if (modalOverlay && modal) {
        modalOverlay.style.display = 'none';
        modal.style.display = 'none';
    }
}

// ============ Event Listeners ============
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing room...');
    
    // Initialize socket connection
    initializeSocket();
    initializeChat();
    
    // Set up video overlay and modal
    const videoOverlay = document.getElementById('videoOverlay');
    const videoSearchInput = document.getElementById('videoSearchInput');
    const videoResults = document.getElementById('videoResults');
    const closeVideoModalBtn = document.getElementById('closeVideoModal');
    const modalOverlay = document.getElementById('videoModalOverlay');

    // Set up media control buttons
    const toggleCameraBtn = document.getElementById('toggleCameraBtn');
    const toggleMicBtn = document.getElementById('toggleMicBtn');
    const screenShareBtn = document.getElementById('screenShareBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');

    // Initialize media controls
    if (toggleCameraBtn) {
        toggleCameraBtn.addEventListener('click', toggleCamera);
    }

    if (toggleMicBtn) {
        toggleMicBtn.addEventListener('click', toggleMicrophone);
    }

    if (screenShareBtn) {
        screenShareBtn.addEventListener('click', toggleScreenShare);
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('settingsModal');
            if (modal) modal.style.display = 'block';
        });
    }

    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', leaveRoom);
    }

    if (videoOverlay) {
        videoOverlay.addEventListener('click', showVideoModal);
    }

    if (videoSearchInput) {
        videoSearchInput.addEventListener('input', debounce(handleVideoSearch, 500));
    }

    if (videoResults) {
        videoResults.addEventListener('scroll', handleVideoScroll);
    }

    if (closeVideoModalBtn) {
        closeVideoModalBtn.addEventListener('click', closeVideoModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeVideoModal);
    }

    // Initialize media devices
    initializeMediaDevices();
});

async function initializeMediaDevices() {
    try {
        // First try to get both video and audio
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
        } catch (err) {
            // If that fails, try to get only audio
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: false, 
                    audio: true 
                });
            } catch (audioErr) {
                // If that fails too, try to get only video
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ 
                        video: true, 
                        audio: false 
                    });
                } catch (videoErr) {
                    // If everything fails, show error
                    console.error('Media devices error:', err);
                    showNotification('Medya cihazlarına erişilemedi', 'error');
                    return;
                }
            }
        }
        
        // Initially disable both tracks
        if (localStream.getVideoTracks().length > 0) {
            localStream.getVideoTracks().forEach(track => track.enabled = false);
        }
        if (localStream.getAudioTracks().length > 0) {
            localStream.getAudioTracks().forEach(track => track.enabled = false);
        }
        
        // Update button states
        updateMediaButtonStates();
        
    } catch (error) {
        console.error('Media devices error:', error);
        showNotification('Medya cihazlarına erişilemedi', 'error');
    }
}

function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function updateParticipantCount(count) {
    const countElement = document.getElementById('participantCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}
