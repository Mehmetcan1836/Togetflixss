// Ortak yardımcı fonksiyonlar
const utils = {
    // Bildirim göster
    showNotification: function(message, type = 'info') {
        const container = document.querySelector('.notification-container') || (() => {
            const div = document.createElement('div');
            div.className = 'notification-container';
            document.body.appendChild(div);
            return div;
        })();

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    },

    // Kullanıcı adı oluştur
    generateUsername: function() {
        return 'Misafir-' + Math.random().toString(36).substr(2, 4);
    },

    // URL'den parametre al
    getUrlParam: function(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    },

    // Zaman damgasını formatla
    formatTimestamp: function(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    },

    // Panoya kopyala
    copyToClipboard: async function(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Panoya kopyalama hatası:', err);
            return false;
        }
    },

    // Socket.IO bağlantısı oluştur
    createSocketConnection: function(options = {}) {
        const serverUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000'
            : 'https://togetflix-mehmetcan1836s-projects.vercel.app';
        
        return io(serverUrl, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
            ...options
        });
    },

    // YouTube video ID çıkar
    extractYoutubeVideoId: function(url) {
        const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : false;
    },

    // Kullanıcı tercihlerini kaydet
    saveUserPreferences: function(prefs) {
        localStorage.setItem('userPreferences', JSON.stringify(prefs));
    },

    // Kullanıcı tercihlerini al
    getUserPreferences: function() {
        try {
            return JSON.parse(localStorage.getItem('userPreferences')) || {};
        } catch (err) {
            console.error('Kullanıcı tercihleri alınamadı:', err);
            return {};
        }
    }
};

// Global olarak kullanılabilir yap
window.utils = utils;
