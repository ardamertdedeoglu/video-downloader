// State
let currentVideoInfo = null;
let isDownloading = false;
let selectedFormat = null; // { formatId, isAudio, quality, ext }

// Converter State
let currentMode = "downloader"; // 'downloader' | 'converter'
let fileQueue = []; // Array of file objects
let selectedOutputFormat = "mp4";
let selectedPreset = "balanced";
let isConverting = false;
let lastConvertedFilePath = null;

// Theme State
let currentTheme = "system"; // 'system' | 'light' | 'dark'

// DOM Elements
const elements = {
  // Modals
  binaryModal: document.getElementById("binaryModal"),
  binaryProgress: document.getElementById("binaryProgress"),
  binaryProgressText: document.getElementById("binaryProgressText"),
  binaryStatus: document.getElementById("binaryStatus"),

  // Update banner
  updateBanner: document.getElementById("updateBanner"),
  updateText: document.getElementById("updateText"),
  updateProgress: document.getElementById("updateProgress"),
  updateProgressBar: document.getElementById("updateProgressBar"),
  updatePercent: document.getElementById("updatePercent"),
  updateBtn: document.getElementById("updateBtn"),
  dismissUpdate: document.getElementById("dismissUpdate"),

  // Navigation
  hamburgerBtn: document.getElementById("hamburgerBtn"),
  navSidebar: document.getElementById("navSidebar"),
  navOverlay: document.getElementById("navOverlay"),
  navCloseBtn: document.getElementById("navCloseBtn"),
  logoIcon: document.getElementById("logoIcon"),
  pageTitle: document.getElementById("pageTitle"),

  // URL section (Downloader)
  urlInput: document.getElementById("urlInput"),
  fetchBtn: document.getElementById("fetchBtn"),
  errorMessage: document.getElementById("errorMessage"),
  urlSection: document.querySelector(".url-section"),

  // Video section
  videoSection: document.getElementById("videoSection"),
  videoThumbnail: document.getElementById("videoThumbnail"),
  videoDuration: document.getElementById("videoDuration"),
  videoTitle: document.getElementById("videoTitle"),
  videoUploader: document.getElementById("videoUploader"),
  videoViews: document.getElementById("videoViews"),

  // Formats
  videoFormatList: document.getElementById("videoFormatList"),
  audioFormatList: document.getElementById("audioFormatList"),
  videoFormats: document.getElementById("videoFormats"),
  audioFormats: document.getElementById("audioFormats"),
  downloadMp3Btn: document.getElementById("downloadMp3Btn"),

  // Format section
  formatSection: document.getElementById("formatSection"),
  downloadAction: document.getElementById("downloadAction"),
  selectedFormatInfo: document.getElementById("selectedFormatInfo"),
  startDownloadBtn: document.getElementById("startDownloadBtn"),

  // Progress
  downloadProgress: document.getElementById("downloadProgress"),
  downloadProgressBar: document.getElementById("downloadProgressBar"),
  downloadPercent: document.getElementById("downloadPercent"),
  downloadStatus: document.getElementById("downloadStatus"),
  cancelDownload: document.getElementById("cancelDownload"),
  downloadComplete: document.getElementById("downloadComplete"),
  openFolderBtn: document.getElementById("openFolderBtn"),

  // Converter section
  converterSection: document.getElementById("converterSection"),
  dropZone: document.getElementById("dropZone"),
  selectFilesBtn: document.getElementById("selectFilesBtn"),
  queueWarning: document.getElementById("queueWarning"),
  warningText: document.getElementById("warningText"),
  fileQueueSection: document.getElementById("fileQueueSection"),
  fileQueue: document.getElementById("fileQueue"),
  fileCount: document.getElementById("fileCount"),
  clearQueueBtn: document.getElementById("clearQueueBtn"),
  conversionSettings: document.getElementById("conversionSettings"),
  videoFormatGroup: document.getElementById("videoFormatGroup"),
  audioFormatGroup: document.getElementById("audioFormatGroup"),
  startConversionBtn: document.getElementById("startConversionBtn"),
  conversionProgressSection: document.getElementById(
    "conversionProgressSection"
  ),
  conversionStatus: document.getElementById("conversionStatus"),
  conversionPercent: document.getElementById("conversionPercent"),
  conversionProgressBar: document.getElementById("conversionProgressBar"),
  currentFileName: document.getElementById("currentFileName"),
  currentFileProgressBar: document.getElementById("currentFileProgressBar"),
  cancelConversionBtn: document.getElementById("cancelConversionBtn"),
  conversionComplete: document.getElementById("conversionComplete"),
  successCount: document.getElementById("successCount"),
  failedCount: document.getElementById("failedCount"),
  failedSummary: document.getElementById("failedSummary"),
  failedFilesList: document.getElementById("failedFilesList"),
  failedFilesUl: document.getElementById("failedFilesUl"),
  openConvertedFolderBtn: document.getElementById("openConvertedFolderBtn"),
  newConversionBtn: document.getElementById("newConversionBtn"),

  // Settings
  settingsBtn: document.getElementById("settingsBtn"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  closeSettings: document.getElementById("closeSettings"),
  browserList: document.getElementById("browserList"),
  downloadPath: document.getElementById("downloadPath"),
  selectPathBtn: document.getElementById("selectPathBtn"),
  binaryStatusList: document.getElementById("binaryStatusList"),
  updateBinariesBtn: document.getElementById("updateBinariesBtn"),
  // Cookie sync elements
  cookieSyncStatus: document.getElementById("cookieSyncStatus"),
  cookieSyncText: document.getElementById("cookieSyncText"),
  youtubeLoginBtn: document.getElementById("youtubeLoginBtn"),
  refreshCookiesBtn: document.getElementById("refreshCookiesBtn"),
  importCookieBtn: document.getElementById("importCookieBtn"),
  deleteCookieBtn: document.getElementById("deleteCookieBtn"),
  // yt-dlp update
  updateYtdlpBtn: document.getElementById("updateYtdlpBtn"),
  ytdlpUpdateInfo: document.getElementById("ytdlpUpdateInfo"),
  // Theme selector
  themeSelector: document.getElementById("themeSelector"),
  // App info
  appVersion: document.getElementById("appVersion"),
  // Splash screen
  splashScreen: document.getElementById("splashScreen"),
};

// Initialize
async function init() {
  setupEventListeners();
  setupIpcListeners();
  await loadSettings();
  await loadAppVersion();
  await checkBinaries();
  await checkYtdlpUpdate();
  await checkCookieStatus();
  await checkAndShowLoginStatus();

  // Hide splash screen after everything is loaded
  hideSplashScreen();
}

// Hide splash screen with animation
function hideSplashScreen() {
  if (elements.splashScreen) {
    elements.splashScreen.classList.add("hidden");
    // Remove from DOM after animation
    setTimeout(() => {
      elements.splashScreen.remove();
    }, 400);
  }
}

// ========================================
// THEME FUNCTIONS
// ========================================

// Apply theme based on preference
async function applyTheme(themePref) {
  currentTheme = themePref;
  
  // Remove existing theme classes
  document.documentElement.classList.remove('light-theme', 'dark-theme');
  
  if (themePref === 'system') {
    // Get system theme from main process
    const systemTheme = await window.electronAPI.getSystemTheme();
    // Don't add any class - let CSS media query handle it
  } else if (themePref === 'light') {
    document.documentElement.classList.add('light-theme');
  } else if (themePref === 'dark') {
    document.documentElement.classList.add('dark-theme');
  }
  
  // Update theme selector UI
  updateThemeSelectorUI(themePref);
}

// Update theme selector buttons
function updateThemeSelectorUI(activeTheme) {
  if (!elements.themeSelector) return;
  
  const buttons = elements.themeSelector.querySelectorAll('.theme-option');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === activeTheme);
  });
}

