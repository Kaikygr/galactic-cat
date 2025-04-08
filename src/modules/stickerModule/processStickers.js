const fs = require("fs");
const path = require("path");
const util = require("util");
const { exec } = require("child_process");
const execProm = util.promisify(exec);
const config = require("../../config/options.json");

const { getFileBuffer } = require("../../utils/functions");
const logger = require("../../utils/logger");

const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function processSticker(client, info, expirationMessage, sender, from, text, isMedia, isQuotedVideo, isQuotedImage) {
  try {
    logger.info(`🎨✨ [ Criando Sticker ] Processando pedido para o usuário: ${sender.split("@")[0]} 🚀🛠️`);

    const caminhosPossiveis = {
      image: [info.message?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.imageMessage],
      video: [info.message?.videoMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.videoMessage],
      sticker: [info.message?.stickerMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage],
      document: [info.message?.documentMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentWithCaptionMessage?.message?.documentMessage, info?.message.extendedTextMessage?.contextInfo.quotedMessage?.documentMessage],
    };

    let tipoMidia = null;
    let encmedia = null;

    for (const [tipo, caminhos] of Object.entries(caminhosPossiveis)) {
      for (const caminho of caminhos) {
        if (caminho) {
          tipoMidia = tipo;
          encmedia = caminho;
          break;
        }
      }
      if (encmedia) break;
    }

    if (!encmedia) {
      await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
      await client.sendMessage(
        from,
        {
          text:
            "📌 *Atenção!*\n\n" +
            "Envie ou marque uma imagem para processamento.\n\n" +
            "🔹 *Vídeos:*\n" +
            "- Máximo de *10 segundos* de duração.\n" +
            "- *Alta definição pode causar erros*, prefira qualidade menor.\n" +
            "- *Recomendação:* 5 segundos e até *1MB* para melhor compatibilidade.\n\n" +
            "📏 *Formato padrão:* Todas as mídias serão ajustadas para *512x512*.\n\n" +
            "📝 *Descrição Personalizada:*\n" +
            "Agora você pode adicionar uma descrição ao seu sticker enviando um texto junto com o comando.\n\n" +
            "🔹 *Como funciona?*\n" +
            "- Ao enviar `.sticker Seu texto aqui`, a descrição será salva e usada futuramente.\n\n" +
            "- Se o texto contiver `#data`, `#id` ou `#nome`, esses valores serão automaticamente substituídos.\n\n" +
            "- Exemplo: `.sticker Meu nome é #nome | Hoje é #data`\n\n" +
            "- O primeiro trecho será usado como *título*, o segundo como *descrição*.\n\n" +
            "- Caso um dos lados não seja fornecido, valores padrão serão aplicados.\n\n" +
            "♻️ *Se você enviar um novo texto, ele será atualizado para os próximos stickers!*",
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      return;
    }

    if (tipoMidia === "document") {
      const mimetype = encmedia.mimetype || "";
      if (mimetype.startsWith("image/")) {
        tipoMidia = "image";
      } else if (mimetype.startsWith("video/")) {
        tipoMidia = "video";
      } else {
        await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
        await client.sendMessage(
          from,
          {
            text: "❌ *Erro: Tipo de documento não suportado!*\n\nApenas documentos de imagem ou vídeo são aceitos.",
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
        return;
      }
    }

    const fileLength = encmedia?.fileLength || 0;
    const maxFileSize = 1.5 * 1024 * 1024;

    if ((tipoMidia === "video" || tipoMidia === "sticker") && fileLength > maxFileSize) {
      await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
      await client.sendMessage(
        from,
        {
          text: "❌ *Erro: Arquivo muito grande!*\n\nO arquivo enviado excede o limite de *1,5 MB*. Por favor, envie um arquivo menor.",
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      return;
    }

    let mediaExtension = "";
    let processWithFfmpeg = true;
    let mediaBuffer;

    try {
      mediaBuffer = await getFileBuffer(encmedia, tipoMidia);

      switch (tipoMidia) {
        case "image":
          mediaExtension = ".jpg";
          break;
        case "video":
          mediaExtension = ".mp4";
          break;
        case "sticker":
          mediaExtension = ".webp";
          processWithFfmpeg = false;
          break;
      }
    } catch (e) {
      if (e.message.includes("bad decrypt")) {
        logger.error("Erro ao obter mídia: problema de descriptografia", e);
        await client.sendMessage(from, { react: { text: "❌", key: info.key } });
        await client.sendMessage(
          from,
          {
            text: "❌ *Erro ao processar o documento!*\n\nOcorreu um problema de descriptografia ao tentar acessar o arquivo. Por favor, envie novamente ou tente outro arquivo.",
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
      } else {
        logger.error("Erro ao obter mídia:", e);
        await client.sendMessage(from, { react: { text: "❌", key: info.key } });
        await client.sendMessage(
          from,
          {
            text: "❌ *Erro ao processar a mídia enviada!*\n\nPor favor, tente novamente mais tarde.",
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
      }
      return;
    }

    const mediaPath = path.join(tempDir, `temp_file_${Date.now()}${mediaExtension}`);
    fs.writeFileSync(mediaPath, mediaBuffer);

    let outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    if (processWithFfmpeg) {
      const filtro = tipoMidia === "video" ? "fps=10,scale=512:512" : "scale=512:512";
      await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -lossless 1 -loop 0 -preset default -an -vf "${filtro}" "${outputPath}"`);
    } else {
      fs.copyFileSync(mediaPath, outputPath);
    }

    const formattedSender = sender.replace(/@s\.whatsapp\.net$/, "");
    const prefsPath = path.join(__dirname, "data", "stickerPrefs.json");
    let stickerPrefs = {};
    if (fs.existsSync(prefsPath)) {
      try {
        stickerPrefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
      } catch (err) {
        stickerPrefs = {};
      }
    }
    const key = formattedSender;

    let defaultComputedName = `👤 Usuário: ${info.pushName}\n🆔 ID: ${formattedSender}\n📅 Data: ${new Date().toLocaleDateString("pt-BR")}`;
    let defaultComputedPublisher = `\n\n👑 Criador: https://bit.ly/m/Kaally`;

    let storedName = stickerPrefs[key] && stickerPrefs[key].stickerPackName ? stickerPrefs[key].stickerPackName : defaultComputedName;
    let storedPublisher = stickerPrefs[key] && stickerPrefs[key].stickerPackPublisher ? stickerPrefs[key].stickerPackPublisher : defaultComputedPublisher;

    let stickerPackName, stickerPackPublisher;
    if (text && text.trim()) {
      if (text.includes("|")) {
        const parts = text.split("|").map(p => p.trim());
        const newName = parts[0] !== "" ? parts[0] : storedName;
        const newPublisher = parts[1] !== "" ? parts[1] : storedPublisher;
        stickerPackName = newName;
        stickerPackPublisher = newPublisher;
        stickerPrefs[key] = {
          stickerPackName: newName,
          stickerPackPublisher: newPublisher,
        };
        fs.writeFileSync(prefsPath, JSON.stringify(stickerPrefs, null, 2));
      } else {
        const newName = text.trim() !== "" ? text.trim() : null;
        stickerPackName = newName !== null ? newName : defaultComputedName;
        stickerPackPublisher = storedPublisher || defaultComputedPublisher;
        stickerPrefs[key] = {
          stickerPackName: newName,
          stickerPackPublisher: storedPublisher,
        };
        fs.writeFileSync(prefsPath, JSON.stringify(stickerPrefs, null, 2));
      }
    } else {
      stickerPackName = storedName;
      stickerPackPublisher = storedPublisher;
    }

    const finalPackName = stickerPackName !== null ? stickerPackName : defaultComputedName;
    const finalPackPublisher = stickerPackPublisher !== null ? stickerPackPublisher : defaultComputedPublisher;

    const replacedName = finalPackName.replace(/#nome/g, info.pushName).replace(/#id/g, formattedSender).replace(/#data/g, new Date().toLocaleDateString("pt-BR"));
    const replacedPublisher = finalPackPublisher.replace(/#nome/g, info.pushName).replace(/#id/g, formattedSender).replace(/#data/g, new Date().toLocaleDateString("pt-BR"));

    const json = {
      "sticker-pack-name": replacedName,
      "sticker-pack-publisher": replacedPublisher,
    };

    const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
    const exifBuffer = Buffer.concat([exifAttr, jsonBuff]);
    exifBuffer.writeUIntLE(jsonBuff.length, 14, 4);
    const metaPath = path.join(tempDir, `meta_${Date.now()}.temp.exif`);
    fs.writeFileSync(metaPath, exifBuffer);

    let webpmuxPath = "";

    webpmuxPath = (await execProm("which webpmux")).stdout.trim();

    await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${outputPath}" -o "${outputPath}"`);
    fs.unlinkSync(metaPath);

    await client.sendMessage(from, { react: { text: "🐈‍⬛", key: info.key } });
    await client.sendMessage(from, { sticker: fs.readFileSync(outputPath) }, { quoted: info, ephemeralExpiration: expirationMessage });
    fs.unlinkSync(mediaPath);
  } catch (error) {
    await client.sendMessage(from, { react: { text: "❌", key: info.key } });
    await client.sendMessage(
      from,
      {
        text: "❌ *Erro durante o processamento!*\n\nOcorreu um problema ao tentar processar sua solicitação. Por favor, tente novamente mais tarde ou verifique se o arquivo enviado está no formato correto.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
    logger.error("Erro ao processar sticker:", error);
    await client.sendMessage(
      config.owner.number,
      {
        text: `❌ *Erro ao processar sticker!*\n\nOcorreu um problema ao tentar processar a solicitação de ${sender}.\n\n\`\`\`${error}\`\`\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
    return;
  }
}

module.exports = { processSticker };
