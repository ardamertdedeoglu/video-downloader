const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

// Binary paths based on OS
const BINARIES_DIR = app.isPackaged 
    ? path.join(process.resourcesPath, 'binaries')
    : path.join(__dirname, '../../binaries');

const PLATFORM = process.platform; // 'win32', 'darwin', 'linux'

// Binary download URLs (latest releases)
const BINARY_URLS = {
    win32: {
        'yt-dlp': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
        'ffmpeg': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
        'deno': 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip'
    },
    darwin: {
        'yt-dlp': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
        'ffmpeg': 'https://evermeet.cx/ffmpeg/getrelease/zip',
        'deno': 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-apple-darwin.zip'
    },
    linux: {
        'yt-dlp': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
        'ffmpeg': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
        'deno': 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip'
    }
};

// Get binary executable names
function getBinaryName(name) {
    if (PLATFORM === 'win32') {
        if (name === 'yt-dlp') return 'yt-dlp.exe';
        if (name === 'ffmpeg') return 'ffmpeg.exe';
        if (name === 'deno') return 'deno.exe';
    }
    return name;
}

// Get full binary path
function getBinaryPath(name) {
    return path.join(BINARIES_DIR, getBinaryName(name));
}

// Check if binaries exist
async function checkBinariesStatus() {
    const ytdlpPath = getBinaryPath('yt-dlp');
    const ffmpegPath = getBinaryPath('ffmpeg');
    const denoPath = getBinaryPath('deno');

    const ytdlpExists = fs.existsSync(ytdlpPath);
    const ffmpegExists = fs.existsSync(ffmpegPath);
    const denoExists = fs.existsSync(denoPath);

    let ytdlpVersion = null;
    let ffmpegVersion = null;
    let denoVersion = null;

    if (ytdlpExists) {
        try {
            ytdlpVersion = execSync(`"${ytdlpPath}" --version`, { encoding: 'utf8' }).trim();
        } catch (e) {
            // Binary might be corrupted
        }
    }

    if (ffmpegExists) {
        try {
            const output = execSync(`"${ffmpegPath}" -version`, { encoding: 'utf8' });
            const match = output.match(/ffmpeg version (\S+)/);
            ffmpegVersion = match ? match[1] : 'unknown';
        } catch (e) {
            // Binary might be corrupted
        }
    }

    if (denoExists) {
        try {
            const output = execSync(`"${denoPath}" --version`, { encoding: 'utf8' });
            const match = output.match(/deno (\S+)/);
            denoVersion = match ? match[1] : 'unknown';
        } catch (e) {
            // Binary might be corrupted
        }
    }

    return {
        ytdlp: { exists: ytdlpExists, version: ytdlpVersion },
        ffmpeg: { exists: ffmpegExists, version: ffmpegVersion },
        deno: { exists: denoExists, version: denoVersion },
        ready: ytdlpExists && ffmpegExists && denoExists && ytdlpVersion && ffmpegVersion && denoVersion
    };
}

