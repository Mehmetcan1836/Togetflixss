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

// Landing Page Scripts
document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenu = document.querySelector('.mobile-menu');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    // Smooth Scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
                // Close mobile menu if open
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            // Close all other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });
            // Toggle current item
            item.classList.toggle('active');
        });
    });

    // Room Creation and Joining
    const createRoomBtn = document.querySelector('.create-room');
    const joinRoomBtn = document.querySelector('.join-room');
    const joinForm = document.querySelector('.join-form');
    const joinBtn = document.getElementById('joinBtn');
    const roomIdInput = document.getElementById('roomIdInput');

    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            const roomId = generateRoomId();
            window.location.href = `/room/${roomId}`;
        });
    }

    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            joinForm.classList.toggle('hidden');
            if (!joinForm.classList.contains('hidden')) {
                roomIdInput.focus();
            }
        });
    }

    if (joinBtn && roomIdInput) {
        joinBtn.addEventListener('click', () => {
            const roomId = roomIdInput.value.trim();
            if (roomId) {
                window.location.href = `/room/${roomId}`;
            } else {
                showNotification('Lütfen bir oda ID girin', 'error');
            }
        });

        roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinBtn.click();
            }
        });
    }

    // Intersection Observer for Animations
    const animateOnScroll = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, {
        threshold: 0.1
    });

    document.querySelectorAll('.feature-card, .step, .plan').forEach(element => {
        animateOnScroll.observe(element);
    });

    // Navbar Scroll Effect
    let lastScroll = 0;
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll <= 0) {
            navbar.classList.remove('scroll-up');
            return;
        }
        
        if (currentScroll > lastScroll && !navbar.classList.contains('scroll-down')) {
            // Scroll Down
            navbar.classList.remove('scroll-up');
            navbar.classList.add('scroll-down');
        } else if (currentScroll < lastScroll && navbar.classList.contains('scroll-down')) {
            // Scroll Up
            navbar.classList.remove('scroll-down');
            navbar.classList.add('scroll-up');
        }
        lastScroll = currentScroll;
    });

    // Ana sayfa işlevleri
    console.log('DOM loaded');
    initializeSocket();

    const createRoom = document.getElementById('createRoom');
    const joinRoom = document.getElementById('joinRoom');
    const roomId = document.getElementById('roomId');
    const username = document.getElementById('username');

    // Kullanıcı tercihlerini yükle
    const prefs = utils.getUserPreferences();
    if (prefs.username) {
        username.value = prefs.username;
    }

    // Oda oluştur
    if (createRoom) {
        createRoom.addEventListener('click', async () => {
            try {
                const usernameValue = username.value.trim() || utils.generateUsername();
                
                // Kullanıcı adını kaydet
                localStorage.setItem('username', usernameValue);
                utils.saveUserPreferences({ ...prefs, username: usernameValue });

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
    if (joinRoom) {
        joinRoom.addEventListener('click', () => {
            const roomIdValue = roomId.value.trim();
            const usernameValue = username.value.trim() || utils.generateUsername();
            
            if (!roomIdValue) {
                utils.showNotification('Lütfen bir oda ID girin', 'error');
                return;
            }

            // Kullanıcı adını kaydet
            localStorage.setItem('username', usernameValue);
            utils.saveUserPreferences({ ...prefs, username: usernameValue });

            // Odaya yönlendir
            window.location.href = `/room/${roomIdValue}`;
        });
    }

    // Enter tuşu ile form gönderimi
    [roomId, username].forEach(input => {
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (roomId.value) {
                        joinRoom?.click();
                    } else {
                        createRoom?.click();
                    }
                }
            });
        }
    });
});

// Utility Functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${getNotificationIcon(type)}"></i>
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

// Language Selector
const languageSelector = document.querySelector('.language-selector select');
if (languageSelector) {
    languageSelector.addEventListener('change', (e) => {
        const lang = e.target.value;
        // Store selected language
        localStorage.setItem('preferred_language', lang);
        // Reload page with new language (implement this feature later)
        // window.location.reload();
    });

    // Load saved language preference
    const savedLang = localStorage.getItem('preferred_language');
    if (savedLang) {
        languageSelector.value = savedLang;
    }
}

// Premium Plan Selection
const premiumButtons = document.querySelectorAll('.plan .btn');
premiumButtons.forEach(button => {
    button.addEventListener('click', () => {
        const plan = button.closest('.plan').querySelector('h3').textContent;
        showNotification(`${plan} planı yakında aktif olacak!`, 'info');
    });
});
