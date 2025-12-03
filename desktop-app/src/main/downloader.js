const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');
const { getBinaryPath } = require('./binary-manager');

let currentProcess = null;

// Get video info using yt-dlp
async function getVideoInfo(url, browser = 'chrome', useCookies = true, cookieFile = null) {
    const ytdlpPath = getBinaryPath('yt-dlp');
    
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-download'
        ];
        
        // Priority: 1. Cookie file from website, 2. Browser cookies
        if (cookieFile) {
            args.push('--cookies', cookieFile);
        } else if (useCookies && browser && browser !== 'none') {
            args.push('--cookies-from-browser', browser);
        }
        
        args.push(url);

        const process = spawn(ytdlpPath, args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                try {
                    const info = JSON.parse(stdout);
                    resolve({
                        id: info.id,
                        title: info.title,
                        thumbnail: info.thumbnail,
                        duration: info.duration,
                        uploader: info.uploader,
                        viewCount: info.view_count,
                        uploadDate: info.upload_date,
                        description: info.description,
                        formats: parseFormats(info.formats),
                        url: url
                    });
                } catch (e) {
                    reject(new Error('Video bilgisi ayrıştırılamadı'));
                }
            } else {
                // Check for common errors
                if (stderr.includes('Sign in to confirm your age')) {
                    reject(new Error('Bu video yaş doğrulaması gerektiriyor. Lütfen tarayıcınızda YouTube\'a giriş yaptığınızdan emin olun.'));
                } else if (stderr.includes('Video unavailable')) {
                    reject(new Error('Video kullanılamıyor veya özel.'));
                } else if (stderr.includes('Could not copy') && stderr.includes('cookie database')) {
                    reject(new Error('Tarayıcı çerezlerine erişilemiyor. Lütfen ' + browser.toUpperCase() + ' tarayıcısını kapatıp tekrar deneyin, veya Ayarlar\'dan farklı bir tarayıcı seçin.'));
                } else if (stderr.includes('cookies')) {
                    reject(new Error('Çerezler okunamadı. Lütfen seçili tarayıcının kurulu olduğundan emin olun.'));
                } else {
                    reject(new Error(stderr || 'Video bilgisi alınamadı'));
                }
            }
        });

        process.on('error', (error) => {
            reject(new Error(`yt-dlp çalıştırılamadı: ${error.message}`));
        });
    });
}

// Parse formats into a cleaner structure
function parseFormats(formats) {
    if (!formats) return [];

    const audioFormats = [];

    for (const f of formats) {
        if (f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')) {
            // Audio only
            audioFormats.push({
                formatId: f.format_id,
                ext: f.ext,
                quality: f.abr ? `${f.abr}kbps` : f.format_note,
                filesize: f.filesize || f.filesize_approx,
                hasAudio: true,
                hasVideo: false,
                acodec: f.acodec
            });
        }
    }

    audioFormats.sort((a, b) => {
        const aBitrate = parseInt(a.quality) || 0;
        const bBitrate = parseInt(b.quality) || 0;
        return bBitrate - aBitrate;
    });

    // Standard quality presets (video + audio combined)
    const videoFormats = [
        { formatId: 'best', quality: 'En İyi Kalite', ext: 'mp4', hasAudio: true, hasVideo: true, description: 'Otomatik en iyi' },
        { formatId: 'bv*[height<=2160]+ba/b[height<=2160]', quality: '4K (2160p)', ext: 'mp4', hasAudio: true, hasVideo: true, description: '4K Ultra HD' },
        { formatId: 'bv*[height<=1440]+ba/b[height<=1440]', quality: '2K (1440p)', ext: 'mp4', hasAudio: true, hasVideo: true, description: '2K QHD' },
        { formatId: 'bv*[height<=1080]+ba/b[height<=1080]', quality: '1080p', ext: 'mp4', hasAudio: true, hasVideo: true, description: 'Full HD' },
        { formatId: 'bv*[height<=720]+ba/b[height<=720]', quality: '720p', ext: 'mp4', hasAudio: true, hasVideo: true, description: 'HD' },
        { formatId: 'bv*[height<=480]+ba/b[height<=480]', quality: '480p', ext: 'mp4', hasAudio: true, hasVideo: true, description: 'SD' },
        { formatId: 'bv*[height<=360]+ba/b[height<=360]', quality: '360p', ext: 'mp4', hasAudio: true, hasVideo: true, description: 'Düşük' },
    ];

    return {
        video: videoFormats,
        audio: audioFormats.slice(0, 5)   // Top 5 audio formats
    };
}

// Download video
async function downloadVideo(options, onProgress) {
    const { url, formatId, audioOnly, browser, outputPath, useCookies = true, cookieFile = null } = options;
    const ytdlpPath = getBinaryPath('yt-dlp');
    const ffmpegPath = getBinaryPath('ffmpeg');

    return new Promise((resolve, reject) => {
        const args = [];
        
        // Priority: 1. Cookie file from website, 2. Browser cookies
        if (cookieFile) {
            args.push('--cookies', cookieFile);
        } else if (useCookies && browser && browser !== 'none') {
            args.push('--cookies-from-browser', browser);
        }
        
        args.push(
            '--ffmpeg-location', path.dirname(ffmpegPath),
            '--newline',
            '--progress',
            '-o', path.join(outputPath, '%(title)s.%(ext)s'),
            // Re-encode audio to AAC for compatibility (Opus not supported by many players)
            '--postprocessor-args', 'ffmpeg:-c:v copy -c:a aac -b:a 192k'
        );

        if (audioOnly) {
            args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
        } else if (formatId && formatId !== 'best') {
            // Use the format selector which includes video+audio
            args.push('-f', formatId);
            args.push('--merge-output-format', 'mp4');
        } else {
            // Best quality with audio
            args.push('-f', 'bv*+ba/b');
            args.push('--merge-output-format', 'mp4');
        }

        args.push(url);

        currentProcess = spawn(ytdlpPath, args);
        let lastFilename = '';

        currentProcess.stdout.on('data', (data) => {
            const output = data.toString();
            
            // Parse progress
            const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
            if (progressMatch) {
                const percent = parseFloat(progressMatch[1]);
                onProgress({ percent, status: 'downloading' });
            }

            // Parse filename
            const filenameMatch = output.match(/\[download\] Destination: (.+)/);
            if (filenameMatch) {
                lastFilename = filenameMatch[1];
            }

            // Merging status
            if (output.includes('[Merger]') || output.includes('[ffmpeg]')) {
                onProgress({ percent: 100, status: 'processing' });
            }
        });

        currentProcess.stderr.on('data', (data) => {
            console.error('yt-dlp stderr:', data.toString());
        });

        currentProcess.on('close', (code) => {
            currentProcess = null;
            if (code === 0) {
                resolve({ success: true, filename: lastFilename });
            } else if (code === null) {
                reject(new Error('İndirme iptal edildi'));
            } else {
                reject(new Error('İndirme başarısız oldu'));
            }
        });

        currentProcess.on('error', (error) => {
            currentProcess = null;
            reject(new Error(`İndirme hatası: ${error.message}`));
        });
    });
}

// Cancel current download
function cancelDownload() {
    if (currentProcess) {
        currentProcess.kill('SIGTERM');
        currentProcess = null;
    }
}

module.exports = { getVideoInfo, downloadVideo, cancelDownload };