// Handle theme change from system
function handleSystemThemeChange(systemTheme) {
  // Only react if user preference is 'system'
  if (currentTheme === 'system') {
    // CSS media query will handle it automatically
    // Just ensure no manual theme class is set
    document.documentElement.classList.remove('light-theme', 'dark-theme');
  }
}

// Load app version
async function loadAppVersion() {
  try {
    const version = await window.electronAPI.getAppVersion();
    if (version) {
      elements.appVersion.textContent = `Sürüm: ${version}`;
    } else {
      elements.appVersion.textContent = "Sürüm: Bilinmiyor";
    }
  } catch (error) {
    console.error("Failed to load app version:", error);
    elements.appVersion.textContent = "Sürüm: Hata";
  }
}

// Event Listeners
function setupEventListeners() {
  // Fetch video
  elements.fetchBtn.addEventListener("click", fetchVideo);
  elements.urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") fetchVideo();
  });

  // Paste from clipboard on focus
  elements.urlInput.addEventListener("focus", async () => {
    if (!elements.urlInput.value) {
      try {
        const text = await navigator.clipboard.readText();
        if (isValidUrl(text)) {
          elements.urlInput.value = text;
        }
      } catch (e) {
        // Clipboard access denied
      }
    }
  });

  // Format tabs
  document.querySelectorAll(".format-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".format-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const tabName = tab.dataset.tab;
      elements.videoFormats.style.display =
        tabName === "video" ? "block" : "none";
      elements.audioFormats.style.display =
        tabName === "audio" ? "block" : "none";
    });
  });

  // Download MP3 - select format instead of immediate download
  elements.downloadMp3Btn.addEventListener("click", () =>
    selectFormat(null, true, "MP3", "mp3")
  );

  // Start download button
  elements.startDownloadBtn.addEventListener("click", startSelectedDownload);

  // Cancel download
  elements.cancelDownload.addEventListener("click", cancelDownload);

  // Open folder
  elements.openFolderBtn.addEventListener("click", () => {
    window.electronAPI.openDownloadFolder();
  });

  // Settings
  elements.settingsBtn.addEventListener("click", openSettings);
  elements.closeSettings.addEventListener("click", closeSettings);
  elements.settingsOverlay.addEventListener("click", closeSettings);

  elements.selectPathBtn.addEventListener("click", async () => {
    const newPath = await window.electronAPI.selectDownloadPath();
    if (newPath) {
      elements.downloadPath.value = newPath;
    }
  });

  // Theme selector
  if (elements.themeSelector) {
    elements.themeSelector.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.theme;
        await applyTheme(theme);
        await window.electronAPI.setSetting('theme', theme);
      });
    });
  }

  elements.updateBinariesBtn.addEventListener("click", async () => {
    elements.binaryModal.classList.add("show");
    elements.binaryStatus.textContent = "Bileşenler indiriliyor...";
    elements.binaryProgress.style.width = "0%";
    elements.binaryProgressText.textContent = "Başlatılıyor...";

    try {
      const result = await window.electronAPI.downloadBinaries();
      if (result.success) {
        elements.binaryModal.classList.remove("show");
        showSuccess("Bileşenler başarıyla güncellendi!");
        await checkBinaries();
        await checkYtdlpUpdate();
      } else {
        elements.binaryStatus.textContent = "Hata: " + result.error;
      }
    } catch (error) {
      elements.binaryStatus.textContent = "Hata: " + error.message;
    }
  });

  // Cookie sync buttons
  elements.youtubeLoginBtn.addEventListener("click", async () => {
    elements.youtubeLoginBtn.textContent = "Giriş yapılıyor...";
    elements.youtubeLoginBtn.disabled = true;

    try {
      const result = await window.electronAPI.autoSyncCookies();
      if (result.success) {
        showSuccess(
          result.message ||
            `${result.cookieCount} çerez başarıyla senkronize edildi!`
        );
        await checkCookieStatus();
      } else if (result.error !== "Giriş penceresi kapatıldı") {
        showError(result.error);
      }
    } catch (error) {
      showError("Giriş yapılamadı");
    } finally {
      elements.youtubeLoginBtn.textContent = "🔐 YouTube'a Giriş Yap";
      elements.youtubeLoginBtn.disabled = false;
    }
  });

  elements.refreshCookiesBtn.addEventListener("click", async () => {
    elements.refreshCookiesBtn.textContent = "Yenileniyor...";
    elements.refreshCookiesBtn.disabled = true;

    try {
      const result = await window.electronAPI.quickSyncCookies();
      if (result.success) {
        showSuccess(result.message || "Çerezler yenilendi!");
        await checkCookieStatus();
      } else {
        // Kayıtlı oturum yoksa login penceresini aç
        const loginResult = await window.electronAPI.autoSyncCookies();
        if (loginResult.success) {
          showSuccess(loginResult.message || "Çerezler senkronize edildi!");
          await checkCookieStatus();
        }
      }
    } catch (error) {
      showError("Çerezler yenilenemedi");
    } finally {
      elements.refreshCookiesBtn.textContent = "Çerezleri Yenile";
      elements.refreshCookiesBtn.disabled = false;
    }
  });

  elements.importCookieBtn.addEventListener("click", async () => {
    const result = await window.electronAPI.importCookieFile();
    if (result.success) {
      showSuccess(`${result.cookieCount} çerez başarıyla yüklendi!`);
      await checkCookieStatus();
    } else if (result.error !== "İptal edildi") {
      showError(result.error);
    }
  });

  elements.deleteCookieBtn.addEventListener("click", async () => {
    await window.electronAPI.deleteCookies();
    await checkCookieStatus();
    showSuccess("Oturum kapatıldı");
  });

  // Update
  elements.updateBtn.addEventListener("click", async () => {
    elements.updateText.textContent = "⬇️ Güncelleme başlatılıyor...";
    elements.updateBtn.style.display = "none";
    elements.updateProgress.style.display = "block";
    elements.updateProgressBar.style.width = "0%";
    elements.updatePercent.style.display = "inline";
    elements.updatePercent.textContent = "%0";
    await window.electronAPI.downloadUpdate();
  });

  elements.dismissUpdate.addEventListener("click", () => {
    elements.updateBanner.style.display = "none";
  });

  // Navigation - Hamburger menu
  //Adding ESC key to open/close nav sidebar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (elements.navSidebar.classList.contains("show")) {
        closeNavSidebar();
      } else {
        openNavSidebar();
      }
    }
  });
  elements.hamburgerBtn.addEventListener("click", openNavSidebar);
  elements.navCloseBtn.addEventListener("click", closeNavSidebar);
  elements.navOverlay.addEventListener("click", closeNavSidebar);

  // Navigation items
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const mode = item.dataset.mode;
      switchMode(mode);
      closeNavSidebar();
    });
  });

  // Converter - Drop zone
  elements.dropZone.addEventListener("click", selectFiles);
  elements.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    elements.dropZone.classList.add("drag-over");
  });
  elements.dropZone.addEventListener("dragleave", () => {
    elements.dropZone.classList.remove("drag-over");
  });
  elements.dropZone.addEventListener("drop", handleFileDrop);

  // Converter buttons
  elements.selectFilesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectFiles();
  });
  elements.clearQueueBtn.addEventListener("click", clearFileQueue);
  elements.startConversionBtn.addEventListener("click", startConversion);
  elements.cancelConversionBtn.addEventListener(
    "click",
    cancelConversionProcess
  );
  elements.openConvertedFolderBtn.addEventListener(
    "click",
    openConvertedFolder
  );
  elements.newConversionBtn.addEventListener("click", resetConverter);

  // Format options
  document.querySelectorAll(".format-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      const group = btn.closest(".format-group");
      group
        .querySelectorAll(".format-option")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedOutputFormat = format;
    });
  });

  // Preset options
  document.querySelectorAll(".preset-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".preset-option")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedPreset = btn.dataset.preset;
    });
  });
}

