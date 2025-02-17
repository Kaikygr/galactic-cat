/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const fs = require("fs-extra");
const path = require("path");
const texts = require(path.join(__dirname, "../../data/jsons/texts.json"));
const { geminiAIModel } = require(path.join(__dirname, "exports.js"));
const { logMessageInfo } = require(path.join(__dirname, "messageLogs.js"));

const { getGroupAdmins } = require(path.join(
  __dirname,
  "../../utils/functions.js"
));

const ConfigfilePath = path.join(__dirname, "../../auth/data/options.json");
const config = require(ConfigfilePath);

async function connectToWhatsApp() {
  module.exports = client = async client => {
    module.exports = upsert = async (upsert, client) => {
      async function WhatsappUpsert() {
        for (const info of upsert?.messages || []) {
          const from = info.key.remoteJid;

          if (!info.message) return;
          if (upsert.type == "append") return;

          const baileys = require("@whiskeysockets/baileys");
          const content = JSON.stringify(info.message);
          const nome = info.pushName ? info.pushName : "";
          const quoted = info.quoted ? info.quoted : info;
          const type = baileys.getContentType(info.message);
          var body =
            info.message?.conversation ||
            info.message?.viewOnceMessageV2?.message?.imageMessage?.caption ||
            info.message?.viewOnceMessageV2?.message?.videoMessage?.caption ||
            info.message?.imageMessage?.caption ||
            info.message?.videoMessage?.caption ||
            info.message?.extendedTextMessage?.text ||
            info.message?.viewOnceMessage?.message?.videoMessage?.caption ||
            info.message?.viewOnceMessage?.message?.imageMessage?.caption ||
            info.message?.documentWithCaptionMessage?.message?.documentMessage
              ?.caption ||
            info.message?.buttonsMessage?.imageMessage?.caption ||
            info.message?.buttonsResponseMessage?.selectedButtonId ||
            info.message?.listResponseMessage?.singleSelectReply
              ?.selectedRowId ||
            info.message?.templateButtonReplyMessage?.selectedId ||
            (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage
              ?.paramsJson
              ? JSON.parse(
                  info.message?.interactiveResponseMessage
                    ?.nativeFlowResponseMessage?.paramsJson
                )?.id
              : null) ||
            info?.text ||
            "";

          var budy =
            type === "conversation"
              ? info.message?.conversation
              : type === "extendedTextMessage"
              ? info.message?.extendedTextMessage?.text
              : "";

          const prefixes = Array.isArray(config.prefix)
            ? config.prefix
            : [config.prefix];
          const isCmd = prefixes.some(p => body.startsWith(p));
          const usedPrefix = prefixes.find(p => body.startsWith(p)) || "";
          const comando = isCmd
            ? body
                .slice(usedPrefix.length)
                .trim()
                .split(/ +/)
                .shift()
                .toLocaleLowerCase()
            : null;
          const args = isCmd ? body.trim().split(/ +/).slice(1) : [];

          const isGroup = from.endsWith("@g.us");
          const sender = isGroup ? info.key.participant : info.key.remoteJid;
          const groupMetadata = isGroup ? await client.groupMetadata(from) : "";
          const groupName = isGroup ? groupMetadata.subject : "";
          const groupDesc = isGroup ? groupMetadata.desc : "";
          const groupMembers = isGroup ? groupMetadata.participants : "";
          const groupAdmins = isGroup ? getGroupAdmins(groupMembers) : "";
          const messagesC = budy
            .slice(0)
            .trim()
            .split(/ +/)
            .shift()
            .toLowerCase();

          const text = args.join(" ");
          const mime = (quoted.info || quoted).mimetype || "";
          const sleep = async ms => {
            return new Promise(resolve => setTimeout(resolve, ms));
          };
          const mentions = (teks, memberr, id) => {
            id == null || id == undefined || id == false
              ? client.sendMessage(from, {
                  text: teks.trim(),
                  mentions: memberr
                })
              : client.sendMessage(from, {
                  text: teks.trim(),
                  mentions: memberr
                });
          };

          const isBot = info.key.fromMe ? true : false;
          const isOwner = config.owner.number.includes(sender);
          const BotNumber = client.user.id.split(":")[0] + "@s.whatsapp.net";
          const isGroupAdmins = groupAdmins.includes(sender) || false;
          const isBotGroupAdmins = groupAdmins.includes(BotNumber) || false;

          const enviar = async texto => {
            await client.sendMessage(from, { text: texto }, { quoted: info });
          };

          const typeMapping = {
            imageMessage: "Image",
            videoMessage: "Video",
            audioMessage: "Audio",
            viewOnceMessageV2: "View Once",
            stickerMessage: "Sticker",
            contactMessage: "Contact",
            locationMessage: "Location",
            productMessage: "Product"
          };

          const isMedia = [
            "imageMessage",
            "videoMessage",
            "audioMessage"
          ].includes(type);
          typeMessage = body.substr(0, 50).replace(/\n/g, "") || "Unknown";

          if (typeMapping[type]) {
            typeMessage = typeMapping[type];
          }

          const isQuotedMsg =
            type === "extendedTextMessage" && content.includes("textMessage");
          const isQuotedImage =
            type === "extendedTextMessage" && content.includes("imageMessage");
          const isQuotedVideo =
            type === "extendedTextMessage" && content.includes("videoMessage");
          const isQuotedDocument =
            type === "extendedTextMessage" &&
            content.includes("documentMessage");
          const isQuotedAudio =
            type === "extendedTextMessage" && content.includes("audioMessage");
          const isQuotedSticker =
            type === "extendedTextMessage" &&
            content.includes("stickerMessage");
          const isQuotedContact =
            type === "extendedTextMessage" &&
            content.includes("contactMessage");
          const isQuotedLocation =
            type === "extendedTextMessage" &&
            content.includes("locationMessage");
          const isQuotedProduct =
            type === "extendedTextMessage" &&
            content.includes("productMessage");

          const messageType = baileys.getContentType(info.message);
          const groupId = isGroup ? groupMetadata.id : "";

          logMessageInfo(info, {
            messageType,
            isGroup,
            groupName,
            groupId
          }); 

          switch (comando) {
            case "cat":
              if (isOwner && info.key.remoteJid !== "120363047659668203@g.us") {
                enviar(texts.cat_perm_denied);
                break;
              }
              if (!text || typeof text !== "string" || text.trim().length < 1) {
                enviar(texts.cat_invalid_input);
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
                  enviar(texts.cat_unexpected_error);
                });
              break;

            case "top5":
              case "rank":
              {
                const { getGeneralRanking } = require('../db/rankings');
                getGeneralRanking((err, rows) => {
                  if (err) {
                    enviar("Erro ao obter o ranking.");
                  } else if (!rows || rows.length === 0) {
                    enviar("Nenhum ranking disponível.");
                  } else {
                    rows = rows.slice(0, 5);
                    const medalhas = ["🥇", "🥈", "🥉", "🎖", "🏅"];
                    let msg = "📊 *Top 5 Usuários Mais Ativos!* 🚀🔥\n\n";
                    rows.forEach((row, index) => {
                      const userNumber = "@" + row.userId.split('@')[0];
                      const formattedDate = new Date(row.lastMessageDate).toLocaleString('pt-BR');
                      msg += `${medalhas[index]} *${row.userName}* (${userNumber})\n💬 *${row.count} mensagens*\n⏳ *Última as:*  ${formattedDate}\n\n`;
                    });
                    msg += "\n📢 *Continue interagindo e suba no ranking!* 🚀💬";
                    const mentionList = rows.map(row => row.userId);
                    client.sendMessage(from, { text: msg, mentions: mentionList }, { quoted: info });
                  }
                });
              }
              break;
          }
        }
      }

      WhatsappUpsert().catch(async e => {
        if (String(e).includes("this.isZero")) {
          file = require.resolve("./commands/index.js");
          delete require.cache[file];
          require(file);
        } else {
          return console.log(e);
        }
      });
    };
  };
}

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.info(`O arquivo "${__filename}" foi atualizado.`);
  delete require.cache[file];
  require(file);
});

connectToWhatsApp().catch(async e => {
  console.error(`Erro no arquivo "./index.js": ${e}`);
});
