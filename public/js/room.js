// Constants
const YOUTUBE_API_KEY = 'AIzaSyDVhKUC83wcj6Q_3auQVLnjRJFB_HzIom0';
const TYPING_TIMEOUT = 1000;
const NOTIFICATION_DURATION = 3000;

// Room Page Scripts
document.addEventListener('DOMContentLoaded', () => {
    // Initialize variables
    let player;
    let socket;
    const roomId = window.location.pathname.split('/').pop();
    let currentUser = {
        id: generateUserId(),
        name: localStorage.getItem('username') || generateUsername(),
        isHost: false,
        isMuted: false,
        hasCamera: false,
        isScreenSharing: false
    };

    // Initialize UI elements
    initializeUI();
    initializeSocket();
    initializeYouTubePlayer();
    initializeEventListeners();

    // UI Initialization
    function initializeUI() {
        // Set room ID
        document.getElementById('roomId').textContent = roomId;

        // Set user avatar
        const userAvatar = document.getElementById('userAvatar');
        userAvatar.src = generateAvatarUrl(currentUser.name);
        document.getElementById('userName').textContent = currentUser.name;

        // Initialize tabs
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                
                // Update active states
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                button.classList.add('active');
                document.getElementById(tabName + 'Tab').classList.add('active');
            });
        });

        // Initialize tooltips
        const buttons = document.querySelectorAll('[title]');
        buttons.forEach(button => {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = button.getAttribute('title');
            button.appendChild(tooltip);
        });
    }

    // Socket Initialization
    function initializeSocket() {
        socket = io({
            query: {
                roomId,
                userId: currentUser.id,
                username: currentUser.name
            }
        });

        // Socket event listeners
        socket.on('connect', () => {
            showNotification('Odaya bağlandınız', 'success');
        });

        socket.on('userJoined', (user) => {
            addParticipant(user);
            showNotification(`${user.name} odaya katıldı`, 'info');
        });

        socket.on('userLeft', (userId) => {
            removeParticipant(userId);
        });

        socket.on('hostAssigned', (hostId) => {
            currentUser.isHost = hostId === currentUser.id;
            updateUIForHost();
        });

        socket.on('chatMessage', (message) => {
            addChatMessage(message);
        });

        socket.on('videoStateChange', (state) => {
            if (state.type === 'play') {
                player.playVideo();
                player.seekTo(state.time);
            } else if (state.type === 'pause') {
                player.pauseVideo();
            }
        });

        socket.on('reaction', (data) => {
            showReaction(data.emoji, data.username);
        });
    }

    // YouTube Player Initialization
    function initializeYouTubePlayer() {
        player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'rel': 0
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }

    function onPlayerReady(event) {
        // Initialize volume slider
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.value = player.getVolume();
        
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value);
            player.setVolume(volume);
            updateVolumeIcon(volume);
        });

        // Initialize progress bar
        setInterval(updateProgressBar, 1000);
    }

    function onPlayerStateChange(event) {
        if (currentUser.isHost) {
            socket.emit('videoStateChange', {
                type: event.data === YT.PlayerState.PLAYING ? 'play' : 'pause',
                time: player.getCurrentTime()
            });
        }
    }

    // Event Listeners
    function initializeEventListeners() {
        // Video Controls
        document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
        document.getElementById('muteBtn').addEventListener('click', toggleMute);
        document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
        document.getElementById('progressBar').addEventListener('click', seekVideo);

        // Room Controls
        document.getElementById('copyRoomLink').addEventListener('click', copyRoomLink);
        document.getElementById('settingsBtn').addEventListener('click', openSettings);
        document.getElementById('micBtn').addEventListener('click', toggleMicrophone);
        document.getElementById('camBtn').addEventListener('click', toggleCamera);
        document.getElementById('screenShareBtn').addEventListener('click', toggleScreenShare);

        // Video Source Controls
        document.getElementById('youtubeBtn').addEventListener('click', () => {
            document.getElementById('videoUrlModal').classList.add('active');
        });
        document.getElementById('closeVideoUrlModal').addEventListener('click', () => {
            document.getElementById('videoUrlModal').classList.remove('active');
        });
        document.getElementById('loadVideoBtn').addEventListener('click', loadVideo);

        // Chat Controls
        const messageInput = document.getElementById('messageInput');
        const sendMessage = document.getElementById('sendMessage');

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });

        sendMessage.addEventListener('click', sendChatMessage);

        // Reaction Controls
        document.querySelectorAll('.reaction').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.emoji;
                socket.emit('reaction', { emoji, username: currentUser.name });
                showReaction(emoji, currentUser.name);
            });
        });
    }

    // Video Control Functions
    function togglePlayPause() {
        const button = document.getElementById('playPauseBtn');
        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
            player.pauseVideo();
            button.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            player.playVideo();
            button.innerHTML = '<i class="fas fa-pause"></i>';
        }
    }

    function toggleMute() {
        const button = document.getElementById('muteBtn');
        if (player.isMuted()) {
            player.unMute();
            button.innerHTML = '<i class="fas fa-volume-up"></i>';
        } else {
            player.mute();
            button.innerHTML = '<i class="fas fa-volume-mute"></i>';
        }
    }

    function toggleFullscreen() {
        const container = document.querySelector('.video-container');
        if (!document.fullscreenElement) {
            container.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function updateProgressBar() {
        if (player && player.getCurrentTime) {
            const currentTime = player.getCurrentTime();
            const duration = player.getDuration();
            const progress = (currentTime / duration) * 100;
            
            document.querySelector('.progress-filled').style.width = `${progress}%`;
            document.getElementById('currentTime').textContent = formatDuration(currentTime);
            document.getElementById('duration').textContent = formatDuration(duration);
        }
    }

    function seekVideo(e) {
        const progressBar = document.getElementById('progressBar');
        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const time = pos * player.getDuration();
        player.seekTo(time);
    }

    // Chat Functions
    function sendChatMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (message) {
            socket.emit('chatMessage', {
                userId: currentUser.id,
                username: currentUser.name,
                message,
                timestamp: new Date().toISOString()
            });
            input.value = '';
        }
    }

    function addChatMessage(message) {
        const messages = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.innerHTML = `
            <div class="message-header">
                <img src="${generateAvatarUrl(message.username)}" class="message-avatar" alt="${message.username}">
                <span class="message-username">${message.username}</span>
                <span class="message-time">${formatTime(new Date(message.timestamp))}</span>
            </div>
            <div class="message-content">${message.message}</div>
        `;
        messages.appendChild(messageElement);
        messages.scrollTop = messages.scrollHeight;
    }

    // Participant Functions
    function addParticipant(user) {
        const participantsList = document.getElementById('participants');
        const participantElement = document.createElement('div');
        participantElement.className = `participant ${user.isHost ? 'host' : ''}`;
        participantElement.dataset.userId = user.id;
        participantElement.innerHTML = `
            <img src="${generateAvatarUrl(user.username)}" class="participant-avatar" alt="${user.username}">
            <div class="participant-info">
                <span class="participant-name">${user.username}</span>
                ${user.isHost ? '<span class="participant-badge">Host</span>' : ''}
            </div>
            <div class="participant-controls">
                <button class="control-btn" title="Mikrofon">
                    <i class="fas fa-microphone${user.isMuted ? '-slash' : ''}"></i>
                </button>
                <button class="control-btn" title="Kamera">
                    <i class="fas fa-video${user.hasCamera ? '' : '-slash'}"></i>
                </button>
            </div>
        `;
        participantsList.appendChild(participantElement);
    }

    function removeParticipant(userId) {
        const participant = document.querySelector(`.participant[data-user-id="${userId}"]`);
        if (participant) {
            participant.remove();
        }
    }

    // Media Control Functions
    function toggleMicrophone() {
        const button = document.getElementById('micBtn');
        currentUser.isMuted = !currentUser.isMuted;
        button.classList.toggle('muted');
        button.innerHTML = `<i class="fas fa-microphone${currentUser.isMuted ? '-slash' : ''}"></i>`;
        socket.emit('mediaStateChange', { type: 'mic', state: !currentUser.isMuted });
    }

    function toggleCamera() {
        const button = document.getElementById('camBtn');
        currentUser.hasCamera = !currentUser.hasCamera;
        button.classList.toggle('active');
        button.innerHTML = `<i class="fas fa-video${currentUser.hasCamera ? '' : '-slash'}"></i>`;
        socket.emit('mediaStateChange', { type: 'camera', state: currentUser.hasCamera });
    }

    async function toggleScreenShare() {
        const button = document.getElementById('screenShareBtn');
        try {
            if (!currentUser.isScreenSharing) {
                const stream = await navigator.mediaDevices.getDisplayMedia();
                // Handle screen sharing stream
                currentUser.isScreenSharing = true;
                button.classList.add('active');
                showNotification('Ekran paylaşımı başlatıldı', 'success');
            } else {
                // Stop screen sharing
                currentUser.isScreenSharing = false;
                button.classList.remove('active');
                showNotification('Ekran paylaşımı durduruldu', 'info');
            }
        } catch (error) {
            showNotification('Ekran paylaşımı başlatılamadı', 'error');
        }
    }

    // Utility Functions
    function copyRoomLink() {
        const roomUrl = window.location.href;
        copyToClipboard(roomUrl);
    }

    function loadVideo() {
        const input = document.getElementById('videoUrlInput');
        const url = input.value.trim();
        const videoId = extractVideoId(url);
        
        if (videoId) {
            player.loadVideoById(videoId);
            document.getElementById('videoUrlModal').classList.remove('active');
            input.value = '';
            document.getElementById('videoOverlay').style.display = 'none';
        } else {
            showNotification('Geçersiz YouTube URL\'si', 'error');
        }
    }

    function extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    function showReaction(emoji, username) {
        const overlay = document.getElementById('reactionOverlay');
        const reaction = document.createElement('div');
        reaction.className = 'floating-reaction';
        reaction.innerHTML = `
            <div class="reaction-emoji">${emoji}</div>
            <div class="reaction-username">${username}</div>
        `;
        
        overlay.appendChild(reaction);
        
        // Animate and remove
        setTimeout(() => {
            reaction.remove();
        }, 3000);
    }

    function updateUIForHost() {
        const hostControls = document.querySelectorAll('.host-only');
        hostControls.forEach(control => {
            control.style.display = currentUser.isHost ? 'flex' : 'none';
        });
    }

    function updateVolumeIcon(volume) {
        const muteBtn = document.getElementById('muteBtn');
        if (volume === 0) {
            muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (volume < 50) {
            muteBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }
});

// Utility Functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;

    document.querySelector('.notification-container').appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, NOTIFICATION_DURATION);
}

function getNotificationIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
}

function formatTime(date) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function generateRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B6B6B', '#E9D985', '#7FD1B9', '#FF9EAA'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function generateRandomUsername() {
    const adjectives = ['Neşeli', 'Heyecanlı', 'Enerjik', 'Sevimli', 'Şaşkın', 'Meraklı', 'Mutlu', 'Hızlı', 'Akıllı', 'Güçlü'];
    const nouns = ['Penguen', 'Panda', 'Aslan', 'Kaplan', 'Tavşan', 'Kedi', 'Köpek', 'Kuş', 'Fil', 'Zürafa'];
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 100);
    
    return `${adjective}${noun}${number}`;
}

function generateAvatarUrl(username) {
    return `https://api.dicebear.com/6.x/fun-emoji/svg?seed=${username}`;
}

function generateUserId() {
    return `user_${Math.random().toString(36).substr(2, 9)}`;
}

function formatDuration(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
}
