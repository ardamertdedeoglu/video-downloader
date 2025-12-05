const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { getBinaryPath } = require("./binary-manager");

// Conversion presets
const PRESETS = {
  fast: {
    video: { crf: 28, preset: "ultrafast" },
    audio: { bitrate: "128k" },
  },
  balanced: {
    video: { crf: 23, preset: "medium" },
    audio: { bitrate: "192k" },
  },
  quality: {
    video: { crf: 18, preset: "slow" },
    audio: { bitrate: "320k" },
  },
};

// Format configurations
const FORMAT_CONFIG = {
  // Video formats
  mp4: { type: "video", codec: "libx264", ext: "mp4" },
  mkv: { type: "video", codec: "libx264", ext: "mkv" },
  webm: { type: "video", codec: "libvpx-vp9", ext: "webm" },
  avi: { type: "video", codec: "libx264", ext: "avi" },
  mov: { type: "video", codec: "libx264", ext: "mov" },
  // Audio formats
  mp3: { type: "audio", codec: "libmp3lame", ext: "mp3" },
  aac: { type: "audio", codec: "aac", ext: "aac" },
  wav: { type: "audio", codec: "pcm_s16le", ext: "wav" },
  flac: { type: "audio", codec: "flac", ext: "flac" },
  ogg: { type: "audio", codec: "libvorbis", ext: "ogg" },
};

// Active conversion process
let activeProcess = null;
let isCancelled = false;

/**
 * Get file info using ffmpeg -i
 * @param {string} filePath - Path to the file
 * @returns {Promise<object>} File metadata
 */
async function getFileInfo(filePath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getBinaryPath("ffmpeg");

    if (!fs.existsSync(filePath)) {
      reject(new Error("Dosya bulunamadı"));
      return;
    }

    const args = ["-i", filePath, "-hide_banner"];
    const process = spawn(ffmpegPath, args);

    let stderr = "";

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      // ffmpeg -i always returns non-zero when not actually converting
      // Parse the stderr for metadata
      try {
        const info = parseFFmpegOutput(stderr, filePath);
        resolve(info);
      } catch (error) {
        reject(error);
      }
    });

    process.on("error", (error) => {
      reject(new Error(`FFmpeg başlatılamadı: ${error.message}`));
    });
  });
}

/**
 * Parse ffmpeg -i output for metadata
 * @param {string} output - ffmpeg stderr output
 * @param {string} filePath - Original file path
 * @returns {object} Parsed metadata
 */
function parseFFmpegOutput(output, filePath) {
  const info = {
    path: filePath,
    filename: path.basename(filePath),
    size: 0,
    duration: 0,
    durationFormatted: "00:00:00",
    type: "unknown",
    video: null,
    audio: null,
  };

  // Get file size
  try {
    const stats = fs.statSync(filePath);
    info.size = stats.size;
  } catch (e) {}

  // Parse duration: Duration: 00:03:45.67
  const durationMatch = output.match(
    /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/
  );
  if (durationMatch) {
    const hours = parseInt(durationMatch[1]);
    const minutes = parseInt(durationMatch[2]);
    const seconds = parseInt(durationMatch[3]);
    info.duration = hours * 3600 + minutes * 60 + seconds;
    info.durationFormatted = `${durationMatch[1]}:${durationMatch[2]}:${durationMatch[3]}`;
  }

  // Parse video stream: Video: h264 (High), 1920x1080
  const videoMatch = output.match(
    /Stream\s+#\d+:\d+.*Video:\s+(\w+).*?,\s*(\d+)x(\d+)/
  );
  if (videoMatch) {
    info.video = {
      codec: videoMatch[1],
      width: parseInt(videoMatch[2]),
      height: parseInt(videoMatch[3]),
      resolution: `${videoMatch[2]}x${videoMatch[3]}`,
    };
    info.type = "video";
  }

  // Parse audio stream: Audio: aac (LC), 48000 Hz, stereo
  const audioMatch = output.match(
    /Stream\s+#\d+:\d+.*Audio:\s+(\w+).*?,\s*(\d+)\s*Hz/
  );
  if (audioMatch) {
    info.audio = {
      codec: audioMatch[1],
      sampleRate: parseInt(audioMatch[2]),
    };
    if (!info.video) {
      info.type = "audio";
    }
  }

  // Parse bitrate: bitrate: 1234 kb/s
  const bitrateMatch = output.match(/bitrate:\s*(\d+)\s*kb\/s/);
  if (bitrateMatch) {
    info.bitrate = parseInt(bitrateMatch[1]);
  }

  return info;
}

/**
 * Generate output path with _converted suffix and auto-numbering
 * @param {string} inputPath - Input file path
 * @param {string} targetFormat - Target format extension
 * @returns {string} Output file path
 */
function generateOutputPath(inputPath, targetFormat) {
  const dir = path.dirname(inputPath);
  const name = path.basename(inputPath, path.extname(inputPath));

  let outputPath = path.join(dir, `${name}_converted.${targetFormat}`);
  let counter = 2;

  while (fs.existsSync(outputPath)) {
    outputPath = path.join(dir, `${name}_converted_${counter}.${targetFormat}`);
    counter++;
  }

  return outputPath;
}

/**
 * Convert a single file
 * @param {object} options - Conversion options
 * @param {function} onProgress - Progress callback
 * @returns {Promise<object>} Conversion result
 */
