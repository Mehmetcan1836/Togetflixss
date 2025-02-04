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
    // Handle player state changes
    switch(event.data) {
        case YT.PlayerState.PLAYING:
            document.getElementById('videoOverlay').style.display = 'none';
            break;
        case YT.PlayerState.ENDED:
            document.getElementById('videoOverlay').style.display = 'flex';
            break;
    }
}

// ============ Media Control Functions ============
async function toggleCamera() {
    try {
        const button = document.getElementById('toggleCameraBtn');
        
        if (localStream && localStream.getVideoTracks().length > 0) {
            localStream.getVideoTracks().forEach(track => track.stop());
            button.classList.remove('active');
            showNotification('Kamera kapatıldı', 'info');
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            localStream = stream;
            button.classList.add('active');
            showNotification('Kamera açıldı', 'success');
        }
        
        if (socket) {
            socket.emit('mediaStateChange', {
                type: 'camera',
                enabled: button.classList.contains('active')
            });
        }
    } catch (error) {
        console.error('Camera error:', error);
        showNotification('Kamera erişiminde hata oluştu', 'error');
    }
}

async function toggleMicrophone() {
    try {
        const button = document.getElementById('toggleMicBtn');
        
        if (localStream && localStream.getAudioTracks().length > 0) {
            localStream.getAudioTracks().forEach(track => track.stop());
            button.classList.remove('active');
            showNotification('Mikrofon kapatıldı', 'info');
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream = stream;
            button.classList.add('active');
            showNotification('Mikrofon açıldı', 'success');
        }
        
        if (socket) {
            socket.emit('mediaStateChange', {
                type: 'microphone',
                enabled: button.classList.contains('active')
            });
        }
    } catch (error) {
        console.error('Microphone error:', error);
        showNotification('Mikrofon erişiminde hata oluştu', 'error');
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
            
            // Video yüklenmemişse overlay'i göster
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
            
            // Ekran paylaşımı durdurulduğunda
            stream.getVideoTracks()[0].onended = () => {
                screenStream = null;
                screenVideo.style.display = 'none';
                screenVideo.srcObject = null;
                button.classList.remove('active');
                showNotification('Ekran paylaşımı durduruldu', 'info');
                
                // Video yüklenmemişse overlay'i göster
                if (!player || !player.getVideoUrl()) {
                    videoOverlay.style.display = 'flex';
                }
            };
        }
        
        if (socket) {
            socket.emit('mediaStateChange', {
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
    const roomLink = window.location.href;
    navigator.clipboard.writeText(roomLink)
        .then(() => {
            showNotification('Oda bağlantısı kopyalandı', 'success');
        })
        .catch(() => {
            showNotification('Bağlantı kopyalanamadı', 'error');
        });
}

function leaveRoom() {
    if (socket) {
        socket.disconnect();
    }
    window.location.href = '/';
}

// ============ Chat Functions ============
function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message && socket) {
        socket.emit('chatMessage', {
            user: currentUser,
            message: message,
            timestamp: new Date().toISOString()
        });
        input.value = '';
    }
}

function addMessageToChat(data) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.innerHTML = `
        <strong>${data.user.name}:</strong> ${data.message}
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============ Socket.IO Functions ============
function initializeSocket() {
    // Make sure we have a username
    if (!localStorage.getItem('username')) {
        localStorage.setItem('username', currentUser.name);
    }

    // Initialize socket connection
    socket = io(window.location.origin, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('Socket connected');
        // Join room after connection
        socket.emit('join-room', { 
            roomId, 
            username: localStorage.getItem('username') || currentUser.name
        });
        showNotification('Odaya bağlanıldı', 'success');
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showNotification('Bağlantı hatası', 'error');
    });

    socket.on('room-joined', (data) => {
        console.log('Room joined:', data);
        showNotification(`${data.user.name} odaya katıldı`, 'info');
        updateParticipantCount(data.participants.length);
        
        // Update users list
        const usersList = document.getElementById('usersList');
        if (usersList) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.setAttribute('data-user-id', data.user.id);
            userItem.innerHTML = `
                <span class="user-name">${data.user.name}</span>
                <div class="user-media-status">
                    <i class="fas fa-video camera-icon"></i>
                    <i class="fas fa-microphone mic-icon"></i>
                </div>
            `;
            usersList.appendChild(userItem);
        }
    });

    socket.on('user-left', (data) => {
        console.log('User left:', data);
        showNotification(`${data.user.name} odadan ayrıldı`, 'info');
        updateParticipantCount(data.participants.length);
        
        // Remove user from list
        const userItem = document.querySelector(`[data-user-id="${data.user.id}"]`);
        if (userItem) {
            userItem.remove();
        }
    });

    socket.on('chat-message', (data) => {
        addMessageToChat(data);
    });

    socket.on('media-state-change', (data) => {
        // Update other users' media states
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
        
        const API_KEY = 'AIzaSyDVhKUC83wcj6Q_3auQVLnjRJFB_HzIom0'; // Replace with your actual API key
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
    
    // Set up video overlay and modal
    const videoOverlay = document.getElementById('videoOverlay');
    const videoSearchInput = document.getElementById('videoSearchInput');
    const videoResults = document.getElementById('videoResults');
    const closeVideoModalBtn = document.getElementById('closeVideoModal');
    const modalOverlay = document.getElementById('videoModalOverlay');

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

    // Prevent modal close when clicking inside
    const videoSearchModal = document.getElementById('videoSearchModal');
    if (videoSearchModal) {
        videoSearchModal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Initialize media devices with fallback
    initializeMediaDevices();

    console.log('Room initialization complete');
});

async function initializeMediaDevices() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        localStream = stream;
        // Start with devices disabled
        stream.getTracks().forEach(track => track.enabled = false);
        
    } catch (error) {
        console.log('Media device initialization with fallback:', error.name);
        
        // Try audio only if video fails
        if (error.name === 'NotFoundError' || error.name === 'NotAllowedError') {
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true 
                });
                localStream = audioStream;
                audioStream.getTracks().forEach(track => track.enabled = false);
            } catch (audioError) {
                console.error('Audio device error:', audioError);
                showNotification('Mikrofon erişimi sağlanamadı', 'warning');
            }
        } else {
            showNotification('Medya cihazlarına erişim reddedildi', 'warning');
        }
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
