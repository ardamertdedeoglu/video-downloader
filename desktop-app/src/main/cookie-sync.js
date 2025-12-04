const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session: electronSession } = require('electron');

// Cookie file path
const COOKIE_DIR = app.isPackaged 
    ? path.join(app.getPath('userData'), 'cookies')
    : path.join(__dirname, '../../cookies');

const COOKIE_FILE = path.join(COOKIE_DIR, 'youtube_cookies.txt');

// Ensure cookie directory exists
function ensureCookieDir() {
    if (!fs.existsSync(COOKIE_DIR)) {
        fs.mkdirSync(COOKIE_DIR, { recursive: true });
    }
}

// Get YouTube cookies from Electron session
async function getYouTubeCookiesFromSession(ses) {
    try {
        const cookies = await ses.cookies.get({ domain: '.youtube.com' });
        const googleCookies = await ses.cookies.get({ domain: '.google.com' });
        
        return [...cookies, ...googleCookies];
    } catch (error) {
        console.error('Failed to get cookies from session:', error);
        return [];
    }
}

// Save cookies to file (Netscape format)
function saveCookiesToFile(cookies) {
    ensureCookieDir();
    
    const lines = [
        '# Netscape HTTP Cookie File',
        '# https://curl.haxx.se/rfc/cookie_spec.html',
        '# This file was synced from Video Downloader Desktop App',
        ''
    ];
    
    for (const cookie of cookies) {
        let domain = cookie.domain || '';
        if (domain && !domain.startsWith('.')) {
            domain = '.' + domain;
        }
        
        const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const cookiePath = cookie.path || '/';
        const secure = cookie.secure ? 'TRUE' : 'FALSE';
        let expiration = cookie.expirationDate || 0;
        if (expiration === null || expiration < 0) {
            expiration = 0;
        } else {
            expiration = Math.floor(expiration);
        }
        
        const name = cookie.name || '';
        const value = cookie.value || '';
        
        if (name && domain) {
            lines.push(`${domain}\t${flag}\t${cookiePath}\t${secure}\t${expiration}\t${name}\t${value}`);
        }
    }
    
    fs.writeFileSync(COOKIE_FILE, lines.join('\n'));
    return COOKIE_FILE;
}

// Open YouTube login window and get cookies after login
async function autoSyncCookies(mainWindow) {
    return new Promise((resolve) => {
        // Create a window for YouTube login
        const authWindow = new BrowserWindow({
            width: 500,
            height: 700,
            parent: mainWindow,
            modal: true,
            show: true,
            title: 'YouTube Giriş Yap',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                partition: 'persist:youtube-auth' // Persistent session for auth
            }
        });
        
        authWindow.setMenuBarVisibility(false);
        
        let resolved = false;
        
        // Load YouTube login page
        authWindow.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https://www.youtube.com/signin?action_handle_signin=true');
        
        // Check for successful login
        const checkLogin = async () => {
            if (resolved) return;
            
            try {
                const currentUrl = authWindow.webContents.getURL();
                
                // If we're on YouTube main page, login was successful
                if (currentUrl.includes('youtube.com') && !currentUrl.includes('accounts.google.com') && !currentUrl.includes('signin')) {
                    resolved = true;
                    
                    // Wait a bit for cookies to be set
                    setTimeout(async () => {
                        try {
                            const ses = authWindow.webContents.session;
                            const cookies = await getYouTubeCookiesFromSession(ses);
                            
                            if (cookies.length > 0) {
                                saveCookiesToFile(cookies);
                                authWindow.close();
                                resolve({ 
                                    success: true, 
                                    cookieCount: cookies.length,
                                    message: 'Çerezler başarıyla senkronize edildi!'
                                });
                            } else {
                                authWindow.close();
                                resolve({ 
                                    success: false, 
                                    error: 'Çerez bulunamadı. Lütfen tekrar deneyin.' 
                                });
                            }
                        } catch (err) {
                            authWindow.close();
                            resolve({ success: false, error: err.message });
                        }
                    }, 2000);
                }
            } catch (err) {
                // Window might be closed
            }
        };
        
        // Listen for navigation
        authWindow.webContents.on('did-navigate', checkLogin);
        authWindow.webContents.on('did-navigate-in-page', checkLogin);
        authWindow.webContents.on('did-finish-load', checkLogin);
        
        // Handle window close
        authWindow.on('closed', () => {
            if (!resolved) {
                resolved = true;
                resolve({ 
                    success: false, 
                    error: 'Giriş penceresi kapatıldı' 
                });
            }
        });
    });
}

