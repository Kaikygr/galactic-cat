require("dotenv").config();

const path = require("path");
const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);
const logger = require("../utils/logger");

const { processAIContent } = require("../modules/geminiModule/gemini");
const { processSticker } = require(path.join(__dirname, "../modules/stickerModule/sticker"));
const { processGroupMetrics, processUserMetrics } = require(path.join(__dirname, "../modules/groupModule/groupMetrics"));

const { getFileBuffer } = require(path.join(__dirname, "../utils/functions"));
const { preProcessMessage, processPrefix, getQuotedChecks, getExpiration } = require(path.join(__dirname, "./messageTypeController"));

async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    if (!info || !info.key || !info.message) return;
    if (info.key.fromMe) return;

    const from = info.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
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

    const { isQuotedMsg, isQuotedImage, isQuotedVideo, isQuotedDocument, isQuotedAudio, isQuotedSticker, isQuotedContact, isQuotedLocation, isQuotedProduct } = getQuotedChecks(type, content);

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
    const groupFormattedData = groupMeta ? JSON.stringify(groupMeta, null, 2) : null;
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

      case "grupo": {
        try {
          if (text === "--info") {
            await processGroupMetrics(client, info, from, expirationMessage);
          } else if (text.startsWith("--me")) {
            const userId = sender;
            await processUserMetrics(client, info, from, expirationMessage, userId);
          } else {
            await client.sendMessage(from, { text: "❌ Comando inválido. Use .grupo --me para obter informações." }, { quoted: info, ephemeralExpiration: expirationMessage });
          }
        } catch (error) {
          enviar(from, "❌ Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.");
          console.error("Erro:", error);
        }
        break;
      }

      case "eval": {
        if (!isOwner) {
          await client.sendMessage(from, { text: "❌ O comando eval é restrito ao dono." }, { quoted: info, ephemeralExpiration: expirationMessage });
          break;
        }
        try {
          const result = eval(text);
          await client.sendMessage(from, { text: `Resultado: ${result}` }, { quoted: info, ephemeralExpiration: expirationMessage });
        } catch (error) {
          await client.sendMessage(from, { text: `Erro ao executar o comando: ${error.message}` }, { quoted: info, ephemeralExpiration: expirationMessage });
        }
        break;
      }
      case "teste":
        client.sendMessage(from, { text: `${isQuotedUser}` }, { quoted: info, ephemeralExpiration: expirationMessage });
        break;
    }
  }
}

module.exports = handleWhatsAppUpdate;
