// Initialize socket connection
const socket = io();

// Initialize room functionality
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    
    const createRoomBtn = document.getElementById('create-room');
    const joinRoomBtn = document.getElementById('join-room');
    const roomIdInput = document.getElementById('room-id');
    
    console.log('Buttons:', { createRoomBtn, joinRoomBtn, roomIdInput });
    
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', async () => {
            console.log('Create room clicked');
            await createRoom();
        });
    }
    
    if (joinRoomBtn && roomIdInput) {
        // Enable join button only if room ID is entered
        roomIdInput.addEventListener('input', () => {
            joinRoomBtn.disabled = !roomIdInput.value.trim();
        });

        // Join room on button click
        joinRoomBtn.addEventListener('click', () => {
            const roomId = roomIdInput.value.trim();
            if (roomId) {
                joinRoom(roomId);
            } else {
                alert('Lütfen bir oda ID girin.');
            }
        });

        // Join room on Enter key
        roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && roomIdInput.value.trim()) {
                e.preventDefault();
                joinRoom(roomIdInput.value.trim());
            }
        });
    }
});

async function createRoom() {
    try {
        console.log('Creating room...');
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response:', response);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Room created:', data);
        
        if (data.roomId) {
            window.location.href = `/room?roomId=${data.roomId}`;
        } else {
            throw new Error('No room ID received');
        }
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Oda oluşturulurken bir hata oluştu.');
    }
}

async function joinRoom(roomId) {
    try {
        const response = await fetch(`/api/rooms/${roomId}`);
        const data = await response.json();
        
        if (data.exists) {
            window.location.href = `/room?roomId=${roomId}`;
        } else {
            alert('Oda bulunamadı.');
        }
    } catch (error) {
        console.error('Error joining room:', error);
        alert('Odaya katılırken bir hata oluştu.');
    }
}
