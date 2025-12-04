// State
let currentVideoInfo = null;
let isDownloading = false;
let selectedFormat = null; // { formatId, isAudio, quality, ext }

// DOM Elements
const elements = {
    // Modals
    binaryModal: document.getElementById('binaryModal'),
    binaryProgress: document.getElementById('binaryProgress'),
    binaryProgressText: document.getElementById('binaryProgressText'),
    binaryStatus: document.getElementById('binaryStatus'),
    
    // Update banner
    updateBanner: document.getElementById('updateBanner'),
    updateText: document.getElementById('updateText'),
    updateProgress: document.getElementById('updateProgress'),
    updateProgressBar: document.getElementById('updateProgressBar'),
    updatePercent: document.getElementById('updatePercent'),
    updateBtn: document.getElementById('updateBtn'),
    dismissUpdate: document.getElementById('dismissUpdate'),
    
    // URL section
    urlInput: document.getElementById('urlInput'),
    fetchBtn: document.getElementById('fetchBtn'),
    errorMessage: document.getElementById('errorMessage'),
    
    // Video section
    videoSection: document.getElementById('videoSection'),
    videoThumbnail: document.getElementById('videoThumbnail'),
    videoDuration: document.getElementById('videoDuration'),
    videoTitle: document.getElementById('videoTitle'),
    videoUploader: document.getElementById('videoUploader'),
    videoViews: document.getElementById('videoViews'),
    
    // Formats
    videoFormatList: document.getElementById('videoFormatList'),
    audioFormatList: document.getElementById('audioFormatList'),
    videoFormats: document.getElementById('videoFormats'),
    audioFormats: document.getElementById('audioFormats'),
    downloadMp3Btn: document.getElementById('downloadMp3Btn'),
    
    // Format section
    formatSection: document.getElementById('formatSection'),
    downloadAction: document.getElementById('downloadAction'),
    selectedFormatInfo: document.getElementById('selectedFormatInfo'),
    startDownloadBtn: document.getElementById('startDownloadBtn'),
    
    // Progress
    downloadProgress: document.getElementById('downloadProgress'),
    downloadProgressBar: document.getElementById('downloadProgressBar'),
    downloadPercent: document.getElementById('downloadPercent'),
    downloadStatus: document.getElementById('downloadStatus'),
    cancelDownload: document.getElementById('cancelDownload'),
    downloadComplete: document.getElementById('downloadComplete'),
    openFolderBtn: document.getElementById('openFolderBtn'),
    
    // Settings
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    closeSettings: document.getElementById('closeSettings'),
    browserList: document.getElementById('browserList'),
    browserSettingGroup: document.getElementById('browserSettingGroup'),
    downloadPath: document.getElementById('downloadPath'),
    selectPathBtn: document.getElementById('selectPathBtn'),
    binaryStatusList: document.getElementById('binaryStatusList'),
    updateBinariesBtn: document.getElementById('updateBinariesBtn'),
    useCookiesToggle: document.getElementById('useCookiesToggle'),
    cookieStatusText: document.getElementById('cookieStatusText'),
    // Cookie sync elements
    cookieSyncStatus: document.getElementById('cookieSyncStatus'),
    cookieSyncText: document.getElementById('cookieSyncText'),
    youtubeLoginBtn: document.getElementById('youtubeLoginBtn'),
    refreshCookiesBtn: document.getElementById('refreshCookiesBtn'),
    importCookieBtn: document.getElementById('importCookieBtn'),
    deleteCookieBtn: document.getElementById('deleteCookieBtn'),
    // yt-dlp update
    updateYtdlpBtn: document.getElementById('updateYtdlpBtn'),
    ytdlpUpdateInfo: document.getElementById('ytdlpUpdateInfo')
};

// Initialize
async function init() {
    setupEventListeners();
    setupIpcListeners();
    await loadSettings();
    await checkBinaries();
    await checkYtdlpUpdate();
    await checkCookieStatus();
    await checkAndShowLoginStatus();
}

