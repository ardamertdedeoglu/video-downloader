// ============ Popup Script ============

// Storage keys
const STORAGE_KEYS = {
    SERVER_URL: 'serverUrl',
    EXTENSION_TOKEN: 'extensionToken',
    LAST_SYNC: 'lastSync',
    PENDING_COOKIES: 'pendingCookies'
};

// Default server URL (production)
const DEFAULT_SERVER_URL = 'https://video-downloader-production.up.railway.app';

// DOM Elements
let elements = {};

// State
let isConnected = false;
let isSyncing = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    await loadState();
    setupEventListeners();
});

function initElements() {
    elements = {
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        pairingSection: document.getElementById('pairing-section'),
        connectedSection: document.getElementById('connected-section'),
        serverUrlInput: document.getElementById('server-url'),
        pairingCodeInput: document.getElementById('pairing-code'),
        pairBtn: document.getElementById('pair-btn'),
        syncBtn: document.getElementById('sync-btn'),
        disconnectBtn: document.getElementById('disconnect-btn'),
        connectedServer: document.getElementById('connected-server'),
        lastSync: document.getElementById('last-sync'),
        queueStatus: document.getElementById('queue-status'),
        queueText: document.getElementById('queue-text'),
        rateLimitWarning: document.getElementById('rate-limit-warning'),
        retryCountdown: document.getElementById('retry-countdown'),
        errorMessage: document.getElementById('error-message'),
        errorText: document.getElementById('error-text'),
        successMessage: document.getElementById('success-message'),
        successText: document.getElementById('success-text')
    };
}

async function loadState() {
    try {
        const data = await chrome.storage.local.get([
            STORAGE_KEYS.SERVER_URL,
            STORAGE_KEYS.EXTENSION_TOKEN,
            STORAGE_KEYS.LAST_SYNC,
            STORAGE_KEYS.PENDING_COOKIES
        ]);

        const serverUrl = data[STORAGE_KEYS.SERVER_URL] || DEFAULT_SERVER_URL;
        elements.serverUrlInput.value = serverUrl;

        if (data[STORAGE_KEYS.EXTENSION_TOKEN]) {
            // Token var, bağlantıyı doğrula
            const isValid = await verifyConnection(serverUrl, data[STORAGE_KEYS.EXTENSION_TOKEN]);
            if (isValid) {
                showConnectedState(serverUrl, data[STORAGE_KEYS.LAST_SYNC]);
            } else {
                // Token geçersiz, temizle
                await chrome.storage.local.remove([STORAGE_KEYS.EXTENSION_TOKEN]);
                showDisconnectedState();
            }
        } else {
            showDisconnectedState();
        }

        // Bekleyen cookie'leri kontrol et
        await updateQueueStatus();
    } catch (error) {
        console.error('Error loading state:', error);
        showDisconnectedState();
    }
}

function setupEventListeners() {
    elements.pairBtn.addEventListener('click', handlePair);
    elements.syncBtn.addEventListener('click', handleSync);
    elements.disconnectBtn.addEventListener('click', handleDisconnect);

    // Pairing kodu auto-uppercase
    elements.pairingCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });

    // Enter ile pairing
    elements.pairingCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handlePair();
        }
    });
}

async function verifyConnection(serverUrl, token) {
    try {
        const response = await fetch(`${serverUrl}/api/extension/verify`, {
            method: 'GET',
            headers: {
                'X-Extension-Token': token
            }
        });

        if (!response.ok) return false;

        const data = await response.json();
        return data.valid === true;
    } catch (error) {
        console.error('Verify connection error:', error);
        return false;
    }
}