async function convertFile(options, onProgress) {
  const { inputPath, outputFormat, preset = "balanced" } = options;

  return new Promise((resolve, reject) => {
    isCancelled = false;

    const ffmpegPath = getBinaryPath("ffmpeg");
    const formatConfig = FORMAT_CONFIG[outputFormat];
    const presetConfig = PRESETS[preset];

    if (!formatConfig) {
      reject(new Error(`Desteklenmeyen format: ${outputFormat}`));
      return;
    }

    const outputPath = generateOutputPath(inputPath, formatConfig.ext);

    // Build ffmpeg arguments
    const args = [
      "-i",
      inputPath,
      "-y", // Overwrite output
      "-progress",
      "pipe:1", // Progress to stdout
      "-nostats",
    ];

    if (formatConfig.type === "video") {
      // Video conversion
      args.push(
        "-c:v",
        formatConfig.codec,
        "-crf",
        presetConfig.video.crf.toString(),
        "-preset",
        presetConfig.video.preset,
        "-c:a",
        "aac",
        "-b:a",
        presetConfig.audio.bitrate
      );

      // Special handling for webm
      if (outputFormat === "webm") {
        args.splice(args.indexOf("-crf"), 2); // Remove CRF for VP9
        args.push("-b:v", "2M"); // Use bitrate instead
      }
    } else {
      // Audio conversion
      args.push(
        "-vn", // No video
        "-c:a",
        formatConfig.codec,
        "-b:a",
        presetConfig.audio.bitrate
      );

      // WAV and FLAC don't use bitrate
      if (outputFormat === "wav" || outputFormat === "flac") {
        const bitrateIndex = args.indexOf("-b:a");
        if (bitrateIndex > -1) {
          args.splice(bitrateIndex, 2);
        }
      }
    }

    args.push(outputPath);

    console.log("FFmpeg command:", ffmpegPath, args.join(" "));

    activeProcess = spawn(ffmpegPath, args);

    let duration = 0;

    // Get duration first from input file
    getFileInfo(inputPath)
      .then((info) => {
        duration = info.duration;
      })
      .catch(() => {});

    activeProcess.stdout.on("data", (data) => {
      const output = data.toString();

      // Parse progress: out_time_ms=12345678
      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch && duration > 0) {
        const currentMs = parseInt(timeMatch[1]);
        const currentSec = currentMs / 1000000;
        const percent = Math.min(99, Math.round((currentSec / duration) * 100));

        if (onProgress) {
          onProgress({
            percent,
            currentTime: currentSec,
            totalTime: duration,
          });
        }
      }
    });

    activeProcess.stderr.on("data", (data) => {
      // FFmpeg outputs to stderr, but we can ignore most of it
      // Could be used for debugging if needed
    });

    activeProcess.on("close", (code) => {
      activeProcess = null;

      if (isCancelled) {
        // Clean up partial file
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(new Error("İptal edildi"));
        return;
      }

      if (code === 0) {
        if (onProgress) {
          onProgress({
            percent: 100,
            currentTime: duration,
            totalTime: duration,
          });
        }
        resolve({
          success: true,
          inputPath,
          outputPath,
          outputFormat,
        });
      } else {
        reject(new Error(`Dönüştürme başarısız (kod: ${code})`));
      }
    });

    activeProcess.on("error", (error) => {
      activeProcess = null;
      reject(new Error(`FFmpeg hatası: ${error.message}`));
    });
  });
}

/**
 * Convert multiple files in batch
 * @param {Array} files - Array of file paths
 * @param {object} options - Conversion options
 * @param {function} onProgress - Overall progress callback
 * @param {function} onFileComplete - Per-file completion callback
 * @returns {Promise<object>} Batch result summary
 */
async function convertBatch(files, options, onProgress, onFileComplete) {
  const results = {
    success: [],
    failed: [],
  };

  isCancelled = false;
  const totalFiles = files.length;

  for (let i = 0; i < files.length; i++) {
    if (isCancelled) {
      break;
    }

    const filePath = files[i];
    const fileIndex = i + 1;

    try {
      const result = await convertFile(
        { ...options, inputPath: filePath },
        (progress) => {
          if (onProgress) {
            onProgress({
              fileIndex,
              totalFiles,
              fileName: path.basename(filePath),
              fileProgress: progress.percent,
              overallProgress: Math.round(
                ((i + progress.percent / 100) / totalFiles) * 100
              ),
            });
          }
        }
      );

      results.success.push(result);

      if (onFileComplete) {
        onFileComplete({
          fileIndex,
          totalFiles,
          file: filePath,
          success: true,
          result,
        });
      }
    } catch (error) {
      results.failed.push({
        file: filePath,
        fileName: path.basename(filePath),
        error: error.message,
      });

      if (onFileComplete) {
        onFileComplete({
          fileIndex,
          totalFiles,
          file: filePath,
          success: false,
          error: error.message,
        });
      }
    }
  }

  return results;
}

/**
 * Cancel the current conversion
 */
function cancelConversion() {
  isCancelled = true;

  if (activeProcess) {
    activeProcess.kill("SIGTERM");
    activeProcess = null;
  }
}

/**
 * Format file size to human readable
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Get supported formats based on file type
 * @param {string} fileType - 'video' or 'audio'
 * @returns {Array} Array of format objects
 */
function getSupportedFormats(fileType) {
  return Object.entries(FORMAT_CONFIG)
    .filter(([_, config]) => config.type === fileType)
    .map(([format, config]) => ({
      format,
      ...config,
    }));
}

module.exports = {
  getFileInfo,
  generateOutputPath,
  convertFile,
  convertBatch,
  cancelConversion,
  formatFileSize,
  getSupportedFormats,
  PRESETS,
  FORMAT_CONFIG,
};