// Event Listeners
function setupEventListeners() {
    // Fetch video
    elements.fetchBtn.addEventListener('click', fetchVideo);
    elements.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchVideo();
    });
    
    // Paste from clipboard on focus
    elements.urlInput.addEventListener('focus', async () => {
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
    document.querySelectorAll('.format-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.format-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.dataset.tab;
            elements.videoFormats.style.display = tabName === 'video' ? 'block' : 'none';
            elements.audioFormats.style.display = tabName === 'audio' ? 'block' : 'none';
        });
    });
    
    // Download MP3 - select format instead of immediate download
    elements.downloadMp3Btn.addEventListener('click', () => selectFormat(null, true, 'MP3', 'mp3'));
    
    // Start download button
    elements.startDownloadBtn.addEventListener('click', startSelectedDownload);
    
    // Cancel download
    elements.cancelDownload.addEventListener('click', cancelDownload);
    
    // Open folder
    elements.openFolderBtn.addEventListener('click', () => {
        window.electronAPI.openDownloadFolder();
    });
    
    // Settings
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsPanel.style.display = 'block';
    });
    
    elements.closeSettings.addEventListener('click', () => {
        elements.settingsPanel.style.display = 'none';
    });
    
    elements.selectPathBtn.addEventListener('click', async () => {
        const newPath = await window.electronAPI.selectDownloadPath();
        if (newPath) {
            elements.downloadPath.value = newPath;
        }
    });
    
    elements.updateBinariesBtn.addEventListener('click', async () => {
        elements.binaryModal.classList.add('show');
        elements.binaryStatus.textContent = 'Bileşenler indiriliyor...';
        elements.binaryProgress.style.width = '0%';
        elements.binaryProgressText.textContent = 'Başlatılıyor...';
        
        try {
            const result = await window.electronAPI.downloadBinaries();
            if (result.success) {
                elements.binaryModal.classList.remove('show');
                showSuccess('Bileşenler başarıyla güncellendi!');
                await checkBinaries();
                await checkYtdlpUpdate();
            } else {
                elements.binaryStatus.textContent = 'Hata: ' + result.error;
            }
        } catch (error) {
            elements.binaryStatus.textContent = 'Hata: ' + error.message;
        }
    });
    
    // Cookie sync buttons
    elements.youtubeLoginBtn.addEventListener('click', async () => {
        elements.youtubeLoginBtn.textContent = 'Giriş yapılıyor...';
        elements.youtubeLoginBtn.disabled = true;
        
        try {
            const result = await window.electronAPI.autoSyncCookies();
            if (result.success) {
                showSuccess(result.message || `${result.cookieCount} çerez başarıyla senkronize edildi!`);
                await checkCookieStatus();
            } else if (result.error !== 'Giriş penceresi kapatıldı') {
                showError(result.error);
            }
        } catch (error) {
            showError('Giriş yapılamadı');
        } finally {
            elements.youtubeLoginBtn.textContent = '🔐 YouTube\'a Giriş Yap';
            elements.youtubeLoginBtn.disabled = false;
        }
    });
    
    elements.refreshCookiesBtn.addEventListener('click', async () => {
        elements.refreshCookiesBtn.textContent = 'Yenileniyor...';
        elements.refreshCookiesBtn.disabled = true;
        
        try {
            const result = await window.electronAPI.quickSyncCookies();
            if (result.success) {
                showSuccess(result.message || 'Çerezler yenilendi!');
                await checkCookieStatus();
            } else {
                // Kayıtlı oturum yoksa login penceresini aç
                const loginResult = await window.electronAPI.autoSyncCookies();
                if (loginResult.success) {
                    showSuccess(loginResult.message || 'Çerezler senkronize edildi!');
                    await checkCookieStatus();
                }
            }
        } catch (error) {
            showError('Çerezler yenilenemedi');
        } finally {
            elements.refreshCookiesBtn.textContent = '🔄 Çerezleri Yenile';
            elements.refreshCookiesBtn.disabled = false;
        }
    });
    
    elements.importCookieBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.importCookieFile();
        if (result.success) {
            showSuccess(`${result.cookieCount} çerez başarıyla yüklendi!`);
            await checkCookieStatus();
        } else if (result.error !== 'İptal edildi') {
            showError(result.error);
        }
    });
    
    elements.deleteCookieBtn.addEventListener('click', async () => {
        await window.electronAPI.deleteCookies();
        await checkCookieStatus();
        showSuccess('Oturum kapatıldı');
    });
    
    // Update
    elements.updateBtn.addEventListener('click', async () => {
        elements.updateText.textContent = '⬇️ Güncelleme başlatılıyor...';
        elements.updateBtn.style.display = 'none';
        elements.updateProgress.style.display = 'block';
        elements.updateProgressBar.style.width = '0%';
        elements.updatePercent.style.display = 'inline';
        elements.updatePercent.textContent = '%0';
        await window.electronAPI.downloadUpdate();
    });
    
    elements.dismissUpdate.addEventListener('click', () => {
        elements.updateBanner.style.display = 'none';
    });
}