// IPC Listeners
function setupIpcListeners() {
  // Theme change from system
  window.electronAPI.onThemeChanged((systemTheme) => {
    handleSystemThemeChange(systemTheme);
  });

  // Binary events
  window.electronAPI.onBinariesCheckStart(() => {
    elements.binaryModal.classList.add("show");
    elements.binaryStatus.textContent = "Bileşenler kontrol ediliyor...";
  });

  window.electronAPI.onBinariesDownloadStart(() => {
    elements.binaryModal.classList.add("show");
    elements.binaryStatus.textContent = "Gerekli bileşenler indiriliyor...";
    elements.binaryProgress.style.width = "0%";
    elements.binaryProgressText.textContent = "Başlatılıyor...";
  });

  window.electronAPI.onBinariesProgress((progress) => {
    const percent = Math.round(progress.percent);
    elements.binaryProgress.style.width = `${percent}%`;
    elements.binaryProgressText.textContent = `${progress.step}: ${
      progress.status === "extracting" ? "Çıkartılıyor..." : `%${percent}`
    }`;
  });

  window.electronAPI.onBinariesReady(() => {
    elements.binaryModal.classList.remove("show");
    checkBinaries();
  });

  window.electronAPI.onBinariesError((error) => {
    elements.binaryStatus.textContent = `Hata: ${error}`;
    elements.binaryProgressText.textContent =
      "Lütfen internet bağlantınızı kontrol edin";
  });

  // Status change events (from file watchers)
  window.electronAPI.onCookieStatusChanged((status) => {
    console.log("Cookie status changed (from watcher):", status);
    updateCookieUI(status);
  });

  window.electronAPI.onBinariesStatusChanged(() => {
    console.log("Binaries status changed (from watcher)");
    checkBinaries();
  });

  // Download progress
  window.electronAPI.onDownloadProgress((progress) => {
    elements.downloadProgressBar.style.width = `${progress.percent}%`;
    elements.downloadPercent.textContent = `%${Math.round(progress.percent)}`;
    elements.downloadStatus.textContent =
      progress.status === "processing" ? "İşleniyor..." : "İndiriliyor...";
  });

  // Update events
  window.electronAPI.onUpdateAvailable((info) => {
    elements.updateBanner.style.display = "flex";
    elements.updateText.textContent = `🎉 Yeni sürüm mevcut: v${info.version}`;
    elements.updateProgress.style.display = "none";
    elements.updatePercent.style.display = "none";
    elements.updateBtn.style.display = "inline-block";
    elements.updateBtn.textContent = "Güncelle";
    elements.updateBtn.disabled = false;
  });

  window.electronAPI.onUpdateProgress((percent) => {
    const roundedPercent = Math.round(percent);
    elements.updateText.textContent = "⬇️ Güncelleme indiriliyor...";
    elements.updateProgress.style.display = "block";
    elements.updatePercent.style.display = "inline";
    elements.updateProgressBar.style.width = `${roundedPercent}%`;
    elements.updatePercent.textContent = `%${roundedPercent}`;
    elements.updateBtn.style.display = "none";
  });

  window.electronAPI.onUpdateDownloaded(() => {
    elements.updateText.textContent = "✅ Güncelleme hazır!";
    elements.updateProgress.style.display = "none";
    elements.updatePercent.style.display = "none";
    elements.updateBtn.style.display = "inline-block";
    elements.updateBtn.textContent = "Yeniden Başlat";
    elements.updateBtn.disabled = false;
    elements.updateBtn.onclick = () => window.electronAPI.installUpdate();
  });

  window.electronAPI.onUpdateError((error) => {
    elements.updateText.textContent = "❌ Güncelleme hatası";
    elements.updateProgress.style.display = "none";
    elements.updatePercent.style.display = "none";
    elements.updateBtn.style.display = "inline-block";
    elements.updateBtn.textContent = "Tekrar Dene";
    elements.updateBtn.disabled = false;
    elements.updateBtn.onclick = async () => {
      elements.updateBtn.textContent = "Deneniyor...";
      elements.updateBtn.disabled = true;
      await window.electronAPI.downloadUpdate();
    };
  });

  // Converter events
  window.electronAPI.onConversionProgress((progress) => {
    if (progress.overallProgress !== undefined) {
      // Batch progress
      elements.conversionProgressBar.style.width = `${progress.overallProgress}%`;
      elements.conversionPercent.textContent = `%${progress.overallProgress}`;
      elements.conversionStatus.textContent = `Dosya ${progress.fileIndex}/${progress.totalFiles} işleniyor...`;
      elements.currentFileName.textContent = progress.fileName;
      elements.currentFileProgressBar.style.width = `${progress.fileProgress}%`;
    } else {
      // Single file progress
      elements.conversionProgressBar.style.width = `${progress.percent}%`;
      elements.conversionPercent.textContent = `%${progress.percent}`;
    }
  });

  window.electronAPI.onFileConverted((result) => {
    // Update file queue item status
    const fileItem = document.querySelector(
      `[data-path="${CSS.escape(result.file)}"]`
    );
    if (fileItem) {
      const statusIcon = fileItem.querySelector(".file-status-icon");
      if (statusIcon) {
        statusIcon.textContent = result.success ? "✅" : "❌";
      }
    }
  });

  window.electronAPI.onBatchComplete((result) => {
    showConversionComplete(result);
  });
}

