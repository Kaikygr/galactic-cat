const ytdl = require("@distube/ytdl-core");
const ytSearch = require("yt-search");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { v4: uuidv4 } = require("uuid");

const TEMP_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function getVideoInfo(query) {
    if (query.startsWith("http")) {
        const info = await ytdl.getInfo(query);
        return info.videoDetails;
    }
    const result = await ytSearch(query);
    if (result && result.videos && result.videos.length > 0) {
        return result.videos[0];
    }
    throw new Error("Nenhum vídeo encontrado.");
}

async function downloadStream(stream, filePath) {
    return new Promise((resolve, reject) => {
        const out = fs.createWriteStream(filePath);
        stream.pipe(out);
        out.on("finish", () => {
            console.log(`Arquivo salvo: ${filePath}`);
            resolve();
        });
        out.on("error", reject);
    });
}

async function processDownload(query, type = "video") {
    try {
        const videoData = await getVideoInfo(query);
        const videoUrl = query.startsWith("http") ? query : videoData.url;
        const id = uuidv4();
        const tempAudio = path.join(TEMP_DIR, `${id}.m4a`);
        const tempVideo = path.join(TEMP_DIR, `${id}.mp4`);
        const finalOutputFile = type === "audio" 
            ? path.join(TEMP_DIR, `${id}.mp3`)
            : path.join(TEMP_DIR, `${id}_final.mp4`);
        
        console.log(`Download iniciado: ${videoUrl}`);
        
        if (type === "audio") {
            await downloadStream(
                ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' }),
                tempAudio
            );
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(tempAudio)
                    .audioCodec('libmp3lame')
                    .on('error', reject)
                    .on('end', resolve)
                    .save(finalOutputFile);
            });
            fs.unlinkSync(tempAudio);
        } else {
            await Promise.all([
                downloadStream(
                    ytdl(videoUrl, { quality: 'highestvideo', filter: 'videoonly' }),
                    tempVideo
                ),
                downloadStream(
                    ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' }),
                    tempAudio
                )
            ]);
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(tempVideo)
                    .input(tempAudio)
                    .videoCodec('copy')
                    .audioCodec('aac')
                    .on('error', reject)
                    .on('end', resolve)
                    .save(finalOutputFile);
            });
            fs.unlinkSync(tempVideo);
            fs.unlinkSync(tempAudio);
        }
        
        console.log('Download concluído:', finalOutputFile);
        
        const thumbnail = videoData.thumbnails ? videoData.thumbnails[videoData.thumbnails.length - 1].url : undefined;
        const uploadDate = videoData.uploadDate || videoData.publishDate;
        
        return {
            id,
            title: videoData.title,
            duration: videoData.lengthSeconds || videoData.duration.seconds,
            url: videoUrl,
            filePath: finalOutputFile,
            author: videoData.author ? videoData.author.name : undefined,
            viewCount: videoData.viewCount,
            description: videoData.description,
            thumbnail,
            uploadDate,
            videoId: videoData.videoId,
            averageRating: videoData.averageRating,
            keywords: videoData.keywords,
            likes: videoData.likes
        };
    } catch (error) {
        console.error("Erro:", error.message);
        return { error: error.message };
    }
}

module.exports = { processDownload };