// IPC Listeners
function setupIpcListeners() {
    // Binary events
    window.electronAPI.onBinariesCheckStart(() => {
        elements.binaryModal.classList.add('show');
        elements.binaryStatus.textContent = 'Bileşenler kontrol ediliyor...';
    });
    
    window.electronAPI.onBinariesDownloadStart(() => {
        elements.binaryModal.classList.add('show');
        elements.binaryStatus.textContent = 'Gerekli bileşenler indiriliyor...';
        elements.binaryProgress.style.width = '0%';
        elements.binaryProgressText.textContent = 'Başlatılıyor...';
    });
    
    window.electronAPI.onBinariesProgress((progress) => {
        const percent = Math.round(progress.percent);
        elements.binaryProgress.style.width = `${percent}%`;
        elements.binaryProgressText.textContent = `${progress.step}: ${progress.status === 'extracting' ? 'Çıkartılıyor...' : `%${percent}`}`;
    });
    
    window.electronAPI.onBinariesReady(() => {
        elements.binaryModal.classList.remove('show');
        checkBinaries();
    });
    
    window.electronAPI.onBinariesError((error) => {
        elements.binaryStatus.textContent = `Hata: ${error}`;
        elements.binaryProgressText.textContent = 'Lütfen internet bağlantınızı kontrol edin';
    });
    
    // Status change events (from file watchers)
    window.electronAPI.onCookieStatusChanged((status) => {
        console.log('Cookie status changed (from watcher):', status);
        updateCookieUI(status);
    });
    
    window.electronAPI.onBinariesStatusChanged(() => {
        console.log('Binaries status changed (from watcher)');
        checkBinaries();
    });
    
    // Download progress
    window.electronAPI.onDownloadProgress((progress) => {
        elements.downloadProgressBar.style.width = `${progress.percent}%`;
        elements.downloadPercent.textContent = `%${Math.round(progress.percent)}`;
        elements.downloadStatus.textContent = progress.status === 'processing' ? 'İşleniyor...' : 'İndiriliyor...';
    });
    
    // Update events
    window.electronAPI.onUpdateAvailable((info) => {
        elements.updateBanner.style.display = 'flex';
        elements.updateText.textContent = `🎉 Yeni sürüm mevcut: v${info.version}`;
        elements.updateProgress.style.display = 'none';
        elements.updatePercent.style.display = 'none';
        elements.updateBtn.style.display = 'inline-block';
        elements.updateBtn.textContent = 'Güncelle';
        elements.updateBtn.disabled = false;
    });
    
    window.electronAPI.onUpdateProgress((percent) => {
        const roundedPercent = Math.round(percent);
        elements.updateText.textContent = '⬇️ Güncelleme indiriliyor...';
        elements.updateProgress.style.display = 'block';
        elements.updatePercent.style.display = 'inline';
        elements.updateProgressBar.style.width = `${roundedPercent}%`;
        elements.updatePercent.textContent = `%${roundedPercent}`;
        elements.updateBtn.style.display = 'none';
    });

    window.electronAPI.onUpdateDownloaded(() => {
        elements.updateText.textContent = '✅ Güncelleme hazır!';
        elements.updateProgress.style.display = 'none';
        elements.updatePercent.style.display = 'none';
        elements.updateBtn.style.display = 'inline-block';
        elements.updateBtn.textContent = 'Yeniden Başlat';
        elements.updateBtn.disabled = false;
        elements.updateBtn.onclick = () => window.electronAPI.installUpdate();
    });
    
    window.electronAPI.onUpdateError((error) => {
        elements.updateText.textContent = '❌ Güncelleme hatası';
        elements.updateProgress.style.display = 'none';
        elements.updatePercent.style.display = 'none';
        elements.updateBtn.style.display = 'inline-block';
        elements.updateBtn.textContent = 'Tekrar Dene';
        elements.updateBtn.disabled = false;
        elements.updateBtn.onclick = async () => {
            elements.updateBtn.textContent = 'Deneniyor...';
            elements.updateBtn.disabled = true;
            await window.electronAPI.downloadUpdate();
        };
        console.error('Update error:', error);
    });
}

