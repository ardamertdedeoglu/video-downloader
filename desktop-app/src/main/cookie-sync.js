const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// API URL
const API_BASE_URL = 'https://video-downloader-production-9a51.up.railway.app';

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

// Make HTTP request
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const lib = isHttps ? https : http;
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'VideoDownloader-Desktop/1.0',
                ...options.headers
            }
        };
        
        const req = lib.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        
        req.on('error', reject);
        
        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
        
        req.end();
    });
}

// Generate pairing code from website
async function generatePairingCode() {
    try {
        const response = await makeRequest(`${API_BASE_URL}/api/extension/generate-token`, {
            method: 'POST'
        });
        
        if (response.status === 200 && response.data.success) {
            return {
                success: true,
                pairingCode: response.data.pairing_code,
                expiresIn: response.data.expires_in
            };
        }
        
        return { success: false, error: response.data.error || 'Pairing kodu alınamadı' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Pair with website using pairing code
async function pairWithWebsite(pairingCode) {
    try {
        const response = await makeRequest(`${API_BASE_URL}/api/extension/pair`, {
            method: 'POST',
            body: {
                pairing_code: pairingCode,
                browser: 'desktop-app'
            }
        });
        
        if (response.status === 200 && response.data.success) {
            return {
                success: true,
                extensionToken: response.data.extension_token
            };
        }
        
        return { success: false, error: response.data.error || 'Eşleştirme başarısız' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Fetch cookies from website using extension token
async function fetchCookiesFromWebsite(extensionToken) {
    try {
        // First verify the token
        const verifyResponse = await makeRequest(`${API_BASE_URL}/api/extension/verify`, {
            method: 'GET',
            headers: {
                'X-Extension-Token': extensionToken
            }
        });
        
        if (verifyResponse.status !== 200 || !verifyResponse.data.valid) {
            return { success: false, error: 'Token geçersiz veya süresi dolmuş' };
        }
        
        return {
            success: true,
            lastSync: verifyResponse.data.last_sync,
            browser: verifyResponse.data.browser
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Save cookies to file (Netscape format)
function saveCookiesToFile(cookies) {
    ensureCookieDir();
    
    const lines = [
        '# Netscape HTTP Cookie File',
        '# https://curl.haxx.se/rfc/cookie_spec.html',
        '# This file was synced from Video Downloader Website',
        ''
    ];
    
    for (const cookie of cookies) {
        let domain = cookie.domain || '';
        if (domain && !domain.startsWith('.')) {
            domain = '.' + domain;
        }
        
        const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const path = cookie.path || '/';
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
            lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}`);
        }
    }
    
    fs.writeFileSync(COOKIE_FILE, lines.join('\n'));
    return COOKIE_FILE;
}

// Load cookies from file
function loadCookiesFromFile() {
    if (!fs.existsSync(COOKIE_FILE)) {
        return null;
    }
    
    try {
        const content = fs.readFileSync(COOKIE_FILE, 'utf8');
        const lines = content.split('\n').filter(line => 
            line && !line.startsWith('#') && line.includes('\t')
        );
        
        return {
            exists: true,
            cookieCount: lines.length,
            filePath: COOKIE_FILE,
            lastModified: fs.statSync(COOKIE_FILE).mtime
        };
    } catch (error) {
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

// Import cookies from browser extension format (JSON array)
function importCookiesFromJson(cookiesJson) {
    try {
        const cookies = typeof cookiesJson === 'string' ? JSON.parse(cookiesJson) : cookiesJson;
        if (!Array.isArray(cookies)) {
            return { success: false, error: 'Geçersiz cookie formatı' };
        }
        
        const filePath = saveCookiesToFile(cookies);
        return { 
            success: true, 
            cookieCount: cookies.length,
            filePath 
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
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
    generatePairingCode,
    pairWithWebsite,
    fetchCookiesFromWebsite,
    saveCookiesToFile,
    loadCookiesFromFile,
    deleteCookieFile,
    getCookieFilePath,
    importCookiesFromJson,
    importCookiesFromNetscape,
    COOKIE_FILE
};
