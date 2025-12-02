// ============ Background Service Worker ============

// Storage keys
const STORAGE_KEYS = {
    SERVER_URL: 'serverUrl',
    EXTENSION_TOKEN: 'extensionToken',
    LAST_SYNC: 'lastSync',
    PENDING_COOKIES: 'pendingCookies'
};

// Sabitler
const SYNC_ALARM_NAME = 'cookie-sync-alarm';
const SYNC_INTERVAL_MINUTES = 30;
const RATE_LIMIT_COOLDOWN = 60000; // 1 dakika

// Son sync zamanı (rate limiting için)
let lastSyncAttempt = 0;

// ============ Initialization ============

// Extension yüklendiğinde
chrome.runtime.onInstalled.addListener(() => {
    console.log('[Video Downloader] Extension installed');
    setupAlarm();
});

// Service worker başladığında
chrome.runtime.onStartup.addListener(() => {
    console.log('[Video Downloader] Service worker started');
    setupAlarm();
    processOfflineQueue();
});

// ============ Alarm Management ============

function setupAlarm() {
    // Periyodik sync alarm'ı kur
    chrome.alarms.create(SYNC_ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: SYNC_INTERVAL_MINUTES
    });
    console.log(`[Video Downloader] Alarm set for every ${SYNC_INTERVAL_MINUTES} minutes`);
}

// Alarm tetiklendiğinde
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
        console.log('[Video Downloader] Periodic sync triggered');
        attemptSync('alarm');
    }
});

// ============ Cookie Change Listener ============

// YouTube cookie'si değiştiğinde
chrome.cookies.onChanged.addListener((changeInfo) => {
    const cookie = changeInfo.cookie;
    
    // Sadece YouTube cookie'leri
    if (!cookie.domain.includes('youtube.com')) {
        return;
    }

    // Önemli cookie'ler değiştiğinde sync tetikle
    const importantCookies = ['LOGIN_INFO', 'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID'];
    
    if (importantCookies.includes(cookie.name)) {
        console.log(`[Video Downloader] Important cookie changed: ${cookie.name}`);
        // Debounce - çok sık tetiklenmemesi için
        debounceSync();
    }
});

// ============ Tab Listener ============

// YouTube sekmesi açıldığında
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        try {
            const url = new URL(tab.url);
            if (url.hostname.includes('youtube.com')) {
                console.log('[Video Downloader] YouTube tab loaded');
                attemptSync('tab-load');
            }
        } catch (e) {
            // Invalid URL, ignore
        }
    }
});

// ============ Message Handling ============

// Popup'tan mesaj geldiğinde
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SYNC_COMPLETED') {
        lastSyncAttempt = Date.now();
        console.log('[Video Downloader] Sync completed notification received');
    }
    return true;
});

// Website'dan gelen external mesajları dinle (externally_connectable)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    console.log('[Video Downloader] External message received:', message.type, 'from:', sender.origin);
    
    // Origin kontrolü - sadece güvenilir kaynaklardan
    const allowedOrigins = [
        'https://video-downloader-production-5a88.up.railway.app',
        'http://localhost',
        'http://127.0.0.1'
    ];
    
    const isAllowed = allowedOrigins.some(origin => 
        sender.origin === origin || sender.origin.startsWith(origin)
    );
    
    if (!isAllowed) {
        console.warn('[Video Downloader] Rejected message from untrusted origin:', sender.origin);
        sendResponse({ error: 'Untrusted origin' });
        return true;
    }
    
    if (message.type === 'PAIRING_CODE') {
        // Pairing kodunu storage'a kaydet (popup kontrol edecek)
        chrome.storage.local.set({
            pendingPairingCode: message.code,
            pendingServerUrl: message.serverUrl,
            pendingPairingTimestamp: Date.now()
        }).then(() => {
            console.log('[Video Downloader] Pairing code saved to storage:', message.code);
        });
        
        // Background'da direkt pairing yap (popup'a bağımlı olmadan)
        handleBackgroundPairing(message.code, message.serverUrl).then(success => {
            if (success) {
                console.log('[Video Downloader] Background pairing successful');
                // Popup açıksa bildir
                chrome.runtime.sendMessage({
                    type: 'PAIRING_COMPLETED',
                    success: true
                }).catch(() => {});
            }
        });
        
        sendResponse({ received: true });
    } else if (message.type === 'PING') {
        // Website'ın extension'ı kontrol etmesi için
        sendResponse({ pong: true, extensionId: chrome.runtime.id });
    }
    
    return true;
});

