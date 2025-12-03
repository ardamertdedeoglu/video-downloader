const { ipcMain, dialog } = require('electron');
const { getVideoInfo, downloadVideo, cancelDownload } = require('./downloader');
const { checkBinariesStatus, downloadBinaries } = require('./binary-manager');
const { 
    generatePairingCode, 
    pairWithWebsite, 
    loadCookiesFromFile, 
    deleteCookieFile,
    getCookieFilePath,
    importCookiesFromNetscape
} = require('./cookie-sync');
const fs = require('fs');

function setupIpcHandlers(store) {
    // Get video info
    ipcMain.handle('get-video-info', async (event, url) => {
        try {
            const browser = store.get('browser');
            const useCookies = store.get('useCookies', true);
            const cookieFile = getCookieFilePath();
            const info = await getVideoInfo(url, browser, useCookies, cookieFile);
            return { success: true, data: info };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Download video
    ipcMain.handle('download-video', async (event, options) => {
        try {
            const browser = store.get('browser');
            const downloadPath = store.get('downloadPath');
            const useCookies = store.get('useCookies', true);
            const cookieFile = getCookieFilePath();
            
            const result = await downloadVideo({
                ...options,
                browser,
                useCookies,
                cookieFile,
                outputPath: downloadPath
            }, (progress) => {
                event.sender.send('download-progress', progress);
            });
            
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Cancel download
    ipcMain.handle('cancel-download', () => {
        cancelDownload();
        return { success: true };
    });

    // Check binaries status
    ipcMain.handle('check-binaries', async () => {
        const status = await checkBinariesStatus();
        return status;
    });

    // Download binaries manually
    ipcMain.handle('download-binaries', async (event) => {
        try {
            await downloadBinaries((progress) => {
                event.sender.send('binaries-progress', progress);
            });
            store.set('binariesDownloaded', true);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Get supported browsers
    ipcMain.handle('get-browsers', () => {
        return [
            { id: 'chrome', name: 'Google Chrome', icon: '🌐' },
            { id: 'firefox', name: 'Mozilla Firefox', icon: '🦊' },
            { id: 'edge', name: 'Microsoft Edge', icon: '🔷' },
            { id: 'brave', name: 'Brave', icon: '🦁' },
            { id: 'opera', name: 'Opera', icon: '🔴' },
            { id: 'chromium', name: 'Chromium', icon: '⚪' }
        ];
    });

    // ============ Cookie Sync Handlers ============
    
    // Generate pairing code for website sync
    ipcMain.handle('generate-pairing-code', async () => {
        try {
            const result = await generatePairingCode();
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Pair with website
    ipcMain.handle('pair-with-website', async (event, pairingCode) => {
        try {
            const result = await pairWithWebsite(pairingCode);
            if (result.success) {
                store.set('extensionToken', result.extensionToken);
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Get cookie status
    ipcMain.handle('get-cookie-status', () => {
        const cookieInfo = loadCookiesFromFile();
        return {
            hasCookies: cookieInfo !== null && cookieInfo.exists,
            cookieCount: cookieInfo?.cookieCount || 0,
            lastModified: cookieInfo?.lastModified || null
        };
    });

    // Delete cookies
    ipcMain.handle('delete-cookies', () => {
        const deleted = deleteCookieFile();
        store.delete('extensionToken');
        return { success: deleted };
    });

    // Import cookie file from disk
    ipcMain.handle('import-cookie-file', async (event) => {
        try {
            const result = await dialog.showOpenDialog({
                title: 'Cookie Dosyası Seç',
                filters: [
                    { name: 'Cookie Dosyası', extensions: ['txt'] },
                    { name: 'Tüm Dosyalar', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled || !result.filePaths.length) {
                return { success: false, error: 'İptal edildi' };
            }

            const content = fs.readFileSync(result.filePaths[0], 'utf8');
            const importResult = importCookiesFromNetscape(content);
            
            return importResult;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { setupIpcHandlers };
