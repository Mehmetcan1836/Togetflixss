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
            'controls': 1,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    console.log('Player ready');
    document.getElementById('videoOverlay').style.display = 'flex';
}

function onPlayerStateChange(event) {
    if (socket) {
        socket.emit('videoStateChange', {
            state: event.data,
            time: player.getCurrentTime()
        });
    }
}

function onPlayerError(event) {
    console.error('Player error:', event.data);
    showNotification('Video yüklenirken bir hata oluştu', 'error');
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
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=YOUR_API_KEY${pageToken ? '&pageToken=' + pageToken : ''}`);
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
    
    if (!append) {
        resultsContainer.innerHTML = '';
    }
    
    videos.forEach(video => {
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
            loadVideo(video.id.videoId);
            closeVideoModal();
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
    const modal = document.getElementById('videoUrlModal');
    modal.style.display = 'block';
    document.getElementById('videoSearchInput').focus();
}

function closeVideoModal() {
    const modal = document.getElementById('videoUrlModal');
    modal.style.display = 'none';
}

// ============ Event Listeners ============
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing room...');
    
    // Initialize socket connection
    initializeSocket();
    
    // Set up video overlay
    const videoOverlay = document.getElementById('videoOverlay');
    const videoSearchInput = document.getElementById('videoSearchInput');
    const videoResults = document.getElementById('videoResults');
    const closeVideoModalBtn = document.getElementById('closeVideoUrlModal');

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

    // Set up media control buttons
    const toggleCameraBtn = document.getElementById('toggleCameraBtn');
    const toggleMicBtn = document.getElementById('toggleMicBtn');
    const screenShareBtn = document.getElementById('screenShareBtn');
    const settingsBtn = document.getElementById('settingsBtn');

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
            document.getElementById('settingsModal').style.display = 'block';
        });
    }

    // Set up room control buttons
    const copyRoomLinkBtn = document.getElementById('copyRoomLink');
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');

    if (copyRoomLinkBtn) {
        copyRoomLinkBtn.addEventListener('click', copyRoomLink);
    }

    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', leaveRoom);
    }

    // Set up chat
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');

    if (sendMessageBtn && messageInput) {
        sendMessageBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // Set up room info
    const roomIdElement = document.getElementById('roomId');
    if (roomIdElement) {
        roomIdElement.textContent = roomId;
    }

    // Initialize media devices
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            stream.getTracks().forEach(track => track.enabled = false);
        })
        .catch(error => {
            console.error('Media device error:', error);
            showNotification('Kamera ve mikrofon erişimi reddedildi', 'error');
        });

    console.log('Room initialization complete');
});

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
