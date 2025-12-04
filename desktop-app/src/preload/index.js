const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Video operations
    getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
    downloadVideo: (options) => ipcRenderer.invoke('download-video', options),
    cancelDownload: () => ipcRenderer.invoke('cancel-download'),
    
    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
    selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
    openDownloadFolder: () => ipcRenderer.invoke('open-download-folder'),
    
    // Binaries
    checkBinaries: () => ipcRenderer.invoke('check-binaries'),
    downloadBinaries: () => ipcRenderer.invoke('download-binaries'),
    checkYtdlpUpdate: () => ipcRenderer.invoke('check-ytdlp-update'),
    updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),
    
    // Cookie sync
    autoSyncCookies: () => ipcRenderer.invoke('auto-sync-cookies'),
    quickSyncCookies: () => ipcRenderer.invoke('quick-sync-cookies'),
    checkLoginStatus: () => ipcRenderer.invoke('check-login-status'),
    getCookieStatus: () => ipcRenderer.invoke('get-cookie-status'),
    deleteCookies: () => ipcRenderer.invoke('delete-cookies'),
    importCookieFile: () => ipcRenderer.invoke('import-cookie-file'),
    
    // Updates
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    
    // Event listeners
    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, progress) => callback(progress));
    },
    
    onBinariesProgress: (callback) => {
        ipcRenderer.on('binaries-progress', (event, progress) => callback(progress));
    },
    
    onBinariesReady: (callback) => {
        ipcRenderer.on('binaries-ready', () => callback());
    },
    
    onBinariesError: (callback) => {
        ipcRenderer.on('binaries-error', (event, error) => callback(error));
    },
    
    onBinariesCheckStart: (callback) => {
        ipcRenderer.on('binaries-check-start', () => callback());
    },
    
    onBinariesDownloadStart: (callback) => {
        ipcRenderer.on('binaries-download-start', () => callback());
    },
    
    // Status change events (from file watchers)
    onCookieStatusChanged: (callback) => {
        ipcRenderer.on('cookie-status-changed', (event, status) => callback(status));
    },
    
    onBinariesStatusChanged: (callback) => {
        ipcRenderer.on('binaries-status-changed', () => callback());
    },

    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (event, info) => callback(info));
    },
    
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', () => callback());
    },
    
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update-progress', (event, percent) => callback(percent));
    },
    
    // Remove listeners
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});
