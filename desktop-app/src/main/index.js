const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// Modules
const { setupIpcHandlers } = require('./ipc-handlers');
const { checkAndDownloadBinaries } = require('./binary-manager');

// Store for settings
const store = new Store({
    defaults: {
        downloadPath: app.getPath('downloads'),
        theme: 'dark',
        binariesDownloaded: false
    }
});

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 600,
        minHeight: 500,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        titleBarStyle: 'hiddenInset',
        frame: process.platform === 'darwin' ? false : true,
        backgroundColor: '#1a1a2e',
        icon: path.join(__dirname, '../../build/icon.png'),
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Check for binaries on first run
        if (!store.get('binariesDownloaded')) {
            mainWindow.webContents.send('binaries-check-start');
            checkAndDownloadBinaries(mainWindow, store);
        }
    });

    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Dev tools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

// Auto-updater setup
function setupAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });

    autoUpdater.on('update-downloaded', () => {
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded');
        }
    });

    autoUpdater.on('download-progress', (progress) => {
        if (mainWindow) {
            mainWindow.webContents.send('update-progress', progress.percent);
        }
    });

    autoUpdater.on('error', (error) => {
        console.error('Auto-updater error:', error);
    });

    // Check for updates after 3 seconds
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(console.error);
    }, 3000);
}

// IPC for updates
ipcMain.handle('download-update', async () => {
    await autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
});

// IPC for settings
ipcMain.handle('get-settings', () => {
    return {
        downloadPath: store.get('downloadPath'),
        theme: store.get('theme'),
        binariesDownloaded: store.get('binariesDownloaded')
    };
});

ipcMain.handle('set-setting', (event, key, value) => {
    store.set(key, value);
    return true;
});

ipcMain.handle('select-download-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'İndirme Klasörünü Seç'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        store.set('downloadPath', result.filePaths[0]);
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('open-download-folder', () => {
    shell.openPath(store.get('downloadPath'));
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    setupIpcHandlers(store);
    setupAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

module.exports = { store };
