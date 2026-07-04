import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import crypto from 'crypto';

const THUMBNAIL_DIR = path.resolve(process.env.THUMBNAIL_DIR || './data/thumbnails');

// 确保目录存在
if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

const PREVIEW_DIR = path.resolve(process.env.PREVIEW_DIR || './data/previews');

if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

function isMp4Like(mimeType: string, filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return mimeType === 'video/mp4' || lower.endsWith('.mp4') || lower.endsWith('.m4v') || lower.endsWith('.mov');
}

function ffmpegRun(command: ffmpeg.FfmpegCommand, label: string): Promise<void> {
    return new Promise((resolve, reject) => {
        command
            .on('start', (cmd) => console.log(`[Preview] ${label} CMD: ${cmd}`))
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
    });
}

export async function generateMediaPreview(filePath: string, storedName: string, mimeType: string): Promise<string | null> {
    const absFilePath = path.resolve(filePath);
    if (!fs.existsSync(absFilePath)) return null;

    try {
        if (mimeType.startsWith('image/') && mimeType !== 'image/gif') {
            const previewName = `preview_${crypto.randomUUID()}.webp`;
            const previewPath = path.join(PREVIEW_DIR, previewName);
            await sharp(absFilePath)
                .rotate()
                .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 86, effort: 4 })
                .toFile(previewPath);
            console.log(`[Preview] ✅ Image preview created: ${previewName}`);
            return previewPath;
        }

        if (mimeType.startsWith('video/')) {
            const previewName = `preview_${crypto.randomUUID()}.mp4`;
            const previewPath = path.join(PREVIEW_DIR, previewName);
            const mp4Like = isMp4Like(mimeType, storedName || absFilePath);

            if (mp4Like) {
                try {
                    await ffmpegRun(
                        ffmpeg(absFilePath)
                            .outputOptions(['-c copy', '-movflags +faststart'])
                            .output(previewPath),
                        'Video faststart'
                    );
                    if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
                        console.log(`[Preview] ✅ Video faststart preview created: ${previewName}`);
                        return previewPath;
                    }
                } catch (copyError: any) {
                    console.warn(`[Preview] ⚠️ Faststart copy failed, fallback to transcode: ${copyError.message}`);
                    try { if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath); } catch { }
                }
            }

            await ffmpegRun(
                ffmpeg(absFilePath)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .size('?x720')
                    .outputOptions([
                        '-preset veryfast',
                        '-crf 23',
                        '-movflags +faststart',
                        '-pix_fmt yuv420p',
                        '-profile:v baseline',
                        '-level 3.1',
                        '-b:a 128k',
                    ])
                    .output(previewPath),
                'Video transcode'
            );

            if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
                console.log(`[Preview] ✅ Video transcoded preview created: ${previewName}`);
                return previewPath;
            }
        }
    } catch (error: any) {
        console.error(`[Preview] ❌ Generate preview failed for ${storedName}:`, error.message);
    }

    return null;
}

/**
 * 为图片或视频生成缩略图
 * @returns 返回生成的缩略图绝对路径，失败返回 null
 */
export async function generateThumbnail(filePath: string, storedName: string, mimeType: string): Promise<string | null> {
    const absFilePath = path.resolve(filePath);
    const thumbName = `thumb_${crypto.randomUUID()}.webp`;
    const thumbPath = path.join(THUMBNAIL_DIR, thumbName);

    console.log(`[Thumbnail] 🚀 Starting generation for: ${storedName}`);
    console.log(`[Thumbnail] Source: ${absFilePath}`);
    console.log(`[Thumbnail] Target: ${thumbPath}`);
    console.log(`[Thumbnail] MIME: ${mimeType}`);

    if (!fs.existsSync(absFilePath)) {
        console.error(`[Thumbnail] ❌ Source file does not exist: ${absFilePath}`);
        return null;
    }

    // 对于 GIF 文件，不生成静态缩略图，以便在前端利用原始文件实现动图预览
    if (mimeType === 'image/gif') {
        console.log(`[Thumbnail] ⏩ Skipping GIF to preserve animation`);
        return null;
    }

    try {
        if (mimeType.startsWith('image/')) {
            console.log(`[Thumbnail] 🖼️  Processing image with Sharp...`);
            await sharp(absFilePath)
                .resize(400, 300, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(thumbPath);
            console.log(`[Thumbnail] ✅ Image thumbnail created: ${thumbName}`);
            return thumbPath;
        } else if (mimeType.startsWith('video/')) {
            console.log(`[Thumbnail] 🎬 Processing video with Ffmpeg...`);

            // 内部辅助函数：尝试特定时间截屏
            const tryScreenshot = (timestamp: string): Promise<boolean> => {
                return new Promise((resolve) => {
                    console.log(`[Thumbnail] 📸 Attempting screenshot at ${timestamp}`);
                    ffmpeg(absFilePath)
                        .screenshots({
                            count: 1,
                            folder: THUMBNAIL_DIR,
                            filename: thumbName,
                            size: '400x300',
                            timestamps: [timestamp],
                        })
                        .on('start', (cmd) => console.log(`[Thumbnail] FFmpeg CMD: ${cmd}`))
                        .on('end', () => {
                            // 某些情况下 end 触发了但文件没生成（例如时间点无效）
                            if (fs.existsSync(thumbPath)) {
                                console.log(`[Thumbnail] ✅ Video thumbnail created at ${timestamp}`);
                                resolve(true);
                            } else {
                                console.warn(`[Thumbnail] ⚠️  FFmpeg finished but file not found at ${timestamp}`);
                                resolve(false);
                            }
                        })
                        .on('error', (err) => {
                            console.error(`[Thumbnail] ❌ FFmpeg error at ${timestamp}:`, err.message);
                            resolve(false);
                        });
                });
            };

            // 1. 尝试 10% 处
            let success = await tryScreenshot('10%');

            // 2. 如果失败，尝试 1 秒处
            if (!success) {
                console.log(`[Thumbnail] 🔄 Retrying at 1s mark...`);
                success = await tryScreenshot('00:00:01');
            }

            if (success) {
                return thumbPath;
            }
        }
    } catch (error: any) {
        console.error(`[Thumbnail] ❌ Unexpected error:`, error.message);
    }
    return null;
}

export async function getImageDimensions(filePath: string, mimeType: string): Promise<{ width: number; height: number }> {
    const absFilePath = path.resolve(filePath);
    console.log(`[Dimensions] 📏 Getting dimensions for: ${absFilePath} (${mimeType})`);

    try {
        if (mimeType.startsWith('image/')) {
            const metadata = await sharp(absFilePath).metadata();
            const result = { width: metadata.width || 0, height: metadata.height || 0 };
            console.log(`[Dimensions] ✅ Image dimensions: ${result.width}x${result.height}`);
            return result;
        } else if (mimeType.startsWith('video/')) {
            return new Promise((resolve) => {
                ffmpeg.ffprobe(absFilePath, (err, metadata) => {
                    if (err) {
                        console.error(`[Dimensions] ❌ Probe failed:`, err.message);
                        resolve({ width: 0, height: 0 });
                    } else {
                        const stream = metadata.streams.find(s => s.width && s.height);
                        const result = {
                            width: stream?.width || 0,
                            height: stream?.height || 0
                        };
                        console.log(`[Dimensions] ✅ Video dimensions: ${result.width}x${result.height}`);
                        resolve(result);
                    }
                });
            });
        }
    } catch (error) {
        console.error('Get dimensions failed:', error);
    }
    return { width: 0, height: 0 };
}
