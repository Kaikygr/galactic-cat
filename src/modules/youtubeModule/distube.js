/**
 * Faz o download de um vídeo ou áudio do YouTube processando através do FFmpeg.
 *
 * Esta função assíncrona valida a URL do YouTube fornecida e, em seguida, utiliza a biblioteca ytdl
 * combinada com o FFmpeg para fazer o download do vídeo na mais alta qualidade com áudio ou apenas do áudio.
 * No modo vídeo, ela mescla o stream de vídeo com a melhor qualidade com o stream de áudio de melhor qualidade em um único arquivo MP4.
 * No modo áudio, ela converte o stream de áudio de maior qualidade para um arquivo MP3.
 *
 * @async
 * @function distubeProcessDownload
 * @param {string} url - A URL do vídeo do YouTube para fazer o download.
 * @param {string} outputPath - O nome base do arquivo de saída.
 * @param {("video"|"audio")} [mode="video"] - O modo de download; utilize "audio" para somente áudio ou "video" para vídeo.
 * @param {Object} [cookies=defaultCookies] - Um objeto contendo cookies para serem usados pelo agente de download do YouTube.
 * @param {Object} [agentOptions={}] - Opções adicionais para configurar o agente de download do YouTube.
 * @returns {Promise<Object>} Um objeto contendo:
 *   @property {string} filePath - O caminho completo para o arquivo baixado.
 *   @property {Object} videoDetails - Detalhes sobre o vídeo do YouTube conforme fornecido por ytdl.getInfo.
 * @throws {Error} Lança um erro se a URL for inválida, se o processo do FFmpeg falhar, ou se um modo não suportado for especificado.
 */

const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const logger = require("../../utils/logger");

const cookiesPath = path.resolve(__dirname, "cookies.json");
const defaultCookies = JSON.parse(fs.readFileSync(cookiesPath, "utf-8"));

const downloadsDir = path.resolve(__dirname, "downloads");

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