// Load settings
async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  elements.downloadPath.value = settings.downloadPath;
  
  // Apply theme
  if (settings.theme) {
    currentTheme = settings.theme;
    await applyTheme(currentTheme);
  }
}

// Check binaries
async function checkBinaries() {
  const status = await window.electronAPI.checkBinaries();

  elements.binaryStatusList.innerHTML = `
        <div class="binary-item">
            <span class="binary-name">yt-dlp</span>
            ${
              status.ytdlp.exists
                ? `<span class="binary-version">✓ ${status.ytdlp.version}</span>`
                : `<span class="binary-missing">✗ Yüklü değil</span>`
            }
        </div>
        <div class="binary-item">
            <span class="binary-name">FFmpeg</span>
            ${
              status.ffmpeg.exists
                ? `<span class="binary-version">✓ ${status.ffmpeg.version}</span>`
                : `<span class="binary-missing">✗ Yüklü değil</span>`
            }
        </div>
        <div class="binary-item">
            <span class="binary-name">Deno</span>
            ${
              status.deno && status.deno.exists
                ? `<span class="binary-version">✓ ${status.deno.version}</span>`
                : `<span class="binary-missing">✗ Yüklü değil</span>`
            }
        </div>
    `;
}

// Check if yt-dlp needs update
async function checkYtdlpUpdate() {
  try {
    const result = await window.electronAPI.checkYtdlpUpdate();

    if (result.needsUpdate) {
      elements.updateYtdlpBtn.style.display = "inline-block";
      elements.ytdlpUpdateInfo.style.display = "block";
      elements.ytdlpUpdateInfo.textContent = `⚠️ Güncelleme mevcut: ${
        result.currentVersion || "bilinmiyor"
      } → ${result.latestVersion}`;

      // Bind click handler
      elements.updateYtdlpBtn.onclick = async () => {
        elements.updateYtdlpBtn.disabled = true;
        elements.updateYtdlpBtn.textContent = "⏳ Güncelleniyor...";

        try {
          const updateResult = await window.electronAPI.updateYtdlp();
          if (updateResult.success) {
            showSuccess(`yt-dlp güncellendi: ${updateResult.version}`);
            elements.updateYtdlpBtn.style.display = "none";
            elements.ytdlpUpdateInfo.style.display = "none";
            await checkBinaries();
          } else {
            showError(
              "Güncelleme başarısız: " +
                (updateResult.error || "Bilinmeyen hata")
            );
          }
        } catch (error) {
          showError("Güncelleme hatası: " + error.message);
        } finally {
          elements.updateYtdlpBtn.disabled = false;
          elements.updateYtdlpBtn.textContent = "⬆️ yt-dlp Güncelle";
        }
      };
    } else {
      elements.updateYtdlpBtn.style.display = "none";
      elements.ytdlpUpdateInfo.style.display = "none";
    }
  } catch (error) {
    console.error("yt-dlp update check failed:", error);
  }
}

