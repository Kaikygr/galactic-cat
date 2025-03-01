require("dotenv").config();

const fs = require("fs-extra");
const path = require("path");
const geminiAIModel = require(path.join(__dirname, "../modules/gemini/index"));
const { processSticker } = require(path.join(__dirname, "../modules/sticker/sticker"));

const { getGroupAdmins, getFileBuffer } = require(path.join(__dirname, "../utils/functions"));

const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);

const fetch = require("node-fetch");

const messageController = require(path.join(__dirname, "./messageController"));

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
    const { groupAdmins } = await getGroupContext(client, from, info);

    const text = args.join(" ");
    const sleep = async ms => new Promise(resolve => setTimeout(resolve, ms));
    const BotNumber = client.user.id.split(":")[0] + "@s.whatsapp.net";
    const context = {
      isOwner: config.owner.number.includes(sender),
      isGroupAdmins: groupAdmins ? groupAdmins.includes(sender) : false,
      isBotGroupAdmins: groupAdmins ? groupAdmins.includes(BotNumber) : false
    };

    const enviar = async texto => {
      await client.sendMessage(from, { text: texto }, { quoted: info });
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

      case "sticker":
      case "s": {
        await processSticker(client, info, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer);
        break;
      }
      
      case "cat":
        if (!context.isOwner && info.key.remoteJid !== "120363047659668203@g.us") {
          enviar("ops, você não tem permissão para usar este comando.");
          break;
        }
        if (!text || typeof text !== "string" || text.trim().length < 1) {
          enviar("ops você não enviou o texto para ser processado.");
          break;
        }
        geminiAIModel(text)
          .then(result => {
            console.log(result, "info");
            if (result.status === "success") {
              enviar(result.response);
            } else {
              enviar(`❌ Error: ${result.message}`);
            }
          })
          .catch(error => {
            console.log("Unexpected error:", "error");
            enviar("ops ocorreu um erro inesperado.");
          });
        break;

      

      case "exec": {
        if (!context.isOwner) {
          enviar("Este comando é restrito ao owner.");
          break;
        }
        if (!args.length) {
          enviar("Envie o código para executar.");
          break;
        }
        const codeToExecute = args.join(" ");
        try {
          let result = await eval(`(async () => { ${codeToExecute} })()`);
          if (typeof result !== "string") result = JSON.stringify(result, null, 2);
          console.log(result);
          enviar(`Operação executada com sucesso:\n${result}`);
        } catch (error) {
          enviar(`Erro na execução: ${error.message}`);
        }
        break;
      }
      case "teste":
        {
          await enviar("testando");
        }
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
      console.info(`O arquivo "${file}" foi atualizado.`);
      try {
        delete require.cache[file];
        require(file);
      } catch (err) {
        console.error(`Erro ao recarregar o arquivo ${file}:`, err);
      }
    }, 100);
  }
});

watcher.on("error", err => {
  console.error(`Watcher error no arquivo ${file}:`, err);
});