// ============ Background Pairing ============

async function handleBackgroundPairing(code, serverUrl) {
    if (!code || code.length !== 6) {
        console.error('[Video Downloader] Invalid pairing code');
        return false;
    }

    serverUrl = (serverUrl || 'https://video-downloader-production-5a88.up.railway.app').replace(/\/$/, '');

    try {
        // Tarayıcı bilgisi
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('OPR') || ua.includes('Opera')) browser = 'Opera';
        else if (ua.includes('Chrome')) browser = 'Chrome';

        console.log('[Video Downloader] Attempting background pairing with code:', code);

        // Pair isteği gönder
        const response = await fetch(`${serverUrl}/api/extension/pair`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pairing_code: code.toUpperCase(),
                browser: browser
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Video Downloader] Pairing failed:', data.error);
            return false;
        }

        // Token'ı kaydet
        await chrome.storage.local.set({
            [STORAGE_KEYS.SERVER_URL]: serverUrl,
            [STORAGE_KEYS.EXTENSION_TOKEN]: data.extension_token
        });

        console.log('[Video Downloader] Pairing successful, syncing cookies...');

        // Hemen cookie'leri senkronize et
        await syncCookiesBackground(serverUrl, data.extension_token);

        // Pending pairing bilgilerini temizle
        await chrome.storage.local.remove([
            'pendingPairingCode',
            'pendingServerUrl',
            'pendingPairingTimestamp'
        ]);

        return true;

    } catch (error) {
        console.error('[Video Downloader] Background pairing error:', error);
        return false;
    }
}