// Check cookie status
async function checkCookieStatus() {
  const status = await window.electronAPI.getCookieStatus();
  console.log("Cookie status:", status);
  updateCookieUI(status);
}

// Update cookie UI based on status (called by checkCookieStatus and file watcher)
function updateCookieUI(status) {
  // Cookie dosyası varsa ve geçerli login cookie'leri varsa = giriş yapılmış
  if (status.hasCookies && status.hasLoginCookies && status.cookieCount > 0) {
    elements.cookieSyncStatus.classList.add("synced");
    elements.cookieSyncStatus.querySelector(".cookie-icon").textContent = "✅";
    elements.cookieSyncText.textContent = `YouTube hesabı bağlı (${status.cookieCount} çerez)`;

    // Giriş yapılmış - giriş butonunu gizle, diğerlerini göster
    elements.youtubeLoginBtn.style.display = "none";
    elements.refreshCookiesBtn.style.display = "inline-block";
    elements.deleteCookieBtn.style.display = "inline-block";
  } else {
    elements.cookieSyncStatus.classList.remove("synced");
    elements.cookieSyncStatus.querySelector(".cookie-icon").textContent = "🔒";
    elements.cookieSyncText.textContent = "Giriş yapılmadı";

    // Giriş yapılmamış - giriş butonunu göster, diğerlerini gizle
    elements.youtubeLoginBtn.style.display = "inline-block";
    elements.refreshCookiesBtn.style.display = "none";
    elements.deleteCookieBtn.style.display = "none";
  }
}

// Check and show login status on startup (for already logged in users)
async function checkAndShowLoginStatus() {
  const status = await window.electronAPI.getCookieStatus();

  // If user has cookies, they're logged in
  if (status.hasCookies && status.cookieCount > 0) {
    console.log("YouTube hesabı zaten bağlı, +18 videolar indirilebilir.");
  }
}

// Show success message
function showSuccess(message) {
  // Use error element for now with green styling
  elements.errorMessage.style.display = "flex";
  elements.errorMessage.style.background = "rgba(74, 222, 128, 0.1)";
  elements.errorMessage.style.borderColor = "#4ade80";
  elements.errorMessage.querySelector(".error-icon").textContent = "✅";
  elements.errorMessage.querySelector(".error-text").textContent = message;
  elements.errorMessage.querySelector(".error-text").style.color = "#4ade80";

  setTimeout(() => {
    hideError();
    // Reset styles
    elements.errorMessage.style.background = "";
    elements.errorMessage.style.borderColor = "";
    elements.errorMessage.querySelector(".error-icon").textContent = "⚠️";
    elements.errorMessage.querySelector(".error-text").style.color = "";
  }, 3000);
}

// Open settings panel
function openSettings() {
  elements.settingsPanel.style.display = "block";
  elements.settingsOverlay.style.display = "block";
  // Trigger reflow to enable transition
  elements.settingsPanel.offsetHeight;
  elements.settingsPanel.classList.add("show");
  elements.settingsOverlay.classList.add("show");
}

// Close settings panel
function closeSettings() {
  elements.settingsPanel.classList.remove("show");
  elements.settingsOverlay.classList.remove("show");
  // Wait for animation to finish before hiding
  setTimeout(() => {
    elements.settingsPanel.style.display = "none";
    elements.settingsOverlay.style.display = "none";
  }, 300);
}

// Validate URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// Show error
function showError(message) {
  elements.errorMessage.style.display = "flex";
  elements.errorMessage.querySelector(".error-text").textContent = message;
}

// Hide error
function hideError() {
  elements.errorMessage.style.display = "none";
}

// Fetch video info
async function fetchVideo() {
  const url = elements.urlInput.value.trim();

  if (!url) {
    showError("Lütfen bir video URL'si girin");
    return;
  }

  if (!isValidUrl(url)) {
    showError("Geçersiz URL formatı");
    return;
  }

  hideError();
  elements.videoSection.style.display = "none";
  elements.downloadComplete.style.display = "none";

  // Show loading state
  const btnText = elements.fetchBtn.querySelector(".btn-text");
  const btnLoader = elements.fetchBtn.querySelector(".btn-loader");
  btnText.style.display = "none";
  btnLoader.style.display = "inline";
  elements.fetchBtn.disabled = true;

  try {
    const result = await window.electronAPI.getVideoInfo(url);

    if (!result.success) {
      showError(result.error);
      return;
    }

    currentVideoInfo = result.data;
    displayVideoInfo(result.data);
  } catch (error) {
    showError(error.message || "Video bilgisi alınamadı");
  } finally {
    btnText.style.display = "inline";
    btnLoader.style.display = "none";
    elements.fetchBtn.disabled = false;
  }
}

