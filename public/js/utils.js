// Yardımcı fonksiyonlar
function generateUserId() {
    return `user_${Math.random().toString(36).substr(2, 9)}`;
}

function generateRoomId() {
    return Math.random().toString(36).substr(2, 9);
}

function generateRandomUsername() {
    const adjectives = ['Mutlu', 'Üzgün', 'Kızgın', 'Çılgın', 'Uykulu', 'Aç'];
    const nouns = ['Kedi', 'Köpek', 'Kuş', 'Balık', 'Aslan', 'Kaplan'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

function generateRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function generateAvatarUrl(username) {
    return `https://api.dicebear.com/6.x/personas/svg?seed=${username}`;
}

// Bildirim gösterme
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

// Tarih/saat biçimlendirme
function formatTime(date) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// String işlemleri
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// URL işlemleri
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

function updateQueryParam(param, value) {
    const url = new URL(window.location.href);
    url.searchParams.set(param, value);
    window.history.replaceState({}, '', url);
}

// LocalStorage işlemleri
function setLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error('LocalStorage kayıt hatası:', error);
        return false;
    }
}

function getLocalStorage(key) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (error) {
        console.error('LocalStorage okuma hatası:', error);
        return null;
    }
}

// Clipboard işlemleri
function copyToClipboard(text) {
    return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(error => {
            console.error('Clipboard yazma hatası:', error);
            return false;
        });
}

// Debounce fonksiyonu
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle fonksiyonu
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Ekran boyutu kontrolü
function isMobile() {
    return window.innerWidth <= 768;
}

function isTablet() {
    return window.innerWidth > 768 && window.innerWidth <= 1024;
}

function isDesktop() {
    return window.innerWidth > 1024;
}

// Medya cihazları kontrolü
async function checkMediaDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
            hasCamera: devices.some(device => device.kind === 'videoinput'),
            hasMicrophone: devices.some(device => device.kind === 'audioinput')
        };
    } catch (error) {
        console.error('Medya cihazları kontrolü hatası:', error);
        return {
            hasCamera: false,
            hasMicrophone: false
        };
    }
}

// Ekran paylaşımı kontrolü
async function checkScreenShareSupport() {
    return navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;
}

// Tarayıcı desteği kontrolü
function checkBrowserSupport() {
    return {
        webRTC: 'RTCPeerConnection' in window,
        webSocket: 'WebSocket' in window,
        mediaDevices: 'mediaDevices' in navigator,
        localStorage: 'localStorage' in window,
        fullscreen: 'fullscreenEnabled' in document || 'webkitFullscreenEnabled' in document
    };
}

// Hata işleme
function handleError(error, context = '') {
    console.error(`Hata (${context}):`, error);
    showNotification(
        error.message || 'Bir hata oluştu. Lütfen tekrar deneyin.',
        'error'
    );
}