// Get latest yt-dlp version from GitHub
async function getLatestYtdlpVersion() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/yt-dlp/yt-dlp/releases/latest',
            headers: { 'User-Agent': 'video-downloader-app' }
        };
        
        https.get(options, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    resolve(release.tag_name || null);
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

// Check if yt-dlp needs update
async function checkYtdlpUpdate() {
    const status = await checkBinariesStatus();
    if (!status.ytdlp.exists || !status.ytdlp.version) {
        return { needsUpdate: true, currentVersion: null, latestVersion: null };
    }
    
    const latestVersion = await getLatestYtdlpVersion();
    if (!latestVersion) {
        return { needsUpdate: false, currentVersion: status.ytdlp.version, latestVersion: null };
    }
    
    // Compare versions (yt-dlp uses date-based versioning like 2024.12.03)
    const current = status.ytdlp.version.replace(/\./g, '');
    const latest = latestVersion.replace(/\./g, '');
    
    return {
        needsUpdate: latest > current,
        currentVersion: status.ytdlp.version,
        latestVersion: latestVersion
    };
}

// Update only yt-dlp
async function updateYtdlp(onProgress) {
    // Ensure binaries directory exists
    if (!fs.existsSync(BINARIES_DIR)) {
        fs.mkdirSync(BINARIES_DIR, { recursive: true });
    }
    
    const ytdlpPath = getBinaryPath('yt-dlp');
    
    // Delete old version if exists
    if (fs.existsSync(ytdlpPath)) {
        fs.unlinkSync(ytdlpPath);
    }
    
    // Download latest
    onProgress({ step: 'yt-dlp', percent: 0, status: 'downloading' });
    await downloadFile(
        BINARY_URLS[PLATFORM]['yt-dlp'],
        ytdlpPath,
        (percent) => onProgress({ step: 'yt-dlp', percent, status: 'downloading' })
    );
    
    // Make executable on Unix
    if (PLATFORM !== 'win32') {
        fs.chmodSync(ytdlpPath, '755');
    }
    
    onProgress({ step: 'yt-dlp', percent: 100, status: 'complete' });
    
    // Return new version
    try {
        const newVersion = execSync(`"${ytdlpPath}" --version`, { encoding: 'utf8' }).trim();
        return { success: true, version: newVersion };
    } catch (e) {
        return { success: true, version: 'unknown' };
    }
}

// Check and download binaries if needed (called on first run)
async function checkAndDownloadBinaries(mainWindow, store) {
    const status = await checkBinariesStatus();
    
    if (status.ready) {
        store.set('binariesDownloaded', true);
        mainWindow.webContents.send('binaries-ready');
        return;
    }

    mainWindow.webContents.send('binaries-download-start');
    
    try {
        await downloadBinaries((progress) => {
            mainWindow.webContents.send('binaries-progress', progress);
        });
        
        store.set('binariesDownloaded', true);
        mainWindow.webContents.send('binaries-ready');
    } catch (error) {
        mainWindow.webContents.send('binaries-error', error.message);
    }
}

// Download all binaries
async function downloadBinaries(onProgress) {
    // Ensure binaries directory exists
    if (!fs.existsSync(BINARIES_DIR)) {
        fs.mkdirSync(BINARIES_DIR, { recursive: true });
    }

    // Download yt-dlp
    onProgress({ step: 'yt-dlp', percent: 0, status: 'downloading' });
    await downloadFile(
        BINARY_URLS[PLATFORM]['yt-dlp'],
        getBinaryPath('yt-dlp'),
        (percent) => onProgress({ step: 'yt-dlp', percent, status: 'downloading' })
    );
    
    // Make executable on Unix
    if (PLATFORM !== 'win32') {
        fs.chmodSync(getBinaryPath('yt-dlp'), '755');
    }
    onProgress({ step: 'yt-dlp', percent: 100, status: 'complete' });

    // Download ffmpeg (archive)
    onProgress({ step: 'ffmpeg', percent: 0, status: 'downloading' });
    
    const ffmpegUrl = BINARY_URLS[PLATFORM]['ffmpeg'];
    const isZip = ffmpegUrl.endsWith('.zip');
    const isTarXz = ffmpegUrl.endsWith('.tar.xz');
    
    const archivePath = path.join(BINARIES_DIR, isZip ? 'ffmpeg.zip' : 'ffmpeg.tar.xz');
    
    await downloadFile(
        ffmpegUrl,
        archivePath,
        (percent) => onProgress({ step: 'ffmpeg', percent: percent * 0.8, status: 'downloading' })
    );

    onProgress({ step: 'ffmpeg', percent: 80, status: 'extracting' });
    
    // Extract ffmpeg
    await extractFfmpeg(archivePath, BINARIES_DIR);
    
    // Cleanup archive
    fs.unlinkSync(archivePath);
    
    onProgress({ step: 'ffmpeg', percent: 100, status: 'complete' });

    // Download Deno (JavaScript runtime for yt-dlp)
    onProgress({ step: 'deno', percent: 0, status: 'downloading' });
    
    const denoUrl = BINARY_URLS[PLATFORM]['deno'];
    const denoArchivePath = path.join(BINARIES_DIR, 'deno.zip');
    
    await downloadFile(
        denoUrl,
        denoArchivePath,
        (percent) => onProgress({ step: 'deno', percent: percent * 0.9, status: 'downloading' })
    );

    onProgress({ step: 'deno', percent: 90, status: 'extracting' });
    
    // Extract deno
    await extractDeno(denoArchivePath, BINARIES_DIR);
    
    // Cleanup archive
    fs.unlinkSync(denoArchivePath);
    
    onProgress({ step: 'deno', percent: 100, status: 'complete' });
}

// Download a file with progress
function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        
        const request = https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(destPath);
                downloadFile(response.headers.location, destPath, onProgress)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                reject(new Error(`Download failed: ${response.statusCode}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize) {
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    onProgress(percent);
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        });

        request.on('error', (error) => {
            file.close();
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
            reject(error);
        });

        file.on('error', (error) => {
            file.close();
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
            reject(error);
        });
    });
}

// Extract ffmpeg from archive
async function extractFfmpeg(archivePath, destDir) {
    const AdmZip = require('adm-zip');
    
    if (archivePath.endsWith('.zip')) {
        const zip = new AdmZip(archivePath);
        const entries = zip.getEntries();
        
        // Find ffmpeg binary in archive
        for (const entry of entries) {
            const name = entry.entryName.toLowerCase();
            if (name.endsWith('ffmpeg.exe') || (name.endsWith('ffmpeg') && !name.includes('.'))) {
                const targetPath = path.join(destDir, PLATFORM === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
                fs.writeFileSync(targetPath, entry.getData());
                
                if (PLATFORM !== 'win32') {
                    fs.chmodSync(targetPath, '755');
                }
                return;
            }
        }
        throw new Error('ffmpeg not found in archive');
        
    } else if (archivePath.endsWith('.tar.xz')) {
        // For tar.xz, we need to use command line
        const { execSync } = require('child_process');
        
        try {
            execSync(`tar -xf "${archivePath}" -C "${destDir}"`, { stdio: 'ignore' });
            
            // Find and move ffmpeg binary
            const extractedDirs = fs.readdirSync(destDir).filter(f => 
                f.startsWith('ffmpeg-') && fs.statSync(path.join(destDir, f)).isDirectory()
            );
            
            if (extractedDirs.length > 0) {
                const ffmpegSrc = path.join(destDir, extractedDirs[0], 'bin', 'ffmpeg');
                const ffmpegDest = path.join(destDir, 'ffmpeg');
                
                if (fs.existsSync(ffmpegSrc)) {
                    fs.copyFileSync(ffmpegSrc, ffmpegDest);
                    fs.chmodSync(ffmpegDest, '755');
                    
                    // Cleanup extracted folder
                    fs.rmSync(path.join(destDir, extractedDirs[0]), { recursive: true });
                }
            }
        } catch (e) {
            throw new Error('Failed to extract ffmpeg: ' + e.message);
        }
    }
}

// Extract deno from archive
async function extractDeno(archivePath, destDir) {
    const AdmZip = require('adm-zip');
    
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries();
    
    // Find deno binary in archive
    for (const entry of entries) {
        const name = entry.entryName.toLowerCase();
        if (name === 'deno.exe' || name === 'deno') {
            const targetPath = path.join(destDir, PLATFORM === 'win32' ? 'deno.exe' : 'deno');
            fs.writeFileSync(targetPath, entry.getData());
            
            if (PLATFORM !== 'win32') {
                fs.chmodSync(targetPath, '755');
            }
            return;
        }
    }
    throw new Error('deno not found in archive');
}

// Get environment variables for running yt-dlp with our binaries
function getYtdlpEnv() {
    const env = { ...process.env };
    
    // Add our binaries directory to PATH so yt-dlp can find deno and ffmpeg
    const currentPath = env.PATH || env.Path || '';
    env.PATH = BINARIES_DIR + (PLATFORM === 'win32' ? ';' : ':') + currentPath;
    
    return env;
}

module.exports = { 
    getBinaryPath, 
    checkBinariesStatus, 
    checkAndDownloadBinaries, 
    downloadBinaries,
    checkYtdlpUpdate,
    updateYtdlp,
    getYtdlpEnv,
    BINARIES_DIR
};