// Display video info
function displayVideoInfo(info) {
  elements.videoThumbnail.src = info.thumbnail;
  elements.videoTitle.textContent = info.title;
  elements.videoUploader.textContent = info.uploader || "Bilinmeyen";
  elements.videoViews.textContent = info.viewCount
    ? formatNumber(info.viewCount) + " görüntüleme"
    : "";
  elements.videoDuration.textContent = formatDuration(info.duration);

  // Video formats
  elements.videoFormatList.innerHTML = "";
  if (info.formats.video && info.formats.video.length > 0) {
    info.formats.video.forEach((format) => {
      const item = createFormatItem(format, false);
      elements.videoFormatList.appendChild(item);
    });
  } else {
    elements.videoFormatList.innerHTML =
      '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Video formatı bulunamadı</p>';
  }

  // Audio formats
  elements.audioFormatList.innerHTML = "";
  if (info.formats.audio && info.formats.audio.length > 0) {
    info.formats.audio.forEach((format) => {
      const item = createFormatItem(format, true);
      elements.audioFormatList.appendChild(item);
    });
  }

  // Reset format selection
  selectedFormat = null;
  elements.downloadAction.style.display = "none";

  elements.videoSection.style.display = "block";
}

// Create format item
function createFormatItem(format, isAudio) {
  const div = document.createElement("div");
  div.className = "format-item";
  div.dataset.formatId = format.formatId;

  if (isAudio) {
    div.innerHTML = `
            <div class="format-info">
                <span class="format-quality">${
                  format.quality || "Bilinmeyen"
                }</span>
                <span class="format-details">${format.ext.toUpperCase()}</span>
            </div>
            <span class="format-size">${
              format.filesize ? formatFileSize(format.filesize) : "~"
            }</span>
        `;
  } else {
    div.innerHTML = `
            <div class="format-info">
                <span class="format-quality">${
                  format.quality || "Bilinmeyen"
                }</span>
                <span class="format-details">${
                  format.description || format.ext.toUpperCase()
                } • 🔊 Sesli</span>
            </div>
            <span class="format-size">MP4</span>
        `;
  }

  div.addEventListener("click", () =>
    selectFormat(format.formatId, isAudio, format.quality, format.ext)
  );

  return div;
}

// Select format (without starting download)
function selectFormat(formatId, isAudio, quality, ext) {
  if (isDownloading) return;

  // Clear previous selection
  document.querySelectorAll(".format-item").forEach((item) => {
    item.classList.remove("selected");
  });

  // Select new format
  if (formatId) {
    const formatItem = document.querySelector(
      `.format-item[data-format-id="${formatId}"]`
    );
    if (formatItem) {
      formatItem.classList.add("selected");
    }
  }

  // Store selected format
  selectedFormat = { formatId, isAudio, quality, ext };

  // Show download action
  elements.downloadAction.style.display = "block";

  // Update selected format info
  if (isAudio && !formatId) {
    elements.selectedFormatInfo.innerHTML = `
            <span>🎵</span>
            <span class="format-label">MP3 (En İyi Kalite)</span>
        `;
  } else if (isAudio) {
    elements.selectedFormatInfo.innerHTML = `
            <span>🎵</span>
            <span class="format-label">${quality || "Ses"}</span>
            <span>•</span>
            <span>${ext ? ext.toUpperCase() : "Ses Dosyası"}</span>
        `;
  } else {
    elements.selectedFormatInfo.innerHTML = `
            <span>🎬</span>
            <span class="format-label">${quality || "Video"}</span>
            <span>•</span>
            <span>MP4 (Sesli)</span>
        `;
  }
}

// Start download with selected format
async function startSelectedDownload() {
  if (!selectedFormat || isDownloading) return;

  await downloadVideo(selectedFormat.formatId, selectedFormat.isAudio);
}

// Download video
async function downloadVideo(formatId, audioOnly = false) {
  if (isDownloading || !currentVideoInfo) return;

  isDownloading = true;
  hideError();

  // Disable format section during download
  elements.formatSection.classList.add("disabled");
  elements.startDownloadBtn.disabled = true;
  elements.startDownloadBtn.innerHTML = "⏳ İndiriliyor...";

  elements.downloadProgress.style.display = "block";
  elements.downloadComplete.style.display = "none";
  elements.downloadProgressBar.style.width = "0%";
  elements.downloadPercent.textContent = "%0";
  elements.downloadStatus.textContent = "Başlatılıyor...";

  try {
    const result = await window.electronAPI.downloadVideo({
      url: currentVideoInfo.url,
      formatId: formatId,
      audioOnly: audioOnly,
    });

    if (!result.success) {
      showError(result.error);
      elements.downloadProgress.style.display = "none";
      return;
    }

    // Success
    elements.downloadProgress.style.display = "none";
    elements.downloadComplete.style.display = "flex";

    // Check if video was already downloaded
    const completeIcon =
      elements.downloadComplete.querySelector(".complete-icon");
    const completeText =
      elements.downloadComplete.querySelector(".complete-text");

    if (result.data && result.data.alreadyDownloaded) {
      completeIcon.textContent = "📁";
      completeText.textContent = "Bu video zaten indirilmiş!";
    } else {
      completeIcon.textContent = "✅";
      completeText.textContent = "İndirme tamamlandı!";
    }
  } catch (error) {
    showError(error.message || "İndirme başarısız oldu");
    elements.downloadProgress.style.display = "none";
  } finally {
    isDownloading = false;
    // Re-enable format section
    elements.formatSection.classList.remove("disabled");
    elements.startDownloadBtn.disabled = false;
    elements.startDownloadBtn.innerHTML = "⬇️ İndir";
  }
}

