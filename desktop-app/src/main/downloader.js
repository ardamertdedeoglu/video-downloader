const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');
const { getBinaryPath, getYtdlpEnv } = require('./binary-manager');

let currentProcess = null;

// Get video info using yt-dlp
async function getVideoInfo(url, cookieFile = null) {
    const ytdlpPath = getBinaryPath('yt-dlp');
    const env = getYtdlpEnv(); // Use custom environment with deno in PATH
    
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-download'
        ];
        
        // Use cookie file if available
        if (cookieFile) {
            const fs = require('fs');
            if (fs.existsSync(cookieFile)) {
                args.push('--cookies', cookieFile);
            }
        }
        
        args.push(url);

        const process = spawn(ytdlpPath, args, { env });
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
                    reject(new Error('Bu video yaş doğrulaması gerektiriyor. Lütfen Ayarlar\'dan YouTube\'a giriş yapın.'));
                } else if (stderr.includes('Video unavailable')) {
                    reject(new Error('Video kullanılamıyor veya özel.'));
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
    const { url, formatId, audioOnly, outputPath, cookieFile = null } = options;
    const ytdlpPath = getBinaryPath('yt-dlp');
    const ffmpegPath = getBinaryPath('ffmpeg');
    const env = getYtdlpEnv(); // Use custom environment with deno in PATH
    
    const fs = require('fs');

    // Validate paths
    if (!fs.existsSync(ytdlpPath)) {
        throw new Error(`yt-dlp bulunamadı: ${ytdlpPath}`);
    }
    if (!fs.existsSync(ffmpegPath)) {
        throw new Error(`ffmpeg bulunamadı: ${ffmpegPath}`);
    }
    if (!outputPath) {
        throw new Error('İndirme klasörü belirtilmedi');
    }

    return new Promise((resolve, reject) => {
        const args = [];
        
        // Use cookie file if available
        if (cookieFile && fs.existsSync(cookieFile)) {
            args.push('--cookies', cookieFile);
        }
        
        args.push(
            '--ffmpeg-location', path.dirname(ffmpegPath),
            '--newline',
            '--progress',
            '-o', path.join(outputPath, '%(title)s.%(ext)s')
        );

        if (audioOnly) {
            args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
        } else if (formatId && formatId !== 'best') {
            // Use the format selector which includes video+audio
            args.push('-f', formatId);
            args.push('--merge-output-format', 'mp4');
            // Re-encode audio to AAC for compatibility
            args.push('--postprocessor-args', 'ffmpeg:-c:v copy -c:a aac -b:a 192k');
        } else {
            // Best quality with audio
            args.push('-f', 'bv*+ba/b');
            args.push('--merge-output-format', 'mp4');
            args.push('--postprocessor-args', 'ffmpeg:-c:v copy -c:a aac -b:a 192k');
        }

        args.push(url);

        console.log('yt-dlp command:', ytdlpPath, args.join(' '));

        currentProcess = spawn(ytdlpPath, args, { env });
        let lastFilename = '';
        let stderrOutput = '';
        let stdoutOutput = '';

        currentProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdoutOutput += output;
            console.log('yt-dlp stdout:', output);
            
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
            
            // Also check for "has already been downloaded"
            const alreadyMatch = output.match(/\[download\] (.+) has already been downloaded/);
            if (alreadyMatch) {
                lastFilename = alreadyMatch[1];
            }

            // Merging status
            if (output.includes('[Merger]') || output.includes('[ffmpeg]')) {
                onProgress({ percent: 100, status: 'processing' });
            }
        });

        currentProcess.stderr.on('data', (data) => {
            stderrOutput += data.toString();
            console.error('yt-dlp stderr:', data.toString());
        });

        currentProcess.on('close', (code) => {
            currentProcess = null;
            console.log('yt-dlp exit code:', code);
            console.log('Full stdout:', stdoutOutput);
            console.log('Full stderr:', stderrOutput);
            
            if (code === 0) {
                // Check if video was already downloaded
                const alreadyDownloaded = stdoutOutput.includes('has already been downloaded');
                resolve({ success: true, filename: lastFilename, alreadyDownloaded });
            } else if (code === null) {
                reject(new Error('İndirme iptal edildi'));
            } else {
                // Provide more detailed error
                let errorMsg = 'İndirme başarısız oldu';
                if (stderrOutput.includes('Sign in to confirm your age')) {
                    errorMsg = 'Bu video yaş doğrulaması gerektiriyor. Lütfen YouTube\'a giriş yapın.';
                } else if (stderrOutput.includes('Video unavailable')) {
                    errorMsg = 'Video kullanılamıyor veya özel.';
                } else if (stderrOutput.includes('Unsupported URL')) {
                    errorMsg = 'Desteklenmeyen URL formatı.';
                } else if (stderrOutput) {
                    errorMsg = stderrOutput.split('\n')[0] || errorMsg;
                }
                reject(new Error(errorMsg));
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