async function handlePair() {
    const serverUrl = elements.serverUrlInput.value.trim().replace(/\/$/, '');
    const pairingCode = elements.pairingCodeInput.value.trim().toUpperCase();

    if (!serverUrl) {
        showError('Sunucu URL\'si gerekli');
        return;
    }

    if (!pairingCode || pairingCode.length !== 6) {
        showError('6 haneli pairing kodu gerekli');
        return;
    }

    elements.pairBtn.disabled = true;
    elements.pairBtn.textContent = '⏳ Bağlanıyor...';
    hideMessages();

    try {
        // Tarayıcı bilgisini al
        const browserInfo = getBrowserInfo();

        const response = await fetch(`${serverUrl}/api/extension/pair`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pairing_code: pairingCode,
                browser: browserInfo
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Bağlantı başarısız');
        }

        // Token'ı kaydet
        await chrome.storage.local.set({
            [STORAGE_KEYS.SERVER_URL]: serverUrl,
            [STORAGE_KEYS.EXTENSION_TOKEN]: data.extension_token
        });

        // Hemen cookie'leri senkronize et
        await syncCookies();

        showSuccess('Başarıyla bağlandı!');
        showConnectedState(serverUrl, null);

    } catch (error) {
        showError(error.message);
    } finally {
        elements.pairBtn.disabled = false;
        elements.pairBtn.innerHTML = '🔗 Bağlan';
    }
}

async function handleSync() {
    if (isSyncing) return;

    elements.syncBtn.disabled = true;
    elements.syncBtn.innerHTML = '⏳ Senkronize ediliyor...';
    hideMessages();

    try {
        await syncCookies();
        showSuccess('Cookie\'ler senkronize edildi!');
    } catch (error) {
        if (error.message.includes('Rate limit')) {
            showRateLimitWarning(error.retryAfter || 30);
        } else {
            showError(error.message);
        }
    } finally {
        elements.syncBtn.disabled = false;
        elements.syncBtn.innerHTML = '🔄 Şimdi Senkronize Et';
    }
}

async function handleDisconnect() {
    if (!confirm('Extension bağlantısını kesmek istediğinize emin misiniz?')) {
        return;
    }

    await chrome.storage.local.remove([
        STORAGE_KEYS.EXTENSION_TOKEN,
        STORAGE_KEYS.LAST_SYNC
    ]);

    showDisconnectedState();
    showSuccess('Bağlantı kesildi');
}