// Cancel download
async function cancelDownload() {
  await window.electronAPI.cancelDownload();
  elements.downloadProgress.style.display = "none";
  isDownloading = false;
  // Re-enable format section
  elements.formatSection.classList.remove("disabled");
  elements.startDownloadBtn.disabled = false;
  elements.startDownloadBtn.innerHTML = "⬇️ İndir";
}

// Format helpers
function formatDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

function openNavSidebar() {
  elements.navSidebar.classList.add("show");
  elements.navOverlay.classList.add("show");
  elements.hamburgerBtn.classList.add("active");
}

function closeNavSidebar() {
  elements.navSidebar.classList.remove("show");
  elements.navOverlay.classList.remove("show");
  elements.hamburgerBtn.classList.remove("active");
}

function switchMode(mode) {
  if (mode === currentMode) return;

  currentMode = mode;

  // Update nav items
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.mode === mode);
  });

  // Update header
  if (mode === "downloader") {
    elements.logoIcon.textContent = "📥";
    elements.pageTitle.textContent = "Video Downloader";
    elements.pageTitle.classList.remove("converter-title");
  } else {
    elements.logoIcon.textContent = "🔄";
    elements.pageTitle.textContent = "Dönüştürücü";
    elements.pageTitle.classList.add("converter-title");
  }

  // Show/hide sections
  const downloaderElements = [
    elements.urlSection,
    elements.videoSection,
    elements.errorMessage,
  ];
  const converterElements = [elements.converterSection];

  if (mode === "downloader") {
    elements.urlSection.style.display = "block";
    elements.converterSection.style.display = "none";
    // Keep video section state as-is
  } else {
    elements.urlSection.style.display = "none";
    elements.videoSection.style.display = "none";
    elements.errorMessage.style.display = "none";
    elements.converterSection.style.display = "block";
  }
}

// ============================================
// CONVERTER FUNCTIONS
// ============================================

async function selectFiles() {
  const result = await window.electronAPI.selectInputFiles();

  if (result.success && result.files.length > 0) {
    addFilesToQueue(result.files);
  }
}

function handleFileDrop(e) {
  e.preventDefault();
  elements.dropZone.classList.remove("drag-over");

  const files = Array.from(e.dataTransfer.files);
  const validExtensions = [
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
  ];

  const validFiles = files.filter((file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    return validExtensions.includes(ext);
  });

  if (validFiles.length > 0) {
    // Get file info for dropped files
    Promise.all(
      validFiles.map(async (file) => {
        try {
          const result = await window.electronAPI.getFileInfo(file.path);
          if (result.success) {
            return {
              path: file.path,
              name: file.name,
              size: result.data.size,
              sizeFormatted: result.data.sizeFormatted,
              type: result.data.type,
              duration: result.data.durationFormatted,
            };
          }
        } catch (error) {
          console.error("Error getting file info:", error);
        }
        return {
          path: file.path,
          name: file.name,
          size: file.size,
          sizeFormatted: formatFileSize(file.size),
          type: "unknown",
        };
      })
    ).then((filesWithInfo) => {
      addFilesToQueue(filesWithInfo);
    });
  }
}

function addFilesToQueue(newFiles) {
  // Avoid duplicates
  newFiles.forEach((file) => {
    if (!fileQueue.find((f) => f.path === file.path)) {
      fileQueue.push(file);
    }
  });

  updateFileQueueUI();
  updateFormatOptions();
}

function removeFromQueue(filePath) {
  fileQueue = fileQueue.filter((f) => f.path !== filePath);
  updateFileQueueUI();
  updateFormatOptions();
}

function clearFileQueue() {
  fileQueue = [];
  updateFileQueueUI();
  updateFormatOptions();
}

function updateFileQueueUI() {
  const hasFiles = fileQueue.length > 0;

  // Toggle has-files class for layout reordering
  elements.converterSection.classList.toggle("has-files", hasFiles);

  elements.fileQueueSection.style.display = hasFiles ? "block" : "none";
  elements.conversionSettings.style.display = hasFiles ? "block" : "none";
  elements.fileCount.textContent = fileQueue.length;

  // Show warning for 20+ files
  if (fileQueue.length > 20) {
    elements.queueWarning.style.display = "flex";
    elements.warningText.textContent = `${fileQueue.length} dosya seçildi. Bu işlem uzun sürebilir.`;
  } else {
    elements.queueWarning.style.display = "none";
  }

  // Render file list using data-index for reliable removal
  elements.fileQueue.innerHTML = fileQueue
    .map(
      (file, index) => `
        <div class="file-queue-item" data-path="${
          file.path
        }" data-index="${index}">
            <div class="file-info">
                <span class="file-type-icon">${
                  file.type === "video"
                    ? "🎬"
                    : file.type === "audio"
                    ? "🎵"
                    : "📄"
                }</span>
                <div class="file-details">
                    <span class="file-name" title="${file.name}">${
        file.name
      }</span>
                    <span class="file-meta">${file.sizeFormatted}${
        file.duration ? " • " + file.duration : ""
      }</span>
                </div>
            </div>
            <div class="file-status">
                <span class="file-status-icon">⏳</span>
                <button class="file-remove-btn" data-remove-index="${index}" title="Kaldır">×</button>
            </div>
        </div>
    `
    )
    .join("");

  // Add click handlers for remove buttons
  elements.fileQueue.querySelectorAll(".file-remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.removeIndex, 10);
      if (!isNaN(index) && index >= 0 && index < fileQueue.length) {
        removeFromQueueByIndex(index);
      }
    });
  });
}

