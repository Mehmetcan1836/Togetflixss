// Constants
const NOTIFICATION_DURATION = 3000;
const SOCKET_RECONNECT_ATTEMPTS = 5;
const SOCKET_RECONNECT_DELAY = 1000;

// Global Variables
let socket;
let localStream;
let player;
let screenStream;
let currentUser = {
    id: generateUserId(),
    name: localStorage.getItem('username') || generateRandomUsername(),
    isHost: false
};
let roomId = window.location.pathname.split('/').pop() || '';

// Media States
const mediaStates = {
    camera: false,
    microphone: false,
    screen: false
};

// Helper Functions
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

function toggleMediaTrack(track, buttonId, mediaType) {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ [mediaType]: true });
        }

        const trackInstance = localStream.getTracks().find(t => t.kind === mediaType);
        if (trackInstance) {
            trackInstance.enabled = !trackInstance.enabled;
            const button = document.getElementById(buttonId);
            button.classList.toggle('active', trackInstance.enabled);
            
            if (socket) {
                socket.emit('media-state-change', {
                    type: mediaType,
                    enabled: trackInstance.enabled
                });
            }
            
            showNotification(
                trackInstance.enabled ? `${track} açıldı` : `${track} kapatıldı`,
                'info'
            );
        }
    } catch (error) {
        console.error(`${track} toggle error:`, error);
        showNotification(`${track} erişimi sağlanamadı`, 'error');
    }
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

// ============ YouTube API Functions ============
async function searchYouTubeVideos(query, pageToken = '') {
    try {
        const response = await fetch(`/api/search/youtube?q=${encodeURIComponent(query)}&pageToken=${pageToken}`);
        const data = await response.json();
        displayVideoResults(data.items, false);
        return data.nextPageToken;
    } catch (error) {
        console.error('YouTube search error:', error);
        showNotification('YouTube araması başarısız oldu', 'error');
    }
}

function displayVideoResults(videos, append = false) {
    const videoResults = document.getElementById('videoResults');
    const videoList = append ? videoResults.querySelector('.video-list') : document.createElement('div');
    videoList.className = 'video-list';

    videos.forEach(video => {
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.innerHTML = `
            <img src="${video.snippet.thumbnails.medium.url}" alt="${video.snippet.title}">
            <div class="video-info">
                <h3>${video.snippet.title}</h3>
                <p>${video.snippet.channelTitle}</p>
            </div>
        `;
        videoItem.addEventListener('click', () => {
            loadYouTubeVideo(video.id.videoId);
        });
        videoList.appendChild(videoItem);
    });

    if (!append) {
        videoResults.innerHTML = '';
        videoResults.appendChild(videoList);
    }
}

async function loadYouTubeVideo(videoId) {
    try {
        player.loadVideoById(videoId);
        document.getElementById('videoOverlay').style.display = 'none';
        
        if (socket) {
            socket.emit('video-load', {
                videoId,
                userId: socket.id
            });
        }
    } catch (error) {
        console.error('Video load error:', error);
        showNotification('Video yüklenemedi', 'error');
    }
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
    await toggleMediaTrack('Kamera', 'toggleCameraBtn', 'video');
}

async function toggleMicrophone() {
    await toggleMediaTrack('Mikrofon', 'toggleMicBtn', 'audio');
}

// ============ Media Button State Functions ============
function updateMediaButtonStates() {
    const cameraBtn = document.getElementById('toggleCameraBtn');
    const micBtn = document.getElementById('toggleMicBtn');
    const screenBtn = document.getElementById('screenShareBtn');
    
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        const audioTracks = localStream.getAudioTracks();
        
        if (videoTracks.length > 0) {
            const isCameraEnabled = videoTracks[0].enabled;
            cameraBtn.classList.toggle('active', isCameraEnabled);
            cameraBtn.title = isCameraEnabled ? 'Kamera Kapalı' : 'Kamera Açık';
        }
        
        if (audioTracks.length > 0) {
            const isMicEnabled = audioTracks[0].enabled;
            micBtn.classList.toggle('active', isMicEnabled);
            micBtn.title = isMicEnabled ? 'Mikrofon Kapalı' : 'Mikrofon Açık';
        }
    }
    
    if (screenStream) {
        screenBtn.classList.add('active');
        screenBtn.title = 'Ekran Paylaşımı Aktif';
    } else {
        screenBtn.classList.remove('active');
        screenBtn.title = 'Ekran Paylaşımı';
    }
}

