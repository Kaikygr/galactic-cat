require("dotenv").config();

const fs = require("fs-extra");
const path = require("path");
const { processGemini } = require(path.join(__dirname, "../modules/gemini/index"));
const { processSticker } = require(path.join(__dirname, "../modules/sticker/sticker"));
const { getGroupAdmins, getFileBuffer } = require(path.join(__dirname, "../utils/functions"));
const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);
const messageController = require(path.join(__dirname, "./consoleMessage"));

const winston = require("winston");
const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple())
    }),
    new winston.transports.File({
      filename: "error.log",
      level: "warn",
      format: winston.format.combine(winston.format.timestamp(), winston.format.json())
    })
  ]
});

const maxAttempts = 3;
const delayMs = 1000;
const sendTimeoutMs = 5000;
const WA_DEFAULT_EPHEMERAL = 86400;

async function retryOperation(operation, options = {}) {
  const { retries = 3, delay = 1000, timeout = 5000 } = options;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await Promise.race([operation(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))]);
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function parseMessageInfo(info) {
  const baileys = require("@whiskeysockets/baileys");
  const from = info.key.remoteJid;
  const content = JSON.stringify(info.message);
  const type = baileys.getContentType(info.message);
  const isMedia = type === "imageMessage" || type === "videoMessage";

  const body = info.message?.conversation || info.message?.viewOnceMessageV2?.message?.imageMessage?.caption || info.message?.viewOnceMessageV2?.message?.videoMessage?.caption || info.message?.imageMessage?.caption || info.message?.videoMessage?.caption || info.message?.extendedTextMessage?.text || info.message?.viewOnceMessage?.message?.videoMessage?.caption || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.documentWithCaptionMessage?.message?.documentMessage?.caption || info.message?.buttonsMessage?.imageMessage?.caption || info.message?.buttonsResponseMessage?.selectedButtonId || info.message?.listResponseMessage?.singleSelectReply?.selectedRowId || info.message?.templateButtonReplyMessage?.selectedId || (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)?.id : null) || info?.text || "";
  return {
    from,
    content,
    type,
    isMedia,
    cleanedBody: (body || "").trim()
  };
}

function getCommandData(cleanedBody, config) {
  let prefixes = [];
  if (Array.isArray(config.prefix)) {
    prefixes = config.prefix.filter(p => typeof p === "string" && p.trim() !== "").map(p => p.trim());
  } else if (typeof config.prefix === "string" && config.prefix.trim()) {
    prefixes = [config.prefix.trim()];
  }
  if (prefixes.length === 0) return null;
  const matchingPrefix = prefixes.find(p => cleanedBody.startsWith(p));
  if (!matchingPrefix) return null;
  const withoutPrefix = cleanedBody.slice(matchingPrefix.length).trim();
  if (!withoutPrefix) return null;
  const parts = withoutPrefix.split(/ +/);
  const comando = parts[0].toLowerCase();
  const args = parts.slice(1);
  return { comando, args, usedPrefix: matchingPrefix };
}

async function getGroupContext(client, from, info) {
  let groupMetadata = "";
  let groupName = "";
  let groupDesc = "";
  let groupMembers = "";
  let groupAdmins = "";
  if (from.endsWith("@g.us")) {
    groupMetadata = await client.groupMetadata(from);
    groupName = groupMetadata.subject;
    groupDesc = groupMetadata.desc;
    groupMembers = groupMetadata.participants;
    groupAdmins = getGroupAdmins(groupMembers);
  }
  return { groupMetadata, groupName, groupDesc, groupMembers, groupAdmins };
}

async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    if (!info || !info.key || !info.message) continue;

    await client.readMessages([info.key]);

    if (upsert?.type === "append" || info.key.fromMe) continue;

    const { from, content, type, isMedia, cleanedBody } = parseMessageInfo(info);
    if (!cleanedBody) {
      messageController.processMessage(info, client);
      continue;
    }

    const cmdData = getCommandData(cleanedBody, config);
    if (!cmdData) {
      messageController.processMessage(info, client);
      continue;
    }
    const { comando, args } = cmdData;
    messageController.processMessage({ ...info, comando: true }, client);

    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? info.key.participant : info.key.remoteJid;
    const isOwner = config.owner.number === sender;
    const { groupAdmins } = await getGroupContext(client, from, info);

    const text = args.join(" ");
    const sleep = async ms => new Promise(resolve => setTimeout(resolve, ms));

    // Common helper function to send messages with retries
    const sendWithRetry = async (target, text, options = {}) => {
      if (typeof text !== "string") {
        text = String(text);
      }
      text = text.trim();
      if (!text) {
        logger.warn("sendWithRetry: texto vazio após sanitização");
        return;
      }
      try {
        await retryOperation(() => client.sendMessage(target, { text }, options), { retries: maxAttempts, delay: delayMs, timeout: sendTimeoutMs });
      } catch (error) {
        logger.error(`Todas as tentativas de envio falharam para ${target}.`, error);
      }
    };

    // Sends a message to the current chat with quoting
    const enviar = async texto => {
      await sendWithRetry(from, texto, { quoted: info, ephemeralExpiration: WA_DEFAULT_EPHEMERAL });
    };

    // Sends a formatted report message to the owner
    const ownerReport = async message => {
      const sanitizedMessage = String(message).trim();
      if (!sanitizedMessage) {
        logger.warn("ownerReport: Empty text after sanitization");
        return;
      }
      const formattedMessage = JSON.stringify(sanitizedMessage, null, 2);
      await sendWithRetry(config.owner.number, formattedMessage, { ephemeralExpiration: WA_DEFAULT_EPHEMERAL });
    };

    const quotedTypes = {
      textMessage: "isQuotedMsg",
      imageMessage: "isQuotedImage",
      videoMessage: "isQuotedVideo",
      documentMessage: "isQuotedDocument",
      audioMessage: "isQuotedAudio",
      stickerMessage: "isQuotedSticker",
      contactMessage: "isQuotedContact",
      locationMessage: "isQuotedLocation",
      productMessage: "isQuotedProduct"
    };

    const quotedChecks = {};
    for (const [key, value] of Object.entries(quotedTypes)) {
      quotedChecks[value] = type === "extendedTextMessage" && content.includes(key);
    }

    const { isQuotedMsg, isQuotedImage, isQuotedVideo, isQuotedDocument, isQuotedAudio, isQuotedSticker, isQuotedContact, isQuotedLocation, isQuotedProduct } = quotedChecks;

    switch (comando) {
      case "cat":
        await processGemini(text, isOwner, from, logger, enviar);
        break;

      case "sticker":
      case "s": {
        await processSticker(client, info, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer);
        break;
      }

      case "t":
        ownerReport(info);
        break;
    }
  }
}

module.exports = handleWhatsAppUpdate;

const file = require.resolve(__filename);
let debounceTimeout;

const watcher = fs.watch(file, eventType => {
  if (eventType === "change") {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      logger.info(`O arquivo "${file}" foi atualizado.`);
      try {
        delete require.cache[file];
        require(file);
      } catch (err) {
        logger.error(`Erro ao recarregar o arquivo ${file}:`, err);
      }
    }, 100);
  }
});

watcher.on("error", err => {
  logger.error(`Watcher error no arquivo ${file}:`, err);
});
