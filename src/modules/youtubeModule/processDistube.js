const { distubeProcessDownload } = require("./distube");
const logger = require("../../utils/logger");
const fs = require("fs");
const path = require("path");

async function processYoutubeAudioDownload(client, from, info, sender, expirationMessage, text) {
  try {
    const url = text;
    const outputPath = `audio-${sender}`;
    const mode = "video"; // ou "video" se você quiser baixar o vídeo
    const result = await distubeProcessDownload(url, outputPath, mode);

    //logger.info(JSON.stringify(result));
  } catch (error) {
    logger.error(`Erro ao processar download: ${error.message}`);
    throw error;
  }
}

module.exports = {
  processYoutubeAudioDownload,
};