async function initializeMediaDevices() {
    try {
        console.log('Initializing media devices...');
        localStream = null;
        
        try {
            // First try to get both video and audio
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: true 
                });
            } catch (err) {
                if (err.name === 'NotAllowedError') {
                    showNotification('Kamera ve mikrofona erişim izni verilmedi', 'error');
                } else if (err.name === 'NotFoundError') {
                    showNotification('Kamera veya mikrofon bulunamadı', 'error');
                } else if (err.name === 'NotReadableError') {
                    showNotification('Kamera veya mikrofon meşgul', 'error');
                } else {
                    showNotification('Medya cihazları hatası: ' + err.message, 'error');
                }
                console.error('Media devices error:', err);
                return;
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
            
            // Add event listeners for track changes
            localStream.getTracks().forEach(track => {
                track.addEventListener('ended', () => {
                    console.log('Track ended:', track.kind);
                    updateMediaButtonStates();
                });
                track.addEventListener('mute', () => {
                    console.log('Track muted:', track.kind);
                    updateMediaButtonStates();
                });
                track.addEventListener('unmute', () => {
                    console.log('Track unmuted:', track.kind);
                    updateMediaButtonStates();
                });
            });
        } catch (error) {
            console.error('Failed to initialize media devices:', error);
            showNotification('Medya cihazları başlatılamadı', 'error');
        }
    } catch (error) {
        console.error('Media initialization error:', error);
        showNotification('Medya cihazları başlatılamadı', 'error');
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
        reconnectionAttempts: SOCKET_RECONNECT_ATTEMPTS,
        reconnectionDelay: SOCKET_RECONNECT_DELAY,
        autoConnect: false
    });

    socket.on('connect', () => {
        console.log('Socket connected');
        socket.emit('join-room', { 
            roomId, 
            username: localStorage.getItem('username')
        });
        showNotification('Odaya bağlanıldı', 'success');
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showNotification('Bağlantı hatası: ' + error.message, 'error');
        if (socket.reconnectionAttempts > SOCKET_RECONNECT_ATTEMPTS) {
            showNotification('Bağlantı yeniden kurulamadı', 'error');
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        showNotification('Bağlantı kesildi', 'error');
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected after', attemptNumber, 'attempts');
        showNotification('Bağlantı yeniden kuruldu', 'success');
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

    // Bağlantıyı başlat
    socket.connect();
}
}

// ============ YouTube API Functions ============
async function searchYouTubeVideos(query, pageToken = '') {
    try {
        if (!query) return null;
        
        const API_KEY = localStorage.getItem('youtubeApiKey') || 'AIzaSyB2jQGkX1zQpMzQdDQzQdDQzQdDQzQ';
        if (!API_KEY) {
            throw new Error('YouTube API anahtarı eksik');
        }
        
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}${pageToken ? '&pageToken=' + pageToken : ''}`);
        
        if (!response.ok) {
            throw new Error('YouTube API error');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('YouTube search error:', error);
        showNotification('Video arama hatası: ' + error.message, 'error');
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

// ============ Media Button State Functions ============
function updateMediaButtonStates() {
    const cameraBtn = document.getElementById('toggleCameraBtn');
    const micBtn = document.getElementById('toggleMicBtn');
    
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        const audioTracks = localStream.getAudioTracks();
        
        if (videoTracks.length > 0) {
            const isCameraEnabled = videoTracks[0].enabled;
            cameraBtn.classList.toggle('active', isCameraEnabled);
            cameraBtn.title = isCameraEnabled ? 'Kamera Kapalı' : 'Kamera Açık';
        }
        
        if (audioTracks.length > 0) {
            const isMicEnabled = audioTracks[0].enabled;
            micBtn.classList.toggle('active', isMicEnabled);
            micBtn.title = isMicEnabled ? 'Mikrofon Kapalı' : 'Mikrofon Açık';
        }
    }
}

async function initializeMediaDevices() {
    try {
        // First try to get both video and audio
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                showNotification('Kamera ve mikrofona erişim izni verilmedi', 'error');
            } else if (err.name === 'NotFoundError') {
                showNotification('Kamera veya mikrofon bulunamadı', 'error');
            } else if (err.name === 'NotReadableError') {
                showNotification('Kamera veya mikrofon meşgul', 'error');
            } else {
                showNotification('Medya cihazları hatası: ' + err.message, 'error');
            }
            console.error('Media devices error:', err);
            return;
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
        
        // Add event listeners for track changes
        localStream.getTracks().forEach(track => {
            track.addEventListener('ended', () => {
                console.log('Track ended:', track.kind);
                updateMediaButtonStates();
            });
            track.addEventListener('mute', () => {
                console.log('Track muted:', track.kind);
                updateMediaButtonStates();
            });
            track.addEventListener('unmute', () => {
                console.log('Track unmuted:', track.kind);
                updateMediaButtonStates();
            });
        });
    } catch (error) {
        console.error('Media devices error:', error);
        showNotification('Medya cihazlarına erişilemedi: ' + error.message, 'error');
    }
}

// ============ Event Listeners ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing room...');
    
    // Initialize everything
    initializeSocket();
    initializeChat();
    
    try {
        await initializeMediaDevices();
    } catch (error) {
        console.error('Media devices initialization failed:', error);
        showNotification('Medya cihazları başlatılamadı', 'error');
    }

    // Add event listeners
    const searchBtn = document.getElementById('searchBtn');
    const videoSearchInput = document.getElementById('videoSearchInput');
    const videoResults = document.getElementById('videoResults');
    const toggleCameraBtn = document.getElementById('toggleCameraBtn');
    const toggleMicBtn = document.getElementById('toggleMicBtn');
    const screenShareBtn = document.getElementById('screenShareBtn');
    const copyRoomLinkBtn = document.getElementById('copyRoomLinkBtn');
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');

    if (searchBtn) searchBtn.addEventListener('click', handleVideoSearch);
    if (videoSearchInput) videoSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleVideoSearch();
    });
    if (videoResults) videoResults.addEventListener('scroll', handleVideoScroll);
    if (toggleCameraBtn) toggleCameraBtn.addEventListener('click', toggleCamera);
    if (toggleMicBtn) toggleMicBtn.addEventListener('click', toggleMicrophone);
    if (screenShareBtn) screenShareBtn.addEventListener('click', toggleScreenShare);
    if (copyRoomLinkBtn) copyRoomLinkBtn.addEventListener('click', copyRoomLink);
    if (leaveRoomBtn) leaveRoomBtn.addEventListener('click', leaveRoom);
    if (sendMessageBtn) sendMessageBtn.addEventListener('click', sendMessage);
    if (messageInput) messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});

// ============ Helper Functions ============
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