async function distubeProcessDownload(url, outputPath, mode = "video", cookies = defaultCookies, agentOptions = {}) {
  logger.info(`Iniciando download. URL: ${url}, Modo: ${mode}, OutputPath: ${outputPath}`);

  try {
    // Validação básica da URL
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      logger.error("URL inválida fornecida.");
      throw new Error("URL inválida. Certifique-se de que é uma URL válida do YouTube.");
    }

    const agent = ytdl.createAgent(cookies, agentOptions);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); // Gera um timestamp único

    // Obter informações do vídeo antes de iniciar o download
    const videoInfo = await ytdl.getInfo(url, { agent });

    const jsonPath = path.join(downloadsDir, "videoInfo.json");
    fs.writeFileSync(jsonPath, JSON.stringify(videoInfo));

    const LIMITE_MB = 10; // Limite de 10MB
    const LIMITE_BYTES = LIMITE_MB * 1024 * 1024;

    let selectedFormat = videoInfo.selectedFormat;
    const videoContentLength = parseInt(selectedFormat.contentLength || "0");

    if (videoContentLength >= LIMITE_BYTES) {
      logger.warn(`Formato original excede ${LIMITE_MB}MB: ${videoContentLength} bytes`);

      // Filtrar todos os formatos com tamanho definido e menor que o limite
      const formatosValidos = videoInfo.formats.filter(f => f.contentLength && parseInt(f.contentLength) < LIMITE_BYTES).map(f => ({ ...f, size: parseInt(f.contentLength) }));

      if (formatosValidos.length === 0) {
        logger.error(`Nenhum formato disponível com menos de ${LIMITE_MB}MB.`);
        return;
      }

      // Pegar o formato com maior tamanho abaixo do limite
      const melhorFormato = formatosValidos.reduce((prev, curr) => (curr.size > prev.size ? curr : prev));

      logger.info(`Novo formato selecionado: ${melhorFormato.itag} com ${melhorFormato.size} bytes`);
      selectedFormat = melhorFormato;
    }

    if (mode === "audio") {
      // Gera o caminho do arquivo final e do temporário
      const audioPath = path.join(downloadsDir, `${outputPath}-audio-${timestamp}.mp3`);
      const tempAudioPath = audioPath + ".tmp";
      logger.debug(`Caminho temporário do arquivo de áudio: ${tempAudioPath}`);

      const audioStream = ytdl.downloadFromInfo(videoInfo, { format: selectedFormat, agent });
      audioStream.on("error", err => {
        if (err.code === "ECONNRESET") {
          logger.error("Erro de conexão durante o download: ECONNRESET. Tente novamente.");
        } else {
          logger.error(`Erro no stream de áudio: ${err.message}`);
        }
        throw err;
      });

      // Altera o FFmpeg para salvar no arquivo temporário
      const ffmpegProcess = spawn("ffmpeg", ["-i", "pipe:0", "-vn", "-acodec", "libmp3lame", "-q:a", "2", tempAudioPath]);

      // Tratamento para erro EPIPE no stdin do ffmpeg
      ffmpegProcess.stdin.on("error", err => {
        if (err.code === "EPIPE") {
          logger.warn("EPIPE error on ffmpeg stdin ignored.");
        }
      });

      // Adicione os manipuladores de erro para evitar ECONNRESET no ffmpeg
      ffmpegProcess.stdin.on("error", err => {
        if (err.code === "EPIPE" || err.code === "ECONNRESET") {
          logger.warn(`FFmpeg stdin error (${err.code}) ignorado.`);
        }
      });
      ffmpegProcess.stdout.on("error", err => {
        if (err.code === "ECONNRESET") {
          logger.warn("FFmpeg stdout ECONNRESET ignorado.");
        }
      });
      ffmpegProcess.stderr.on("error", err => {
        if (err.code === "ECONNRESET") {
          logger.warn("FFmpeg stderr ECONNRESET ignorado.");
        }
      });

      audioStream.pipe(ffmpegProcess.stdin);

      await new Promise((resolve, reject) => {
        ffmpegProcess.on("close", code => {
          if (code === 0) {
            // Renomeia o arquivo temporário para o arquivo final
            fs.renameSync(tempAudioPath, audioPath);
            logger.info(`Áudio salvo com sucesso em: ${audioPath}`);
            resolve();
          } else {
            logger.error(`FFmpeg falhou com código ${code}`);
            reject(new Error(`FFmpeg falhou com código ${code}`));
          }
        });
        ffmpegProcess.on("error", err => {
          logger.error(`Erro no processo FFmpeg: ${err.message}`);
          reject(err);
        });
      });

      return {
        filePath: audioPath,
        videoDetails,
      };
    } else if (mode === "video") {
      // Gera o caminho do arquivo final e do temporário
      const videoPath = path.join(downloadsDir, `${outputPath}-video-${timestamp}.mp4`);
      const tempVideoPath = videoPath + ".tmp";
      logger.debug(`Caminho temporário do arquivo de vídeo: ${tempVideoPath}`);

      const videoStream = ytdl.downloadFromInfo(videoInfo, { format: selectedFormat, agent });
      videoStream.on("error", err => {
        if (err.code === "ECONNRESET") {
          logger.error("Erro de conexão durante o download: ECONNRESET. Tente novamente.");
        } else {
          logger.error(`Erro no stream de vídeo: ${err.message}`);
        }
        throw err;
      });

      const audioStream = ytdl.downloadFromInfo(videoInfo, { format: selectedFormat, agent });
      audioStream.on("error", err => {
        if (err.code === "ECONNRESET") {
          logger.error("Erro de conexão durante o download: ECONNRESET. Tente novamente.");
        } else {
          logger.error(`Erro no stream de áudio: ${err.message}`);
        }
        throw err;
      });

      // Altera o FFmpeg para salvar no arquivo temporário
      const ffmpegProcess = spawn("ffmpeg", ["-i", "pipe:0", "-i", "pipe:3", "-c:v", "copy", "-c:a", "aac", tempVideoPath], {
        stdio: ["pipe", "pipe", "pipe", "pipe"],
      });

      // Tratamento para erro EPIPE no stdin de vídeo do ffmpeg
      ffmpegProcess.stdio[0].on("error", err => {
        if (err.code === "EPIPE") {
          logger.warn("EPIPE error on ffmpeg video stdin ignored.");
        }
      });

      // Adicione os manipuladores de erro para evitar ECONNRESET nos streams do ffmpeg
      ffmpegProcess.stdio[0].on("error", err => {
        if (err.code === "EPIPE" || err.code === "ECONNRESET") {
          logger.warn(`FFmpeg video stdin error (${err.code}) ignorado.`);
        }
      });
      ffmpegProcess.stdio[1].on("error", err => {
        if (err.code === "ECONNRESET") {
          logger.warn("FFmpeg stdout ECONNRESET ignorado.");
        }
      });
      ffmpegProcess.stdio[2].on("error", err => {
        if (err.code === "ECONNRESET") {
          logger.warn("FFmpeg stderr ECONNRESET ignorado.");
        }
      });

      videoStream.pipe(ffmpegProcess.stdio[0]);
      audioStream.pipe(ffmpegProcess.stdio[3]);

      await new Promise((resolve, reject) => {
        ffmpegProcess.on("close", code => {
          if (code === 0) {
            // Renomeia o arquivo temporário para o arquivo final
            fs.renameSync(tempVideoPath, videoPath);
            logger.info(`Vídeo salvo com sucesso em: ${videoPath}`);
            resolve();
          } else {
            logger.error(`FFmpeg falhou com código ${code}`);
            reject(new Error(`FFmpeg falhou com código ${code}`));
          }
        });
        ffmpegProcess.on("error", err => {
          logger.error(`Erro no processo FFmpeg: ${err.message}`);
          reject(err);
        });
      });

      return {
        filePath: videoPath,
        videoDetails,
      };
    } else {
      logger.error("Modo inválido fornecido. Use 'audio' ou 'video'.");
      throw new Error("Modo inválido. Use 'audio' ou 'video'.");
    }
  } catch (err) {
    if (err.code === "ECONNRESET") {
      logger.error("Erro de conexão: ECONNRESET. Verifique sua conexão com a internet.");
    } else {
      logger.error(`Erro durante o download: ${err.message}`);
    }
    throw err;
  }
}

module.exports = {
  distubeProcessDownload,
};
