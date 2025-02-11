/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const colors = require("ansi-colors");
const fs = require("fs-extra");
const path = require("path");

const printMessage = require("./log/console");
const { geminiAIModel } = require("./exports");

const { getGroupAdmins } = require("./../utils/functions");

const ConfigfilePath = path.join(__dirname, "data", "options.json");
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

          var body = info.message?.conversation || info.message?.viewOnceMessageV2?.message?.imageMessage?.caption || info.message?.viewOnceMessageV2?.message?.videoMessage?.caption || info.message?.imageMessage?.caption || info.message?.videoMessage?.caption || info.message?.extendedTextMessage?.text || info.message?.viewOnceMessage?.message?.videoMessage?.caption || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.documentWithCaptionMessage?.message?.documentMessage?.caption || info.message?.buttonsMessage?.imageMessage?.caption || info.message?.buttonsResponseMessage?.selectedButtonId || info.message?.listResponseMessage?.singleSelectReply?.selectedRowId || info.message?.templateButtonReplyMessage?.selectedId || (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)?.id : null) || info?.text || "";

          var budy = type === "conversation" ? info.message?.conversation : type === "extendedTextMessage" ? info.message?.extendedTextMessage?.text : "";

          const prefix = config.prefix;
          const isGroup = from.endsWith("@g.us");
          const sender = isGroup ? info.key.participant : info.key.remoteJid;
          const groupMetadata = isGroup ? await client.groupMetadata(from) : "";
          const groupName = isGroup ? groupMetadata.subject : "";
          const groupDesc = isGroup ? groupMetadata.desc : "";
          const groupMembers = isGroup ? groupMetadata.participants : "";
          const groupAdmins = isGroup ? getGroupAdmins(groupMembers) : "";
          const messagesC = budy.slice(0).trim().split(/ +/).shift().toLowerCase();
          const isCmd = body.startsWith(prefix);
          const comando = isCmd ? body.slice(1).trim().split(/ +/).shift().toLocaleLowerCase() : null;
          const args = body.trim().split(/ +/).slice(1);
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

          const isMedia = ["imageMessage", "videoMessage", "audioMessage"].includes(type);
          typeMessage = body.substr(0, 50).replace(/\n/g, "") || "Unknown";

          if (typeMapping[type]) {
            typeMessage = typeMapping[type];
          }

          const isQuotedMsg = type === "extendedTextMessage" && content.includes("textMessage");
          const isQuotedImage = type === "extendedTextMessage" && content.includes("imageMessage");
          const isQuotedVideo = type === "extendedTextMessage" && content.includes("videoMessage");
          const isQuotedDocument = type === "extendedTextMessage" && content.includes("documentMessage");
          const isQuotedAudio = type === "extendedTextMessage" && content.includes("audioMessage");
          const isQuotedSticker = type === "extendedTextMessage" && content.includes("stickerMessage");
          const isQuotedContact = type === "extendedTextMessage" && content.includes("contactMessage");
          const isQuotedLocation = type === "extendedTextMessage" && content.includes("locationMessage");
          const isQuotedProduct = type === "extendedTextMessage" && content.includes("productMessage");

          printMessage(info, type, nome, sender, isBot, isGroup);

          switch (comando) {
            case "cat":
              if (!text || typeof text !== "string" || text.trim().length < 1) {
                enviar("⚠️ You must provide a valid text input.");
                break;
              }

              geminiAIModel(text)
                .then(result => {
                  console.log(result);

                  if (result.status === "success") {
                    enviar(result.response);
                  } else {
                    enviar(`❌ Error: ${result.message}`);
                  }
                })
                .catch(error => {
                  console.error("Unexpected error:", error);
                  enviar("❌ An unexpected error occurred. Please try again later.");
                });

              break;

            default:
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
  console.log(colors.bold(`\n\n• O arquivo "${__filename}" foi atualizado.\n`));
  delete require.cache[file];
  require(file);
});

connectToWhatsApp().catch(async e => {
  console.log(colors.red(`Erro no arquivo: "./index.js": ` + e));
});
