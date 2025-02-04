// Initialize socket connection with retry logic
let socket;
let retryCount = 0;
const maxRetries = 3;

function initializeSocket() {
    socket = io(window.location.origin, {
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
    });

    // Socket event handlers
    socket.on('connect', () => {
        console.log('Socket connected successfully');
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').style.color = 'green';
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        document.getElementById('status').textContent = 'Connection Error';
        document.getElementById('status').style.color = 'red';
        
        if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(() => {
                socket.connect();
            }, 2000);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').style.color = 'red';
    });

    return socket;
}

// Ana sayfa işlevleri
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    initializeSocket();

    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');
    const roomIdInput = document.getElementById('roomId');
    const usernameInput = document.getElementById('username');

    // Kullanıcı tercihlerini yükle
    const prefs = utils.getUserPreferences();
    if (prefs.username) {
        usernameInput.value = prefs.username;
    }

    // Oda oluştur
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', async () => {
            try {
                const username = usernameInput.value.trim() || utils.generateUsername();
                
                // Kullanıcı adını kaydet
                localStorage.setItem('username', username);
                utils.saveUserPreferences({ ...prefs, username });

                const response = await fetch('/api/rooms', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                if (data.roomId) {
                    window.location.href = `/room/${data.roomId}`;
                } else {
                    throw new Error('Oda ID alınamadı');
                }
            } catch (error) {
                console.error('Oda oluşturma hatası:', error);
                utils.showNotification('Oda oluşturulurken bir hata oluştu', 'error');
            }
        });
    }

    // Odaya katıl
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            const roomId = roomIdInput.value.trim();
            const username = usernameInput.value.trim() || utils.generateUsername();
            
            if (!roomId) {
                utils.showNotification('Lütfen bir oda ID girin', 'error');
                return;
            }

            // Kullanıcı adını kaydet
            localStorage.setItem('username', username);
            utils.saveUserPreferences({ ...prefs, username });

            // Odaya yönlendir
            window.location.href = `/room/${roomId}`;
        });
    }

    // Enter tuşu ile form gönderimi
    [roomIdInput, usernameInput].forEach(input => {
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (roomIdInput.value) {
                        joinRoomBtn?.click();
                    } else {
                        createRoomBtn?.click();
                    }
                }
            });
        }
    });
});
