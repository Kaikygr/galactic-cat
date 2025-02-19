const fs = require("fs-extra");
const path = require("path");
const cp = require('child_process');
const ytdl = require("@distube/ytdl-core");
// Substitua a importação de yt-search pela de youtube-search-api
const YoutubeSearchApi = require("youtube-search-api");

const tempDir = path.join(__dirname, "./temp");
fs.ensureDirSync(tempDir);

function getTempFilePath(mode) {
	const ext = mode === "audio" ? "mp3" : "mp4";
	return path.join(tempDir, `${mode}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`);
}

async function fetchMedia(url, mode = "video") {
  try {
		new URL(url);
	} catch (err) {
		throw new Error("URL inválida");
	}

  const outputPath = getTempFilePath(mode);
  
  if(mode === "audio") {
    const audioStream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
    const ffmpegAudio = cp.spawn('ffmpeg', [
      '-loglevel', '8',
      '-hide_banner',
      '-f', 'webm',
      '-i', 'pipe:0',
      '-vn',
      '-c:a', 'libmp3lame',
      '-q:a', '2',
      '-f', 'mp3',
      outputPath
    ], { stdio: ['pipe', 'ignore', 'inherit'] });
    audioStream.pipe(ffmpegAudio.stdin);
    await new Promise((resolve, reject) => {
      ffmpegAudio.on('close', code => {
        code === 0 ? resolve() : reject(new Error("Erro na conversão de áudio"));
      });
    });
  } else if(mode === "video") {
    const videoStream = ytdl(url, { quality: 'highestvideo' });
    const audioStream = ytdl(url, { quality: 'highestaudio' });
    const ffmpegProcess = cp.spawn('ffmpeg', [
      '-loglevel', '8',
      '-hide_banner',
      '-i', 'pipe:3',
      '-i', 'pipe:4',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-strict', 'experimental',
      '-f', 'mp4',
      outputPath
    ], { stdio: ['ignore', 'ignore', 'inherit', 'pipe', 'pipe'] });
    videoStream.pipe(ffmpegProcess.stdio[3]);
    audioStream.pipe(ffmpegProcess.stdio[4]);
    await new Promise((resolve, reject) => {
      ffmpegProcess.on('close', code => {
        code === 0 ? resolve() : reject(new Error("Erro na conversão de vídeo"));
      });
    });
  } else {
    throw new Error("Modo inválido. Use 'audio' ou 'video'");
  }
  
  const info = await ytdl.getInfo(url);
  return { filePath: outputPath, info };
}

async function searchVideo(query) {
  // Usa o youtube-search-api para buscar vídeos a partir de uma consulta
  const result = await YoutubeSearchApi.GetListByKeyword(query, false, 1);
  if (result && result.items && result.items.length > 0) {
    // Retorna a URL completa usando o videoId (se não houver videoUrl)
    return result.items[0].videoUrl || `https://www.youtube.com/watch?v=${result.items[0].videoId}`;
  }
  throw new Error("Nenhum vídeo encontrado para a consulta.");
}

module.exports = { fetchMedia, searchVideo };