async function syncCookiesBackground(serverUrl, token) {
    try {
        // YouTube cookie'lerini al
        const cookies1 = await chrome.cookies.getAll({ domain: '.youtube.com' });
        const cookies2 = await chrome.cookies.getAll({ domain: 'youtube.com' });
        const allCookies = [...cookies1, ...cookies2];

        if (allCookies.length === 0) {
            console.log('[Video Downloader] No YouTube cookies found');
            return;
        }

        console.log(`[Video Downloader] Syncing ${allCookies.length} cookies after pairing`);

        const response = await fetch(`${serverUrl}/api/extension/push-cookies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Extension-Token': token
            },
            body: JSON.stringify({ cookies: allCookies })
        });

        if (response.ok) {
            await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: Date.now() });
            console.log('[Video Downloader] Cookie sync after pairing successful');
        }
    } catch (error) {
        console.error('[Video Downloader] Cookie sync error:', error);
    }
}

// ============ Sync Logic ============

let syncDebounceTimer = null;

function debounceSync() {
    if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
    }
    syncDebounceTimer = setTimeout(() => {
        attemptSync('cookie-change');
    }, 5000); // 5 saniye bekle
}

async function attemptSync(reason) {
    console.log(`[Video Downloader] Attempting sync, reason: ${reason}`);

    // Rate limiting kontrolü
    const now = Date.now();
    if (now - lastSyncAttempt < RATE_LIMIT_COOLDOWN) {
        console.log('[Video Downloader] Rate limit: too soon since last sync');
        return;
    }

    try {
        const data = await chrome.storage.local.get([
            STORAGE_KEYS.SERVER_URL,
            STORAGE_KEYS.EXTENSION_TOKEN
        ]);

        // Bağlı değilse çık
        if (!data[STORAGE_KEYS.EXTENSION_TOKEN]) {
            console.log('[Video Downloader] Not connected, skipping sync');
            return;
        }

        // Online değilse queue'ya ekle
        if (!navigator.onLine) {
            console.log('[Video Downloader] Offline, adding to queue');
            await addToQueue();
            return;
        }

        // Cookie'leri al ve gönder
        await syncCookies(data[STORAGE_KEYS.SERVER_URL], data[STORAGE_KEYS.EXTENSION_TOKEN]);
        lastSyncAttempt = now;

    } catch (error) {
        console.error('[Video Downloader] Sync error:', error);
        
        // Network hatası ise queue'ya ekle
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            await addToQueue();
        }
    }
}

async function syncCookies(serverUrl, token) {
    // YouTube cookie'lerini al
    const cookies1 = await chrome.cookies.getAll({ domain: '.youtube.com' });
    const cookies2 = await chrome.cookies.getAll({ domain: 'youtube.com' });
    const allCookies = [...cookies1, ...cookies2];

    if (allCookies.length === 0) {
        console.log('[Video Downloader] No YouTube cookies found');
        return;
    }

    console.log(`[Video Downloader] Syncing ${allCookies.length} cookies`);

    const response = await fetch(`${serverUrl}/api/extension/push-cookies`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Extension-Token': token
        },
        body: JSON.stringify({ cookies: allCookies })
    });

    if (response.status === 429) {
        console.log('[Video Downloader] Rate limited by server');
        return;
    }

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
    }

    // Başarılı - son sync zamanını güncelle
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: Date.now() });
    
    // Pending queue'yu temizle
    await chrome.storage.local.remove(STORAGE_KEYS.PENDING_COOKIES);
    
    console.log('[Video Downloader] Sync successful');
}

// ============ Offline Queue ============

async function addToQueue() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_COOKIES);
        let queue = data[STORAGE_KEYS.PENDING_COOKIES] || [];

        // Cookie'leri al
        const cookies1 = await chrome.cookies.getAll({ domain: '.youtube.com' });
        const cookies2 = await chrome.cookies.getAll({ domain: 'youtube.com' });
        const allCookies = [...cookies1, ...cookies2];

        if (allCookies.length === 0) {
            return;
        }

        // Queue'ya ekle
        queue.push({
            cookies: allCookies,
            timestamp: Date.now()
        });

        // Max 10 tut
        if (queue.length > 10) {
            queue = queue.slice(-10);
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_COOKIES]: queue });
        console.log(`[Video Downloader] Added to queue, total: ${queue.length}`);

    } catch (error) {
        console.error('[Video Downloader] Queue error:', error);
    }
}

async function processOfflineQueue() {
    if (!navigator.onLine) {
        console.log('[Video Downloader] Still offline, cannot process queue');
        return;
    }

    try {
        const data = await chrome.storage.local.get([
            STORAGE_KEYS.SERVER_URL,
            STORAGE_KEYS.EXTENSION_TOKEN,
            STORAGE_KEYS.PENDING_COOKIES
        ]);

        if (!data[STORAGE_KEYS.EXTENSION_TOKEN]) {
            return;
        }

        const queue = data[STORAGE_KEYS.PENDING_COOKIES] || [];
        if (queue.length === 0) {
            return;
        }

        console.log(`[Video Downloader] Processing ${queue.length} queued items`);

        // En son cookie setini gönder (en güncel)
        const latestEntry = queue[queue.length - 1];
        
        const response = await fetch(`${data[STORAGE_KEYS.SERVER_URL]}/api/extension/push-cookies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Extension-Token': data[STORAGE_KEYS.EXTENSION_TOKEN]
            },
            body: JSON.stringify({ cookies: latestEntry.cookies })
        });

        if (response.ok) {
            // Başarılı - queue'yu temizle
            await chrome.storage.local.remove(STORAGE_KEYS.PENDING_COOKIES);
            await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: Date.now() });
            console.log('[Video Downloader] Queue processed successfully');
        }

    } catch (error) {
        console.error('[Video Downloader] Queue processing error:', error);
    }
}

// Online olunca queue'yu işle
if (typeof self !== 'undefined') {
    self.addEventListener('online', () => {
        console.log('[Video Downloader] Back online');
        processOfflineQueue();
    });
}

console.log('[Video Downloader] Background script loaded');