// Load settings
async function loadSettings() {
    const settings = await window.electronAPI.getSettings();
    elements.downloadPath.value = settings.downloadPath;
    
    // Load cookie settings
    const useCookies = settings.useCookies !== false; // default true
    elements.useCookiesToggle.checked = useCookies;
    elements.cookieStatusText.textContent = useCookies ? 'Çerezler aktif' : 'Çerezler devre dışı';
    elements.browserSettingGroup.classList.toggle('disabled', !useCookies);
}

// Check binaries
async function checkBinaries() {
    const status = await window.electronAPI.checkBinaries();
    
    elements.binaryStatusList.innerHTML = `
        <div class="binary-item">
            <span class="binary-name">yt-dlp</span>
            ${status.ytdlp.exists 
                ? `<span class="binary-version">✓ ${status.ytdlp.version}</span>`
                : `<span class="binary-missing">✗ Yüklü değil</span>`
            }
        </div>
        <div class="binary-item">
            <span class="binary-name">FFmpeg</span>
            ${status.ffmpeg.exists 
                ? `<span class="binary-version">✓ ${status.ffmpeg.version}</span>`
                : `<span class="binary-missing">✗ Yüklü değil</span>`
            }
        </div>
        <div class="binary-item">
            <span class="binary-name">Deno</span>
            ${status.deno && status.deno.exists 
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
            elements.updateYtdlpBtn.style.display = 'inline-block';
            elements.ytdlpUpdateInfo.style.display = 'block';
            elements.ytdlpUpdateInfo.textContent = `⚠️ Güncelleme mevcut: ${result.currentVersion || 'bilinmiyor'} → ${result.latestVersion}`;
            
            // Bind click handler
            elements.updateYtdlpBtn.onclick = async () => {
                elements.updateYtdlpBtn.disabled = true;
                elements.updateYtdlpBtn.textContent = '⏳ Güncelleniyor...';
                
                try {
                    const updateResult = await window.electronAPI.updateYtdlp();
                    if (updateResult.success) {
                        showSuccess(`yt-dlp güncellendi: ${updateResult.version}`);
                        elements.updateYtdlpBtn.style.display = 'none';
                        elements.ytdlpUpdateInfo.style.display = 'none';
                        await checkBinaries();
                    } else {
                        showError('Güncelleme başarısız: ' + (updateResult.error || 'Bilinmeyen hata'));
                    }
                } catch (error) {
                    showError('Güncelleme hatası: ' + error.message);
                } finally {
                    elements.updateYtdlpBtn.disabled = false;
                    elements.updateYtdlpBtn.textContent = '⬆️ yt-dlp Güncelle';
                }
            };
        } else {
            elements.updateYtdlpBtn.style.display = 'none';
            elements.ytdlpUpdateInfo.style.display = 'none';
        }
    } catch (error) {
        console.error('yt-dlp update check failed:', error);
    }
}

// Check cookie status
async function checkCookieStatus() {
    const status = await window.electronAPI.getCookieStatus();
    console.log('Cookie status:', status);
    updateCookieUI(status);
}

// Update cookie UI based on status (called by checkCookieStatus and file watcher)
function updateCookieUI(status) {
    // Cookie dosyası varsa ve geçerli login cookie'leri varsa = giriş yapılmış
    if (status.hasCookies && status.hasLoginCookies && status.cookieCount > 0) {
        elements.cookieSyncStatus.classList.add('synced');
        elements.cookieSyncStatus.querySelector('.cookie-icon').textContent = '✅';
        elements.cookieSyncText.textContent = `YouTube hesabı bağlı (${status.cookieCount} çerez)`;
        
        // Giriş yapılmış - giriş butonunu gizle, diğerlerini göster
        elements.youtubeLoginBtn.style.display = 'none';
        elements.refreshCookiesBtn.style.display = 'inline-block';
        elements.deleteCookieBtn.style.display = 'inline-block';
    } else {
        elements.cookieSyncStatus.classList.remove('synced');
        elements.cookieSyncStatus.querySelector('.cookie-icon').textContent = '🔒';
        elements.cookieSyncText.textContent = 'Giriş yapılmadı';
        
        // Giriş yapılmamış - giriş butonunu göster, diğerlerini gizle
        elements.youtubeLoginBtn.style.display = 'inline-block';
        elements.refreshCookiesBtn.style.display = 'none';
        elements.deleteCookieBtn.style.display = 'none';
    }
}

// Check and show login status on startup (for already logged in users)
async function checkAndShowLoginStatus() {
    const status = await window.electronAPI.getCookieStatus();
    
    // If user has cookies, they're logged in
    if (status.hasCookies && status.cookieCount > 0) {
        console.log('YouTube hesabı zaten bağlı, +18 videolar indirilebilir.');
    }
}

// Show success message
function showSuccess(message) {
    // Use error element for now with green styling
    elements.errorMessage.style.display = 'flex';
    elements.errorMessage.style.background = 'rgba(74, 222, 128, 0.1)';
    elements.errorMessage.style.borderColor = '#4ade80';
    elements.errorMessage.querySelector('.error-icon').textContent = '✅';
    elements.errorMessage.querySelector('.error-text').textContent = message;
    elements.errorMessage.querySelector('.error-text').style.color = '#4ade80';
    
    setTimeout(() => {
        hideError();
        // Reset styles
        elements.errorMessage.style.background = '';
        elements.errorMessage.style.borderColor = '';
        elements.errorMessage.querySelector('.error-icon').textContent = '⚠️';
        elements.errorMessage.querySelector('.error-text').style.color = '';
    }, 3000);
}

// Validate URL
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// Show error
function showError(message) {
    elements.errorMessage.style.display = 'flex';
    elements.errorMessage.querySelector('.error-text').textContent = message;
}

// Hide error
function hideError() {
    elements.errorMessage.style.display = 'none';
}

// Fetch video info
async function fetchVideo() {
    const url = elements.urlInput.value.trim();
    
    if (!url) {
        showError('Lütfen bir video URL\'si girin');
        return;
    }
    
    if (!isValidUrl(url)) {
        showError('Geçersiz URL formatı');
        return;
    }
    
    hideError();
    elements.videoSection.style.display = 'none';
    elements.downloadComplete.style.display = 'none';
    
    // Show loading state
    const btnText = elements.fetchBtn.querySelector('.btn-text');
    const btnLoader = elements.fetchBtn.querySelector('.btn-loader');
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline';
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
        showError(error.message || 'Video bilgisi alınamadı');
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        elements.fetchBtn.disabled = false;
    }
}

// Display video info
function displayVideoInfo(info) {
    elements.videoThumbnail.src = info.thumbnail;
    elements.videoTitle.textContent = info.title;
    elements.videoUploader.textContent = info.uploader || 'Bilinmeyen';
    elements.videoViews.textContent = info.viewCount ? formatNumber(info.viewCount) + ' görüntüleme' : '';
    elements.videoDuration.textContent = formatDuration(info.duration);
    
    // Video formats
    elements.videoFormatList.innerHTML = '';
    if (info.formats.video && info.formats.video.length > 0) {
        info.formats.video.forEach(format => {
            const item = createFormatItem(format, false);
            elements.videoFormatList.appendChild(item);
        });
    } else {
        elements.videoFormatList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Video formatı bulunamadı</p>';
    }
    
    // Audio formats
    elements.audioFormatList.innerHTML = '';
    if (info.formats.audio && info.formats.audio.length > 0) {
        info.formats.audio.forEach(format => {
            const item = createFormatItem(format, true);
            elements.audioFormatList.appendChild(item);
        });
    }
    
    // Reset format selection
    selectedFormat = null;
    elements.downloadAction.style.display = 'none';
    
    elements.videoSection.style.display = 'block';
}

// Create format item
function createFormatItem(format, isAudio) {
    const div = document.createElement('div');
    div.className = 'format-item';
    div.dataset.formatId = format.formatId;
    
    if (isAudio) {
        div.innerHTML = `
            <div class="format-info">
                <span class="format-quality">${format.quality || 'Bilinmeyen'}</span>
                <span class="format-details">${format.ext.toUpperCase()}</span>
            </div>
            <span class="format-size">${format.filesize ? formatFileSize(format.filesize) : '~'}</span>
        `;
    } else {
        div.innerHTML = `
            <div class="format-info">
                <span class="format-quality">${format.quality || 'Bilinmeyen'}</span>
                <span class="format-details">${format.description || format.ext.toUpperCase()} • 🔊 Sesli</span>
            </div>
            <span class="format-size">MP4</span>
        `;
    }
    
    div.addEventListener('click', () => selectFormat(format.formatId, isAudio, format.quality, format.ext));
    
    return div;
}

// Select format (without starting download)
function selectFormat(formatId, isAudio, quality, ext) {
    if (isDownloading) return;
    
    // Clear previous selection
    document.querySelectorAll('.format-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Select new format
    if (formatId) {
        const formatItem = document.querySelector(`.format-item[data-format-id="${formatId}"]`);
        if (formatItem) {
            formatItem.classList.add('selected');
        }
    }
    
    // Store selected format
    selectedFormat = { formatId, isAudio, quality, ext };
    
    // Show download action
    elements.downloadAction.style.display = 'block';
    
    // Update selected format info
    if (isAudio && !formatId) {
        elements.selectedFormatInfo.innerHTML = `
            <span>🎵</span>
            <span class="format-label">MP3 (En İyi Kalite)</span>
        `;
    } else if (isAudio) {
        elements.selectedFormatInfo.innerHTML = `
            <span>🎵</span>
            <span class="format-label">${quality || 'Ses'}</span>
            <span>•</span>
            <span>${ext ? ext.toUpperCase() : 'Ses Dosyası'}</span>
        `;
    } else {
        elements.selectedFormatInfo.innerHTML = `
            <span>🎬</span>
            <span class="format-label">${quality || 'Video'}</span>
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
    elements.formatSection.classList.add('disabled');
    elements.startDownloadBtn.disabled = true;
    elements.startDownloadBtn.innerHTML = '⏳ İndiriliyor...';
    
    elements.downloadProgress.style.display = 'block';
    elements.downloadComplete.style.display = 'none';
    elements.downloadProgressBar.style.width = '0%';
    elements.downloadPercent.textContent = '%0';
    elements.downloadStatus.textContent = 'Başlatılıyor...';
    
    try {
        const result = await window.electronAPI.downloadVideo({
            url: currentVideoInfo.url,
            formatId: formatId,
            audioOnly: audioOnly
        });
        
        if (!result.success) {
            showError(result.error);
            elements.downloadProgress.style.display = 'none';
            return;
        }
        
        // Success
        elements.downloadProgress.style.display = 'none';
        elements.downloadComplete.style.display = 'flex';
        
        // Check if video was already downloaded
        const completeIcon = elements.downloadComplete.querySelector('.complete-icon');
        const completeText = elements.downloadComplete.querySelector('.complete-text');
        
        if (result.data && result.data.alreadyDownloaded) {
            completeIcon.textContent = '📁';
            completeText.textContent = 'Bu video zaten indirilmiş!';
        } else {
            completeIcon.textContent = '✅';
            completeText.textContent = 'İndirme tamamlandı!';
        }
        
    } catch (error) {
        showError(error.message || 'İndirme başarısız oldu');
        elements.downloadProgress.style.display = 'none';
    } finally {
        isDownloading = false;
        // Re-enable format section
        elements.formatSection.classList.remove('disabled');
        elements.startDownloadBtn.disabled = false;
        elements.startDownloadBtn.innerHTML = '⬇️ İndir';
    }
}

// Cancel download
async function cancelDownload() {
    await window.electronAPI.cancelDownload();
    elements.downloadProgress.style.display = 'none';
    isDownloading = false;
    // Re-enable format section
    elements.formatSection.classList.remove('disabled');
    elements.startDownloadBtn.disabled = false;
    elements.startDownloadBtn.innerHTML = '⬇️ İndir';
}

// Format helpers
function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