async function syncCookies() {
    isSyncing = true;
    updateSyncStatus('syncing');

    try {
        const data = await chrome.storage.local.get([
            STORAGE_KEYS.SERVER_URL,
            STORAGE_KEYS.EXTENSION_TOKEN
        ]);

        if (!data[STORAGE_KEYS.EXTENSION_TOKEN]) {
            throw new Error('Bağlantı bulunamadı');
        }

        // YouTube cookie'lerini al
        const cookies = await chrome.cookies.getAll({ domain: '.youtube.com' });
        const youtubeCookies = await chrome.cookies.getAll({ domain: 'youtube.com' });
        const allCookies = [...cookies, ...youtubeCookies];

        if (allCookies.length === 0) {
            throw new Error('YouTube cookie\'si bulunamadı. YouTube\'a giriş yapın.');
        }

        // Sunucuya gönder
        const response = await fetch(`${data[STORAGE_KEYS.SERVER_URL]}/api/extension/push-cookies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Extension-Token': data[STORAGE_KEYS.EXTENSION_TOKEN]
            },
            body: JSON.stringify({ cookies: allCookies })
        });

        if (response.status === 429) {
            const errorData = await response.json();
            const error = new Error('Rate limit aşıldı');
            error.retryAfter = errorData.retry_after || 30;
            throw error;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Senkronizasyon başarısız');
        }

        // Son sync zamanını güncelle
        const now = Date.now();
        await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: now });
        
        // Pending queue'yu temizle
        await chrome.storage.local.remove(STORAGE_KEYS.PENDING_COOKIES);

        updateLastSyncTime(now);
        updateSyncStatus('connected');
        await updateQueueStatus();

        // Background script'e bildir
        chrome.runtime.sendMessage({ type: 'SYNC_COMPLETED' });

    } catch (error) {
        updateSyncStatus('connected');
        
        // Offline ise queue'ya ekle
        if (!navigator.onLine || error.message.includes('Failed to fetch')) {
            await addToQueue();
        }
        
        throw error;
    } finally {
        isSyncing = false;
    }
}

async function addToQueue() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_COOKIES);
        let queue = data[STORAGE_KEYS.PENDING_COOKIES] || [];

        // YouTube cookie'lerini al
        const cookies = await chrome.cookies.getAll({ domain: '.youtube.com' });
        const youtubeCookies = await chrome.cookies.getAll({ domain: 'youtube.com' });
        const allCookies = [...cookies, ...youtubeCookies];

        // Queue'ya ekle (max 10)
        queue.push({
            cookies: allCookies,
            timestamp: Date.now()
        });

        if (queue.length > 10) {
            queue = queue.slice(-10);
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_COOKIES]: queue });
        await updateQueueStatus();
    } catch (error) {
        console.error('Error adding to queue:', error);
    }
}

async function updateQueueStatus() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_COOKIES);
        const queue = data[STORAGE_KEYS.PENDING_COOKIES] || [];

        if (queue.length > 0) {
            elements.queueStatus.classList.remove('hidden');
            elements.queueText.textContent = `${queue.length} bekleyen güncelleme`;
        } else {
            elements.queueStatus.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error updating queue status:', error);
    }
}

function showConnectedState(serverUrl, lastSync) {
    isConnected = true;
    elements.pairingSection.classList.add('hidden');
    elements.connectedSection.classList.remove('hidden');
    
    // Sunucu URL'sini kısalt
    try {
        const url = new URL(serverUrl);
        elements.connectedServer.textContent = url.hostname;
    } catch {
        elements.connectedServer.textContent = serverUrl;
    }

    updateLastSyncTime(lastSync);
    updateSyncStatus('connected');
}

function showDisconnectedState() {
    isConnected = false;
    elements.pairingSection.classList.remove('hidden');
    elements.connectedSection.classList.add('hidden');
    elements.pairingCodeInput.value = '';
    updateSyncStatus('disconnected');
}

function updateSyncStatus(status) {
    elements.statusDot.className = 'status-dot ' + status;
    
    switch (status) {
        case 'connected':
            elements.statusText.textContent = 'Bağlı';
            break;
        case 'disconnected':
            elements.statusText.textContent = 'Bağlı Değil';
            break;
        case 'syncing':
            elements.statusText.textContent = 'Senkronize ediliyor...';
            break;
        default:
            elements.statusText.textContent = status;
    }
}

function updateLastSyncTime(timestamp) {
    if (!timestamp) {
        elements.lastSync.textContent = 'Henüz yok';
        return;
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
        elements.lastSync.textContent = 'Az önce';
    } else if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        elements.lastSync.textContent = `${mins} dakika önce`;
    } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        elements.lastSync.textContent = `${hours} saat önce`;
    } else {
        elements.lastSync.textContent = date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function showError(message) {
    elements.errorMessage.classList.remove('hidden');
    elements.errorText.textContent = message;
    elements.successMessage.classList.add('hidden');
    elements.rateLimitWarning.classList.add('hidden');

    setTimeout(() => {
        elements.errorMessage.classList.add('hidden');
    }, 5000);
}

function showSuccess(message) {
    elements.successMessage.classList.remove('hidden');
    elements.successText.textContent = message;
    elements.errorMessage.classList.add('hidden');
    elements.rateLimitWarning.classList.add('hidden');

    setTimeout(() => {
        elements.successMessage.classList.add('hidden');
    }, 3000);
}

function showRateLimitWarning(seconds) {
    elements.rateLimitWarning.classList.remove('hidden');
    elements.errorMessage.classList.add('hidden');
    elements.successMessage.classList.add('hidden');

    let remaining = seconds;
    elements.retryCountdown.textContent = remaining;

    const interval = setInterval(() => {
        remaining--;
        elements.retryCountdown.textContent = remaining;

        if (remaining <= 0) {
            clearInterval(interval);
            elements.rateLimitWarning.classList.add('hidden');
        }
    }, 1000);
}

function hideMessages() {
    elements.errorMessage.classList.add('hidden');
    elements.successMessage.classList.add('hidden');
    elements.rateLimitWarning.classList.add('hidden');
}

function getBrowserInfo() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Brave')) return 'Brave';
    if (ua.includes('Chrome')) return 'Chrome';
    return 'Unknown';
}