// Utility Functions
const utils = {
    // User Preferences
    getUserPreferences() {
        const defaultPrefs = {
            username: '',
            theme: 'dark',
            language: 'tr',
            notifications: true,
            volume: 100,
            quality: 'auto'
        };

        try {
            const savedPrefs = localStorage.getItem('userPreferences');
            return savedPrefs ? { ...defaultPrefs, ...JSON.parse(savedPrefs) } : defaultPrefs;
        } catch (error) {
            console.error('Error loading preferences:', error);
            return defaultPrefs;
        }
    },

    saveUserPreferences(prefs) {
        try {
            localStorage.setItem('userPreferences', JSON.stringify(prefs));
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    },

    // Username Generation
    generateUsername() {
        const adjectives = ['Neşeli', 'Heyecanlı', 'Enerjik', 'Sevimli', 'Şaşkın', 'Meraklı', 'Mutlu', 'Hızlı', 'Akıllı', 'Güçlü'];
        const nouns = ['Penguen', 'Panda', 'Aslan', 'Kaplan', 'Tavşan', 'Kedi', 'Köpek', 'Kuş', 'Fil', 'Zürafa'];
        
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 100);
        
        return `${adjective}${noun}${number}`;
    },

    // Time Formatting
    formatTime(date) {
        return date.toLocaleTimeString('tr-TR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    },

    formatDate(date) {
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    },

    // URL Handling
    generateRoomUrl(roomId) {
        return `${window.location.origin}/room/${roomId}`;
    },

    copyToClipboard(text) {
        return navigator.clipboard.writeText(text)
            .then(() => this.showNotification('Panoya kopyalandı!', 'success'))
            .catch(err => {
                console.error('Kopyalama hatası:', err);
                this.showNotification('Kopyalama başarısız', 'error');
            });
    },

    // Notifications
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;

        const container = document.querySelector('.notification-container');
        if (container) {
            container.appendChild(notification);

            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
    },

    getNotificationIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    },

    // Video Quality
    getQualityLabel(quality) {
        const labels = {
            'small': '240p',
            'medium': '360p',
            'large': '480p',
            'hd720': '720p',
            'hd1080': '1080p',
            'highres': '1440p+',
            'default': 'Otomatik'
        };
        return labels[quality] || quality;
    },

    // Color Generation
    generateRandomColor() {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
            '#FFEEAD', '#D4A5A5', '#9B6B6B', '#E9D985', 
            '#7FD1B9', '#FF9EAA'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    // Avatar Generation
    generateAvatarUrl(username) {
        return `https://api.dicebear.com/6.x/fun-emoji/svg?seed=${username}`;
    },

    // Input Validation
    validateUsername(username) {
        return username.length >= 3 && username.length <= 20;
    },

    validateRoomId(roomId) {
        return /^[a-zA-Z0-9]{6}$/.test(roomId);
    },

    // Error Handling
    handleError(error, defaultMessage = 'Bir hata oluştu') {
        console.error(error);
        this.showNotification(error.message || defaultMessage, 'error');
    },

    // Device Detection
    isMobile() {
        return window.innerWidth <= 768;
    },

    isTablet() {
        return window.innerWidth <= 1024 && window.innerWidth > 768;
    },

    // Browser Feature Detection
    checkBrowserSupport() {
        const features = {
            webRTC: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            webSocket: 'WebSocket' in window,
            fullscreen: document.documentElement.requestFullscreen,
            notifications: 'Notification' in window,
            clipboard: navigator.clipboard && navigator.clipboard.writeText
        };

        const missingFeatures = Object.entries(features)
            .filter(([, supported]) => !supported)
            .map(([feature]) => feature);

        if (missingFeatures.length > 0) {
            this.showNotification(
                `Tarayıcınız bazı özellikleri desteklemiyor: ${missingFeatures.join(', ')}`,
                'warning'
            );
        }

        return features;
    },

    // Performance Monitoring
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Local Storage Wrapper
    storage: {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.error('Error saving to localStorage:', error);
            }
        },

        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.error('Error reading from localStorage:', error);
                return defaultValue;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.error('Error removing from localStorage:', error);
            }
        },

        clear() {
            try {
                localStorage.clear();
            } catch (error) {
                console.error('Error clearing localStorage:', error);
            }
        }
    }
};

// Export
window.utils = {
    generateUserId,
    generateRoomId,
    generateRandomUsername,
    generateRandomColor,
    generateAvatarUrl,
    showNotification,
    formatTime,
    formatDate,
    truncateText,
    escapeHtml,
    getQueryParam,
    updateQueryParam,
    setLocalStorage,
    getLocalStorage,
    copyToClipboard,
    debounce,
    throttle,
    isMobile,
    isTablet,
    isDesktop,
    checkMediaDevices,
    checkScreenShareSupport,
    checkBrowserSupport,
    handleError
};

// Export utils object
if (typeof module !== 'undefined' && module.exports) {
    module.exports = utils;
} else {
    window.utils = utils;
}