// Quick sync: Extract cookies from existing auth session (no login window)
async function quickSyncFromSession() {
    try {
        // Get cookies from the persist partition
        const ses = electronSession.fromPartition('persist:youtube-auth');
        const cookies = await getYouTubeCookiesFromSession(ses);
        
        if (cookies.length > 0) {
            // Check for login cookies
            const hasLoginCookie = cookies.some(c => 
                c.name === 'SID' || 
                c.name === 'SSID' || 
                c.name === 'LOGIN_INFO'
            );
            
            if (hasLoginCookie) {
                saveCookiesToFile(cookies);
                return { 
                    success: true, 
                    cookieCount: cookies.length,
                    message: 'Çerezler mevcut oturumdan alındı!'
                };
            }
        }
        
        return { 
            success: false, 
            error: 'Kayıtlı oturum bulunamadı. Lütfen önce giriş yapın.' 
        };
    } catch (error) {
        return { 
            success: false, 
            error: error.message 
        };
    }
}

// Check if user is logged in (has valid cookies in session)
async function checkLoginStatus() {
    try {
        const ses = electronSession.fromPartition('persist:youtube-auth');
        const cookies = await ses.cookies.get({ domain: '.youtube.com' });
        
        // Check for login cookies
        const hasLoginCookie = cookies.some(c => 
            c.name === 'SID' || 
            c.name === 'SSID' || 
            c.name === 'LOGIN_INFO'
        );
        
        return {
            isLoggedIn: hasLoginCookie,
            cookieCount: cookies.length
        };
    } catch (error) {
        return {
            isLoggedIn: false,
            cookieCount: 0
        };
    }
}

// Clear auth session and cookies
async function clearAuthSession() {
    try {
        const ses = electronSession.fromPartition('persist:youtube-auth');
        await ses.clearStorageData();
        deleteCookieFile();
        return { success: true, message: 'Oturum ve çerezler temizlendi.' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Load cookies from file and validate
function loadCookiesFromFile() {
    if (!fs.existsSync(COOKIE_FILE)) {
        return null;
    }
    
    try {
        const content = fs.readFileSync(COOKIE_FILE, 'utf8');
        const lines = content.split('\n').filter(line => 
            line && !line.startsWith('#') && line.includes('\t')
        );
        
        if (lines.length === 0) {
            return null;
        }
        
        // Check if file contains YouTube cookies
        const hasYouTubeCookies = lines.some(line => 
            line.includes('.youtube.com') || line.includes('.google.com')
        );
        
        if (!hasYouTubeCookies) {
            return null;
        }
        
        // Check for important login cookies (SID, SSID, LOGIN_INFO)
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
            exists: true,
            cookieCount: lines.length,
            hasLoginCookies: hasLoginCookies,
            filePath: COOKIE_FILE,
            lastModified: fs.statSync(COOKIE_FILE).mtime
        };
    } catch (error) {
        console.error('Error reading cookie file:', error);
        return null;
    }
}

// Delete cookie file
function deleteCookieFile() {
    if (fs.existsSync(COOKIE_FILE)) {
        fs.unlinkSync(COOKIE_FILE);
        return true;
    }
    return false;
}

// Get cookie file path for yt-dlp
function getCookieFilePath() {
    if (fs.existsSync(COOKIE_FILE)) {
        return COOKIE_FILE;
    }
    return null;
}

// Import cookies from Netscape format file
function importCookiesFromNetscape(content) {
    ensureCookieDir();
    
    // Validate format
    if (!content.includes('# Netscape HTTP Cookie File') && !content.includes('.youtube.com')) {
        return { success: false, error: 'Geçersiz Netscape cookie formatı' };
    }
    
    fs.writeFileSync(COOKIE_FILE, content);
    
    const lines = content.split('\n').filter(line => 
        line && !line.startsWith('#') && line.includes('\t')
    );
    
    return {
        success: true,
        cookieCount: lines.length,
        filePath: COOKIE_FILE
    };
}

module.exports = {
    autoSyncCookies,
    quickSyncFromSession,
    checkLoginStatus,
    clearAuthSession,
    saveCookiesToFile,
    loadCookiesFromFile,
    deleteCookieFile,
    getCookieFilePath,
    importCookiesFromNetscape,
    COOKIE_FILE
};