function removeFromQueueByIndex(index) {
  fileQueue.splice(index, 1);
  updateFileQueueUI();
  updateFormatOptions();
}

function updateFormatOptions() {
  // Determine dominant file type
  const videoCount = fileQueue.filter((f) => f.type === "video").length;
  const audioCount = fileQueue.filter((f) => f.type === "audio").length;

  // Video formats we support
  const videoFormats = ["mp4", "mkv", "webm", "avi", "mov"];
  const audioFormats = ["mp3", "aac", "wav", "flac", "ogg"];

  if (videoCount > 0 && audioCount === 0) {
    // All video files
    elements.videoFormatGroup.style.display = "flex";
    elements.audioFormatGroup.style.display = "none";

    // Get the extension of the first video file to set as default
    const firstVideoFile = fileQueue.find((f) => f.type === "video");
    if (firstVideoFile) {
      const ext = firstVideoFile.name.split(".").pop().toLowerCase();
      // If the extension is a supported video format, select it
      selectedOutputFormat = videoFormats.includes(ext) ? ext : "mp4";
    } else {
      selectedOutputFormat = "mp4";
    }
  } else if (audioCount > 0 && videoCount === 0) {
    // All audio files
    elements.videoFormatGroup.style.display = "none";
    elements.audioFormatGroup.style.display = "flex";

    // Get the extension of the first audio file to set as default
    const firstAudioFile = fileQueue.find((f) => f.type === "audio");
    if (firstAudioFile) {
      const ext = firstAudioFile.name.split(".").pop().toLowerCase();
      // If the extension is a supported audio format, select it
      selectedOutputFormat = audioFormats.includes(ext) ? ext : "mp3";
    } else {
      selectedOutputFormat = "mp3";
    }
  } else {
    // Mixed or unknown - show video formats by default
    elements.videoFormatGroup.style.display = "flex";
    elements.audioFormatGroup.style.display = "none";

    // Try to detect format from first file
    const firstFile = fileQueue[0];
    if (firstFile) {
      const ext = firstFile.name.split(".").pop().toLowerCase();
      if (videoFormats.includes(ext)) {
        selectedOutputFormat = ext;
      } else {
        selectedOutputFormat = "mp4";
      }
    } else {
      selectedOutputFormat = "mp4";
    }
  }

  // Reset format selection
  document.querySelectorAll(".format-option").forEach((btn) => {
    btn.classList.toggle(
      "selected",
      btn.dataset.format === selectedOutputFormat
    );
  });
}

async function startConversion() {
  if (fileQueue.length === 0) return;

  isConverting = true;

  // Hide settings, show progress
  elements.conversionSettings.style.display = "none";
  elements.fileQueueSection.style.display = "none";
  elements.dropZone.style.display = "none";
  elements.queueWarning.style.display = "none";
  elements.conversionProgressSection.style.display = "block";
  elements.conversionComplete.style.display = "none";

  // Reset progress
  elements.conversionProgressBar.style.width = "0%";
  elements.conversionPercent.textContent = "%0";
  elements.currentFileProgressBar.style.width = "0%";
  elements.conversionStatus.textContent = "Başlatılıyor...";
  elements.currentFileName.textContent = fileQueue[0]?.name || "";

  const filePaths = fileQueue.map((f) => f.path);

  try {
    const result = await window.electronAPI.convertBatch(filePaths, {
      outputFormat: selectedOutputFormat,
      preset: selectedPreset,
    });

    if (result.success) {
      // Save last converted file path for folder opening
      if (result.data.success.length > 0) {
        lastConvertedFilePath = result.data.success[0].outputPath;
      }
    }
  } catch (error) {
    console.error("Conversion error:", error);
    showError("Dönüştürme sırasında bir hata oluştu");
  }

  isConverting = false;
}

function showConversionComplete(result) {
  elements.conversionProgressSection.style.display = "none";
  elements.conversionComplete.style.display = "block";

  elements.successCount.textContent = result.success.length;

  if (result.failed.length > 0) {
    elements.failedSummary.style.display = "flex";
    elements.failedCount.textContent = result.failed.length;
    elements.failedFilesList.style.display = "block";
    elements.failedFilesUl.innerHTML = result.failed
      .map((f) => `<li>• ${f.fileName} - ${f.error}</li>`)
      .join("");
  } else {
    elements.failedSummary.style.display = "none";
    elements.failedFilesList.style.display = "none";
  }
}

async function cancelConversionProcess() {
  await window.electronAPI.cancelConversion();
  isConverting = false;
  resetConverter();
}

function openConvertedFolder() {
  window.electronAPI.openConvertedFolder(lastConvertedFilePath);
}

function resetConverter() {
  fileQueue = [];
  lastConvertedFilePath = null;
  selectedOutputFormat = "mp4";
  selectedPreset = "balanced";

  // Reset UI
  elements.dropZone.style.display = "block";
  elements.fileQueueSection.style.display = "none";
  elements.conversionSettings.style.display = "none";
  elements.conversionProgressSection.style.display = "none";
  elements.conversionComplete.style.display = "none";
  elements.queueWarning.style.display = "none";

  // Reset preset selection
  document.querySelectorAll(".preset-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.preset === "balanced");
  });

  updateFormatOptions();
}

// Make removeFromQueue global for inline onclick
window.removeFromQueue = removeFromQueue;

// Initialize on load
document.addEventListener("DOMContentLoaded", init);
