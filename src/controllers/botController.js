require("dotenv").config();

const path = require("path");
const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);
const logger = require("../utils/logger");

const { processAIContent } = require("../modules/geminiModule/processGemini");
const { processSticker } = require(path.join(__dirname, "../modules/stickerModule/processStickers"));
const { getFileBuffer } = require(path.join(__dirname, "../utils/functions"));
const { preProcessMessage, processPrefix, processQuotedChecks, getExpiration } = require(path.join(__dirname, "./messageTypeController"));
const { processPremiumStatus } = require("../database/processUserPremium");
async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    if (!info.key || !info.message) return;
    if (info?.key?.fromMe) return;

    const from = info?.key?.remoteJid;
    const isGroup = from?.endsWith("@g.us");
    const sender = isGroup ? info.key.participant : info.key.remoteJid;
    const userName = info?.pushName || "Desconhecido";
    const expirationMessage = getExpiration(info);

    const { type, body, isMedia } = preProcessMessage(info);
    const prefixResult = processPrefix(body, config.bot.globalSettings.prefix);
    if (!prefixResult) return;

    const { comando, args } = prefixResult;
    const text = args.join(" ");
    const content = JSON.stringify(info.message);

    const isOwner = sender === config.owner.number;
    const ownerPhoneNumber = config.owner.number;
    const ownerName = config.owner.name;

    const { isQuotedMsg, isQuotedImage, isQuotedVideo, isQuotedDocument, isQuotedAudio, isQuotedSticker, isQuotedContact, isQuotedLocation, isQuotedProduct } = processQuotedChecks(type, content);

    function getGroupAdmins(participants) {
      const admins = [];
      for (const participant of participants) {
        if (participant.admin === "admin" || participant.admin === "superadmin") {
          admins.push(participant.id);
        }
      }
      return admins;
    }
    const groupMeta = isGroup ? await client.groupMetadata(from) : null;
    const isGroupAdmin = isGroup ? getGroupAdmins(groupMeta.participants).includes(sender) : false;

    const isQuotedUser = Object.entries(info.message || {}).reduce((acc, [_, value]) => {
      if (value?.contextInfo) {
        const mencionados = value.contextInfo.mentionedJid || [];
        const participante = value.contextInfo.participant ? [value.contextInfo.participant] : [];
        return [...acc, ...mencionados, ...participante];
      }
      return acc;
    }, []);

    switch (comando) {
      case "cat":
      case "gemini": {
        await processAIContent(client, from, info, expirationMessage, sender, userName, text);
        break;
      }

      case "sticker":
      case "s": {
        await processSticker(client, info, expirationMessage, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer);
        break;
      }
      case "p": {
        console.log(text);
        if (!isOwner) {
          return client.sendMessage(from, {
            text: "❌ Apenas o dono do bot pode adicionar usuários premium",
          });
        }

        const parts = text.trim().split(/\s+/);
        // Os três primeiros elementos formam o número de telefone
        const phoneNumber = parts.slice(0, 3).join(" ");
        // O resto é a duração
        const duration = parts.slice(3).join(" ");

        if (!phoneNumber || !duration) {
          return client.sendMessage(from, {
            text: "❌ Formato inválido!\nUso correto: +55 99 99999-9999 30 days",
          });
        }

        try {
          await processPremiumStatus(phoneNumber, duration, client);
        } catch (error) {
          client.sendMessage(from, {
            text: `❌ Erro ao adicionar usuário premium: ${error.message}`,
          });
        }
        break;
      }
    }
  }
}

module.exports = handleWhatsAppUpdate;
