/* eslint-disable no-sync */
/* eslint-disable no-unused-vars */
// Importação dos módulos essenciais

const fs = require("fs");
const path = require("path");
const util = require("util");
const { exec } = require("child_process");
const execProm = util.promisify(exec);

const { getFileBuffer } = require("../../utils/functions");

const tempDir = path.join(__dirname, "..", "..", "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function processSticker(client, info, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer) {
  try {
    let filtro = "fps=10,scale=512:512";

    const userMessageReport = async msg => {
      await client.sendMessage(from, { text: msg }, { quoted: info });
    };

    let encmedia, mediaBuffer, mediaExtension;
    if ((isMedia && info.message.videoMessage) || isQuotedVideo) {
      const videoDuration = isMedia && info.message.videoMessage ? info.message.videoMessage.seconds : info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage.seconds;
      if (videoDuration >= (isQuotedVideo ? 35 : 10)) {
        return userMessageReport("Vídeo muito longo para sticker animada.");
      }
      encmedia = isQuotedVideo ? info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage : info.message.videoMessage;
      mediaBuffer = await getFileBuffer(encmedia, "video");
      mediaExtension = ".mp4";
    } else if ((isMedia && !info.message.videoMessage) || isQuotedImage) {
      encmedia = isQuotedImage ? info.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage : info.message.imageMessage;
      mediaBuffer = await getFileBuffer(encmedia, "image");
      mediaExtension = ".jpg";
    } else {
      return userMessageReport("Envie ou cite uma imagem ou vídeo para criar o sticker.");
    }

    if (mediaExtension === ".jpg") {
      filtro = "scale=512:512";
    }

    const mediaPath = path.join(tempDir, `temp_file_${Date.now()}${mediaExtension}`);
    fs.writeFileSync(mediaPath, mediaBuffer);

    const outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -lossless 1 -loop 0 -preset default -an -vf "${filtro}" "${outputPath}"`);

    const json = {
      "sticker-pack-name": `👤 User: ${info.pushName || sender}`,
      "sticker-pack-publisher": `👑 Owner: https://bit.ly/m/Kaally`,
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
    const exifBuffer = Buffer.concat([exifAttr, jsonBuff]);
    exifBuffer.writeUIntLE(jsonBuff.length, 14, 4);
    const metaPath = path.join(tempDir, `meta_${Date.now()}.temp.exif`);
    fs.writeFileSync(metaPath, exifBuffer);

    let webpmuxPath = "";
    try {
      webpmuxPath = (await execProm("which webpmux")).stdout.trim();
      if (!webpmuxPath) throw new Error("webpmux não encontrado.");
    } catch (e) {
      throw new Error("webpmux não encontrado. Por favor, instale-o no seu sistema.");
    }
    await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${outputPath}" -o "${outputPath}"`);
    fs.unlinkSync(metaPath);

    await client.sendMessage(from, { sticker: fs.readFileSync(outputPath) }, { quoted: info });
    fs.unlinkSync(mediaPath);
  } catch (error) {
    await client.sendMessage(from, { text: "Error durante o processamento." }, { quoted: info });
    console.log(error);
  }
}

module.exports = { processSticker };
