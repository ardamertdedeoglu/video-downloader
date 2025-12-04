const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Cookie file path
const COOKIE_DIR = app.isPackaged 
    ? path.join(app.getPath('userData'), 'cookies')
    : path.join(__dirname, '../../cookies');

const COOKIE_FILE = path.join(COOKIE_DIR, 'youtube_cookies.txt');

// Binaries directory
const BINARIES_DIR = app.isPackaged 
    ? path.join(process.resourcesPath, 'binaries')
    : path.join(__dirname, '../../binaries');

let cookieWatcher = null;
let binariesWatcher = null;
let periodicCheckInterval = null;
let mainWindowRef = null;

// Start watching for cookie file changes
function startCookieWatcher(mainWindow) {
    mainWindowRef = mainWindow;
    
    // Ensure cookie directory exists
    if (!fs.existsSync(COOKIE_DIR)) {
        fs.mkdirSync(COOKIE_DIR, { recursive: true });
    }
    
    // Watch cookie directory for changes
    try {
        cookieWatcher = fs.watch(COOKIE_DIR, (eventType, filename) => {
            if (filename === 'youtube_cookies.txt') {
                console.log('Cookie file changed:', eventType);
                notifyCookieStatusChange();
            }
        });
        
        console.log('Cookie watcher started:', COOKIE_DIR);
    } catch (error) {
        console.error('Failed to start cookie watcher:', error);
    }
}

// Start watching for binary changes
function startBinariesWatcher(mainWindow) {
    mainWindowRef = mainWindow;
    
    // Ensure binaries directory exists
    if (!fs.existsSync(BINARIES_DIR)) {
        fs.mkdirSync(BINARIES_DIR, { recursive: true });
    }
    
    // Watch binaries directory for changes
    try {
        binariesWatcher = fs.watch(BINARIES_DIR, (eventType, filename) => {
            console.log('Binaries directory changed:', eventType, filename);
            notifyBinariesStatusChange();
        });
        
        console.log('Binaries watcher started:', BINARIES_DIR);
    } catch (error) {
        console.error('Failed to start binaries watcher:', error);
    }
}

// Start periodic status check (fallback)
function startPeriodicCheck(mainWindow, intervalMs = 5 * 60 * 1000) { // 5 minutes default
    mainWindowRef = mainWindow;
    
    periodicCheckInterval = setInterval(() => {
        console.log('Periodic status check...');
        notifyCookieStatusChange();
        notifyBinariesStatusChange();
    }, intervalMs);
    
    console.log('Periodic check started with interval:', intervalMs, 'ms');
}

// Notify renderer about cookie status change
function notifyCookieStatusChange() {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        const status = getCookieStatus();
        mainWindowRef.webContents.send('cookie-status-changed', status);
    }
}

// Notify renderer about binaries status change
function notifyBinariesStatusChange() {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('binaries-status-changed');
    }
}

// Get current cookie status
function getCookieStatus() {
    if (!fs.existsSync(COOKIE_FILE)) {
        return {
            hasCookies: false,
            hasLoginCookies: false,
            cookieCount: 0
        };
    }
    
    try {
        const content = fs.readFileSync(COOKIE_FILE, 'utf8');
        const lines = content.split('\n').filter(line => 
            line && !line.startsWith('#') && line.includes('\t')
        );
        
        if (lines.length === 0) {
            return {
                hasCookies: false,
                hasLoginCookies: false,
                cookieCount: 0
            };
        }
        
        // Check for YouTube cookies
        const hasYouTubeCookies = lines.some(line => 
            line.includes('.youtube.com') || line.includes('.google.com')
        );
        
        if (!hasYouTubeCookies) {
            return {
                hasCookies: false,
                hasLoginCookies: false,
                cookieCount: 0
            };
        }
        
        // Check for login cookies
        const hasLoginCookies = lines.some(line => {
            const parts = line.split('\t');
            if (parts.length >= 6) {
                const cookieName = parts[5];
                return cookieName === 'SID' || 
                       cookieName === 'SSID' || 
                       cookieName === 'LOGIN_INFO' ||
                       cookieName === '__Secure-1PSID' ||
                       cookieName === '__Secure-3PSID';
            }
            return false;
        });
        
        return {
            hasCookies: hasLoginCookies,
            hasLoginCookies: hasLoginCookies,
            cookieCount: lines.length
        };
    } catch (error) {
        console.error('Error reading cookie file:', error);
        return {
            hasCookies: false,
            hasLoginCookies: false,
            cookieCount: 0
        };
    }
}

// Stop all watchers
function stopWatchers() {
    if (cookieWatcher) {
        cookieWatcher.close();
        cookieWatcher = null;
        console.log('Cookie watcher stopped');
    }
    
    if (binariesWatcher) {
        binariesWatcher.close();
        binariesWatcher = null;
        console.log('Binaries watcher stopped');
    }
    
    if (periodicCheckInterval) {
        clearInterval(periodicCheckInterval);
        periodicCheckInterval = null;
        console.log('Periodic check stopped');
    }
}

// Initialize all watchers
function initializeWatchers(mainWindow) {
    startCookieWatcher(mainWindow);
    startBinariesWatcher(mainWindow);
    startPeriodicCheck(mainWindow);
    
    // Send initial status after a short delay
    setTimeout(() => {
        notifyCookieStatusChange();
    }, 1000);
}

module.exports = {
    initializeWatchers,
    startCookieWatcher,
    startBinariesWatcher,
    startPeriodicCheck,
    stopWatchers,
    getCookieStatus,
    notifyCookieStatusChange,
    notifyBinariesStatusChange
};
