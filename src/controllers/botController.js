require("dotenv").config();

const path = require("path");
const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);
const logger = require("../utils/logger");

const { generateAIContent } = require("../modules/geminiModule/gemini");
const { processSticker } = require(path.join(__dirname, "../modules/stickerModule/sticker"));
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
    const prefixResult = processPrefix(body, process.env.GLOBAL_PREFIX);
    if (!prefixResult) return;

    const { comando, args } = prefixResult;
    const text = args.join(" ");
    const content = JSON.stringify(info.message);

    const isOwner = sender === config.owner.number;

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

    switch (comando) {
      case "cat":
      case "gemini": {
        await generateAIContent(client, from, info, expirationMessage, sender, userName, text);
        break;
      }

      case "sticker":
      case "s": {
        await processSticker(client, info, expirationMessage, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer);
        break;
      }
      case "grupo": {
        break;
      }
    }
  }
}

module.exports = handleWhatsAppUpdate;
