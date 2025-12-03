const { ipcMain, dialog, BrowserWindow } = require('electron');
const { getVideoInfo, downloadVideo, cancelDownload } = require('./downloader');
const { checkBinariesStatus, downloadBinaries, checkYtdlpUpdate, updateYtdlp } = require('./binary-manager');
const { 
    autoSyncCookies,
    quickSyncFromSession,
    checkLoginStatus,
    clearAuthSession,
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
            const cookieFile = getCookieFilePath();
            const info = await getVideoInfo(url, cookieFile);
            return { success: true, data: info };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Download video
    ipcMain.handle('download-video', async (event, options) => {
        try {
            const downloadPath = store.get('downloadPath');
            const cookieFile = getCookieFilePath();
            
            const result = await downloadVideo({
                ...options,
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

    // Check if yt-dlp needs update
    ipcMain.handle('check-ytdlp-update', async () => {
        try {
            const result = await checkYtdlpUpdate();
            return result;
        } catch (error) {
            return { needsUpdate: false, error: error.message };
        }
    });

    // Update yt-dlp
    ipcMain.handle('update-ytdlp', async (event) => {
        try {
            const result = await updateYtdlp((progress) => {
                event.sender.send('binaries-progress', progress);
            });
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ============ Cookie Sync Handlers ============
    
    // Auto sync cookies - opens YouTube login window
    ipcMain.handle('auto-sync-cookies', async (event) => {
        try {
            const mainWindow = BrowserWindow.fromWebContents(event.sender);
            const result = await autoSyncCookies(mainWindow);
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Quick sync from existing session (no login window)
    ipcMain.handle('quick-sync-cookies', async () => {
        try {
            const result = await quickSyncFromSession();
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Check YouTube login status
    ipcMain.handle('check-login-status', async () => {
        try {
            const result = await checkLoginStatus();
            return result;
        } catch (error) {
            return { isLoggedIn: false, cookieCount: 0 };
        }
    });

    // Get cookie status
    ipcMain.handle('get-cookie-status', () => {
        const cookieInfo = loadCookiesFromFile();
        const cookiePath = getCookieFilePath();
        console.log('Cookie file path:', cookiePath);
        console.log('Cookie info:', cookieInfo);
        return {
            hasCookies: cookieInfo !== null && cookieInfo.exists,
            cookieCount: cookieInfo?.cookieCount || 0,
            lastModified: cookieInfo?.lastModified || null
        };
    });

    // Delete cookies and clear session
    ipcMain.handle('delete-cookies', async () => {
        try {
            const result = await clearAuthSession();
            return result;
        } catch (error) {
            const deleted = deleteCookieFile();
            return { success: deleted };
        }
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
