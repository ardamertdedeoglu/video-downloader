const { ipcMain, dialog, BrowserWindow, shell } = require("electron");
const { getVideoInfo, downloadVideo, cancelDownload } = require("./downloader");
const {
  checkBinariesStatus,
  downloadBinaries,
  checkYtdlpUpdate,
  updateYtdlp,
} = require("./binary-manager");
const {
  autoSyncCookies,
  quickSyncFromSession,
  checkLoginStatus,
  clearAuthSession,
  loadCookiesFromFile,
  deleteCookieFile,
  getCookieFilePath,
  importCookiesFromNetscape,
} = require("./cookie-sync");
const {
  getFileInfo,
  convertFile,
  convertBatch,
  cancelConversion,
  formatFileSize,
} = require("./converter");
const fs = require("fs");
const path = require("path");

function setupIpcHandlers(store) {
  // Get video info
  ipcMain.handle("get-video-info", async (event, url) => {
    try {
      const cookieFile = getCookieFilePath();
      const info = await getVideoInfo(url, cookieFile);
      return { success: true, data: info };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Download video
  ipcMain.handle("download-video", async (event, options) => {
    try {
      const downloadPath = store.get("downloadPath");
      const cookieFile = getCookieFilePath();

      const result = await downloadVideo(
        {
          ...options,
          cookieFile,
          outputPath: downloadPath,
        },
        (progress) => {
          event.sender.send("download-progress", progress);
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Cancel download
  ipcMain.handle("cancel-download", () => {
    cancelDownload();
    return { success: true };
  });

  // Check binaries status
  ipcMain.handle("check-binaries", async () => {
    const status = await checkBinariesStatus();
    return status;
  });

  // Download binaries manually
  ipcMain.handle("download-binaries", async (event) => {
    try {
      await downloadBinaries((progress) => {
        event.sender.send("binaries-progress", progress);
      });
      store.set("binariesDownloaded", true);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Check if yt-dlp needs update
  ipcMain.handle("check-ytdlp-update", async () => {
    try {
      const result = await checkYtdlpUpdate();
      return result;
    } catch (error) {
      return { needsUpdate: false, error: error.message };
    }
  });

  // Update yt-dlp
  ipcMain.handle("update-ytdlp", async (event) => {
    try {
      const result = await updateYtdlp((progress) => {
        event.sender.send("binaries-progress", progress);
      });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ============ Cookie Sync Handlers ============

  // Auto sync cookies - opens YouTube login window
  ipcMain.handle("auto-sync-cookies", async (event) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      const result = await autoSyncCookies(mainWindow);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Quick sync from existing session (no login window)
  ipcMain.handle("quick-sync-cookies", async () => {
    try {
      const result = await quickSyncFromSession();
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Check YouTube login status
  ipcMain.handle("check-login-status", async () => {
    try {
      const result = await checkLoginStatus();
      return result;
    } catch (error) {
      return { isLoggedIn: false, cookieCount: 0 };
    }
  });

  // Get cookie status
  ipcMain.handle("get-cookie-status", () => {
    const cookieInfo = loadCookiesFromFile();
    const cookiePath = getCookieFilePath();
    console.log("Cookie file path:", cookiePath);
    console.log("Cookie info:", cookieInfo);

    // Cookie dosyası varsa ve içinde geçerli login cookie'leri varsa
    const isLoggedIn =
      cookieInfo !== null &&
      cookieInfo.exists &&
      cookieInfo.hasLoginCookies &&
      cookieInfo.cookieCount > 0;

    return {
      hasCookies: isLoggedIn,
      cookieCount: cookieInfo?.cookieCount || 0,
      hasLoginCookies: cookieInfo?.hasLoginCookies || false,
      lastModified: cookieInfo?.lastModified || null,
    };
  });

  // Delete cookies and clear session
  ipcMain.handle("delete-cookies", async () => {
    try {
      const result = await clearAuthSession();
      return result;
    } catch (error) {
      const deleted = deleteCookieFile();
      return { success: deleted };
    }
  });

  // Import cookie file from disk
  ipcMain.handle("import-cookie-file", async (event) => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Cookie Dosyası Seç",
        filters: [
          { name: "Cookie Dosyası", extensions: ["txt"] },
          { name: "Tüm Dosyalar", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: "İptal edildi" };
      }

      const content = fs.readFileSync(result.filePaths[0], "utf8");
      const importResult = importCookiesFromNetscape(content);

      return importResult;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ============ Converter Handlers ============

  // Select input files for conversion
  ipcMain.handle("select-input-files", async (event) => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Dönüştürülecek Dosyaları Seç",
        filters: [
          {
            name: "Video/Ses Dosyaları",
            extensions: [
              "mp4",
              "mkv",
              "avi",
              "mov",
              "webm",
              "mp3",
              "wav",
              "flac",
              "aac",
              "ogg",
              "m4a",
              "wma",
              "wmv",
              "flv",
              "3gp",
            ],
          },
          {
            name: "Video Dosyaları",
            extensions: [
              "mp4",
              "mkv",
              "avi",
              "mov",
              "webm",
              "wmv",
              "flv",
              "3gp",
            ],
          },
          {
            name: "Ses Dosyaları",
            extensions: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"],
          },
          { name: "Tüm Dosyalar", extensions: ["*"] },
        ],
        properties: ["openFile", "multiSelections"],
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: "İptal edildi" };
      }

      // Get file info for each selected file
      const filesWithInfo = await Promise.all(
        result.filePaths.map(async (filePath) => {
          try {
            const info = await getFileInfo(filePath);
            return {
              path: filePath,
              name: path.basename(filePath),
              size: info.size,
              sizeFormatted: formatFileSize(info.size),
              type: info.type,
              duration: info.durationFormatted,
              video: info.video,
              audio: info.audio,
            };
          } catch (error) {
            return {
              path: filePath,
              name: path.basename(filePath),
              size: 0,
              sizeFormatted: "Bilinmiyor",
              type: "unknown",
              error: error.message,
            };
          }
        })
      );

      return { success: true, files: filesWithInfo };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get file info for a single file
  ipcMain.handle("get-file-info", async (event, filePath) => {
    try {
      const info = await getFileInfo(filePath);
      return {
        success: true,
        data: {
          ...info,
          sizeFormatted: formatFileSize(info.size),
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Convert a single file
  ipcMain.handle("convert-file", async (event, options) => {
    try {
      const result = await convertFile(options, (progress) => {
        event.sender.send("conversion-progress", progress);
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Convert multiple files in batch
  ipcMain.handle("convert-batch", async (event, { files, options }) => {
    try {
      const result = await convertBatch(
        files,
        options,
        (progress) => {
          event.sender.send("conversion-progress", progress);
        },
        (fileResult) => {
          event.sender.send("file-converted", fileResult);
        }
      );

      event.sender.send("batch-complete", result);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Cancel current conversion
  ipcMain.handle("cancel-conversion", () => {
    cancelConversion();
    return { success: true };
  });

  // Open folder containing converted file
  ipcMain.handle("open-converted-folder", async (event, filePath) => {
    try {
      if (filePath && fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
      } else {
        const downloadPath = store.get("downloadPath");
        shell.openPath(downloadPath);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupIpcHandlers };
