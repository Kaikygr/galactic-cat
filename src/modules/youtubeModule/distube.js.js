const fs = require("fs");
const path = require("path");
const ytdl = require("@distube/ytdl-core");
const { spawn } = require("child_process");
const { pipeline } = require("stream/promises");
const yts = require("yt-search");

async function searchVideo(link) {
  if (!/^https?:\/\//.test(link)) {
    const result = await yts(link);
    if (result && result.videos && result.videos.length > 0) {
      return result.videos[0].url;
    } else {
      throw new Error("No video found for the search query.");
    }
  }
  return link;
}

async function downloadAudio(info, outputDir, maxSize) {
  const validAudioFormats = info.formats.filter(f => Number(f.contentLength) > 0 && Number(f.contentLength) < maxSize && f.mimeType.includes("audio"));
  if (!validAudioFormats.length) {
    throw new Error("No audio format available under 100MB.");
  }
  const chosenAudioFormat = validAudioFormats.reduce((prev, cur) => {
    const prevRate = prev.audioBitrate || prev.bitrate || 0;
    const curRate = cur.audioBitrate || cur.bitrate || 0;
    return curRate > prevRate ? cur : prev;
  });

  const audioTempPath = path.join(outputDir, `audio_temp_${Date.now()}.mp4`);
  await pipeline(ytdl.downloadFromInfo(info, { format: chosenAudioFormat }), fs.createWriteStream(audioTempPath));
  return audioTempPath;
}

async function convertAudio(audioTempPath, outputDir) {
  const audioFinalPath = path.join(outputDir, `audio_final_${Date.now()}.mp3`);
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", audioTempPath, "-vn", "-acodec", "libmp3lame", "-q:a", "2", audioFinalPath], { stdio: "inherit" });
    ffmpeg.on("close", code => {
      if (code === 0) {
        fs.unlinkSync(audioTempPath);
        resolve();
      } else {
        reject(new Error(`ffmpeg failed to convert to mp3 (code ${code})`));
      }
    });
  });
  return audioFinalPath;
}

async function downloadVideo(info, outputDir, maxSize) {
  const validVideoFormats = info.formats.filter(f => Number(f.contentLength) > 0 && Number(f.contentLength) < maxSize && f.mimeType.includes("video"));
  if (!validVideoFormats.length) {
    throw new Error("No video format available under 100MB.");
  }
  const chosenVideoFormat = validVideoFormats.reduce((prev, cur) => (parseInt(cur.bitrate) > parseInt(prev.bitrate) ? cur : prev));

  const videoTempPath = path.join(outputDir, `video_temp_${Date.now()}.mp4`);
  await pipeline(ytdl.downloadFromInfo(info, { format: chosenVideoFormat }), fs.createWriteStream(videoTempPath));
  return videoTempPath;
}

async function mergeVideoAndAudio(videoTempPath, audioTempPath, outputDir) {
  const outputPath = path.join(outputDir, `video_final_${Date.now()}.mp4`);
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", videoTempPath, "-i", audioTempPath, "-c:v", "copy", "-c:a", "aac", "-strict", "experimental", outputPath], { stdio: "inherit" });
    ffmpeg.on("close", code => {
      if (code === 0) {
        fs.unlinkSync(videoTempPath);
        fs.unlinkSync(audioTempPath);
        resolve();
      } else {
        reject(new Error(`ffmpeg failed to merge video and audio (code ${code})`));
      }
    });
  });
  return outputPath;
}

async function processYouTube(link, type = "audio") {
  try {
    const maxSize = 100 * 1024 * 1024; // 100 MB
    const outputDir = path.resolve(__dirname, "downloads");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    link = await searchVideo(link);
    const info = await ytdl.getInfo(link);

    if (type === "audio") {
      const audioTempPath = await downloadAudio(info, outputDir, maxSize);
      const audioFinalPath = await convertAudio(audioTempPath, outputDir);
      const { videoDetails } = info;
      return {
        savedLink: audioFinalPath,
        title: videoDetails.title,
        description: videoDetails.description,
        lengthSeconds: videoDetails.lengthSeconds,
        viewCount: videoDetails.viewCount,
        publishDate: videoDetails.publishDate,
        likeCount: videoDetails.likeCount,
        authorChannelUrl: videoDetails.author.channel_url,
        authorThumbnail: videoDetails.author.thumbnails[0].url,
        authorSubscriberCount: videoDetails.author.subscriber_count,
        thumbnail: videoDetails.thumbnails[0].url,
      };
    }

    if (type === "video") {
      const videoTempPath = await downloadVideo(info, outputDir, maxSize);
      const audioTempPath = await downloadAudio(info, outputDir, maxSize);
      const outputPath = await mergeVideoAndAudio(videoTempPath, audioTempPath, outputDir);
      const { videoDetails } = info;
      return {
        savedLink: outputPath,
        title: videoDetails.title,
        thumbnail: videoDetails.thumbnails[0].url,
        description: videoDetails.description,
        lengthSeconds: videoDetails.lengthSeconds,
        publishDate: videoDetails.publishDate,
        viewCount: videoDetails.viewCount,
        likeCount: videoDetails.likeCount,
        authorChannelUrl: videoDetails.author.channel_url,
        authorThumbnail: videoDetails.author.thumbnails[0].url,
        authorSubscriberCount: videoDetails.author.subscriber_count,
      };
    }
  } catch (err) {
    console.error(`[ DISTUBE ] Error processing media:`, err);
    return { error: true, message: err.message };
  }
}

module.exports = processYouTube;
