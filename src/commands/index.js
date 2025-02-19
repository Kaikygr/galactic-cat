/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const fs = require("fs-extra");
const path = require("path");
const fetch = require("node-fetch");
const texts = require(path.join(__dirname, "../../data/jsons/texts.json"));
const { geminiAIModel } = require(path.join(__dirname, "exports.js"));
const { logMessageInfo } = require(path.join(__dirname, "messageLogs.js"));

const { getGroupAdmins } = require(path.join(__dirname, "../../utils/functions.js"));

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
          var body = info.message?.conversation || info.message?.viewOnceMessageV2?.message?.imageMessage?.caption || info.message?.viewOnceMessageV2?.message?.videoMessage?.caption || info.message?.imageMessage?.caption || info.message?.videoMessage?.caption || info.message?.extendedTextMessage?.text || info.message?.viewOnceMessage?.message?.videoMessage?.caption || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.documentWithCaptionMessage?.message?.documentMessage?.caption || info.message?.buttonsMessage?.imageMessage?.caption || info.message?.buttonsResponseMessage?.selectedButtonId || info.message?.listResponseMessage?.singleSelectReply?.selectedRowId || info.message?.templateButtonReplyMessage?.selectedId || (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)?.id : null) || info?.text || "";

          var budy = type === "conversation" ? info.message?.conversation : type === "extendedTextMessage" ? info.message?.extendedTextMessage?.text : "";

          const prefixes = Array.isArray(config.prefix) ? config.prefix : [config.prefix];
          const isCmd = prefixes.some(p => body.startsWith(p));
          const usedPrefix = prefixes.find(p => body.startsWith(p)) || "";
          const comando = isCmd ? body.slice(usedPrefix.length).trim().split(/ +/).shift().toLocaleLowerCase() : null;
          const args = isCmd ? body.trim().split(/ +/).slice(1) : [];

          const isGroup = from.endsWith("@g.us");
          const sender = isGroup ? info.key.participant : info.key.remoteJid;
          const groupMetadata = isGroup ? await client.groupMetadata(from) : "";
          const groupName = isGroup ? groupMetadata.subject : "";
          const groupDesc = isGroup ? groupMetadata.desc : "";
          const groupMembers = isGroup ? groupMetadata.participants : "";
          const groupAdmins = isGroup ? getGroupAdmins(groupMembers) : "";
          const messagesC = budy.slice(0).trim().split(/ +/).shift().toLowerCase();

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
            conversation: "Texto",
            extendedTextMessage: "Texto Estendido",
            imageMessage: "Imagem",
            videoMessage: "Vídeo",
            audioMessage: "Áudio",
            viewOnceMessageV2: "Visualização Única",
            viewOnceMessage: "Visualização Única",
            stickerMessage: "Sticker",
            contactMessage: "Contato",
            locationMessage: "Localização",
            productMessage: "Produto",
            documentWithCaptionMessage: "Documento",
            buttonsMessage: "Botões",
            buttonsResponseMessage: "Resposta de Botões",
            listResponseMessage: "Resposta de Lista",
            templateButtonReplyMessage: "Resposta de Template",
            interactiveResponseMessage: "Resposta Interativa",
            text: "Texto"
          };

          if (typeMapping[type]) {
            typeMessage = typeMapping[type];
          }

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

          const messageType = baileys.getContentType(info.message);
          const groupId = isGroup ? groupMetadata.id : "";

          logMessageInfo(info, {
            messageType,
            isGroup,
            groupName,
            groupId
          });

          function getTopMessageType(row) {
            const fixedKeys = new Set(["userId", "userName", "count", "lastMessageDate"]);
            let topType = null;
            let topCount = 0;
            Object.keys(row).forEach(key => {
              if (!fixedKeys.has(key) && typeof row[key] === "number") {
                if (row[key] > topCount) {
                  topCount = row[key];
                  topType = key.replace("Count", "");
                }
              }
            });
            
            const typeDescriptions = {
              conversation: "Texto",
              extendedTextMessage: "Texto de resposta",
              imageMessage: "Imagem",
              videoMessage: "Vídeo",
              audioMessage: "Áudio",
              viewOnceMessageV2: "Visualização Única",
              viewOnceMessage: "Visualização Única",
              stickerMessage: "Sticker",
              contactMessage: "Contato",
              locationMessage: "Localização",
              productMessage: "Produto",
              documentWithCaptionMessage: "Documento",
              buttonsMessage: "Botões",
              buttonsResponseMessage: "Resposta de Botões",
              listResponseMessage: "Resposta de Lista",
              templateButtonReplyMessage: "Resposta de Template",
              interactiveResponseMessage: "Resposta Interativa",
              textMessage: "Texto",
              text: "Texto"
            };
            
            return typeDescriptions[topType] || topType || "N/A";
          }

          if (isCmd) {
            await client.sendMessage(
              from,
              {
                  react: {
                      text: '🐈‍⬛',
                      key: info.key
                  }
              }
          )
            await client.readMessages([info.key]);
            await client.sendPresenceUpdate("composing", from);
            await sleep(5000);
          }

          switch (comando) {
            case "cat":
              
              if (!isOwner && info.key.remoteJid !== "120363047659668203@g.us") {
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

            case "rank":
              {
                const { getGeneralRanking } = require("../db/rankings");
                getGeneralRanking((err, rows) => {
                  if (err) {
                    enviar("Erro ao obter o ranking.");
                  } else if (!rows || rows.length === 0) {
                    enviar("Nenhum ranking disponível.");
                  } else {
                    const totalGeneral = rows.reduce((sum, r) => sum + r.count, 0);
                    const userId = isGroup ? info.key.participant : info.key.remoteJid;
                    const userRecord = rows.find(r => r.userId === userId);
                    const userCount = userRecord ? userRecord.count : 0;
                    const userPercentage = totalGeneral ? ((userCount / totalGeneral) * 100).toFixed(1) : 0;
                    const userRankIndex = rows.findIndex(row => row.userId === userId);
                    const userRank = userRankIndex >= 0 ? userRankIndex + 1 : "Não classificado";

                    const topRows = rows.slice(0, 5);
                    const medalhas = ["🥇", "🥈", "🥉", "🎖", "🏅"];
                    let msg = "📊 *Top 5 Usuários Mais Ativos!* 🚀🔥\n\n";
                    msg += `📌 *Total de mensagens:* ${totalGeneral}\n\n`;
                    topRows.forEach((row, index) => {
                      const rowPercentage = totalGeneral ? ((row.count / totalGeneral) * 100).toFixed(1) : 0;
                      const userNumber = "@" + row.userId.split("@")[0];
                      const formattedDate = new Date(row.lastMessageDate).toLocaleString("pt-BR");
                      const topType = getTopMessageType(row);
                      msg += `${medalhas[index]} *${row.userName}* (${userNumber})\n💬 *${row.count} mensagens* (${rowPercentage}% do total)\n📌 *Tipo mais usado:* ${topType}\n⏳ *Última às:* ${formattedDate}\n\n`;
                    });
                    msg += `\n📢 *Seu rank:* #${userRank}`;
                    msg += `\n📊 *Seu percentual:* ${userPercentage}% do total de mensagens`;
                    msg += `\n📢 *Continue interagindo e suba no ranking!* 🚀💬`;
                    const mentionList = topRows.map(row => row.userId);
                    client.sendMessage(from, { text: msg, mentions: mentionList }, { quoted: info });
                  }
                });
              }
              break;

            case "grank":
              {
                if (!isGroup) {
                  enviar("Este comando só pode ser utilizado em grupos.");
                  break;
                }
                const { getGroupRanking } = require("../db/rankings");
                getGroupRanking(groupId, (err, rows) => {
                  if (err) {
                    enviar("Erro ao obter o ranking do grupo.");
                  } else if (!rows || rows.length === 0) {
                    enviar("Nenhum ranking disponível para este grupo.");
                  } else {
                    const totalGroup = rows.reduce((sum, r) => sum + r.count, 0);
                    
                    let aggregated = {};
                    rows.forEach(r => {
                      Object.keys(r).forEach(key => {
                        if (!["userId", "userName", "count", "lastMessageDate"].includes(key) && typeof r[key] === "number") {
                          aggregated[key] = (aggregated[key] || 0) + r[key];
                        }
                      });
                    });
                    let groupTopType = null;
                    let groupTopCount = 0;
                    for (let key in aggregated) {
                      if (aggregated[key] > groupTopCount) {
                        groupTopCount = aggregated[key];
                        groupTopType = key.replace("Count", "");
                      }
                    }
                    const typeDescriptions = {
                      conversation: "Texto",
                      extendedTextMessage: "Texto de resposta",
                      imageMessage: "Imagem",
                      videoMessage: "Vídeo",
                      audioMessage: "Áudio",
                      viewOnceMessageV2: "Visualização Única",
                      viewOnceMessage: "Visualização Única",
                      stickerMessage: "Sticker",
                      contactMessage: "Contato",
                      locationMessage: "Localização",
                      productMessage: "Produto",
                      documentWithCaptionMessage: "Documento",
                      buttonsMessage: "Botões",
                      buttonsResponseMessage: "Resposta de Botões",
                      listResponseMessage: "Resposta de Lista",
                      templateButtonReplyMessage: "Resposta de Template",
                      interactiveResponseMessage: "Resposta Interativa",
                      textMessage: "Texto",
                      text: "Texto"
                    };
                    const groupTopMessage = typeDescriptions[groupTopType] || groupTopType || "N/A";
                    
                    const userId = info.key.participant;
                    const userRecord = rows.find(r => r.userId === userId);
                    const userCount = userRecord ? userRecord.count : 0;
                    const userPercentage = totalGroup ? ((userCount / totalGroup) * 100).toFixed(1) : 0;
                    const userRankIndex = rows.findIndex(row => row.userId === userId);
                    const userRank = userRankIndex >= 0 ? userRankIndex + 1 : "Não classificado";

                    const topRows = rows.slice(0, 5);
                    const medalhas = ["🥇", "🥈", "🥉", "🎖", "🏅"];
                    let msg = "📊 *Top 5 do Grupo - Ranking de Usuários!* 🚀🔥\n\n";
                    msg += `📌 *Total de mensagens do grupo:* ${totalGroup}\n`;
                    msg += `📌 *Tipo de mensagem mais usado no grupo:* ${groupTopMessage}\n\n`;
                    topRows.forEach((row, index) => {
                      const rowPercentage = totalGroup ? ((row.count / totalGroup) * 100).toFixed(1) : 0;
                      const userNumber = "@" + row.userId.split("@")[0];
                      const formattedDate = new Date(row.lastMessageDate).toLocaleString("pt-BR");
                      const topType = getTopMessageType(row);
                      msg += `${medalhas[index]} *${row.userName}* (${userNumber})\n💬 *${row.count} mensagens* (${rowPercentage}% do total)\n📌 *Tipo mais usado:* ${topType}\n⏳ *Última às:* ${formattedDate}\n\n`;
                    });
                    msg += `\n📢 *Seu rank no grupo:* #${userRank}`;
                    msg += `\n📊 *Seu percentual:* ${userPercentage}% do total de mensagens do grupo`;
                    msg += `\n📢 *Continue interagindo para subir no ranking do grupo!* 🚀💬`;
                    const mentionList = topRows.map(row => row.userId);
                    client.sendMessage(from, { text: msg, mentions: mentionList }, { quoted: info });
                  }
                });
              }
              break;

            case "playaudio": {
              if (!text || typeof text !== "string" || text.trim().length < 1) {
                enviar("Insira o link ou termo de busca para áudio.");
                break;
              }
              const { processDownload } = require(path.join(__dirname, "../../modules/youtube/index.js"));
              const result = await processDownload(text, "audio");
              if (result.error) {
                enviar(`❌ Error: ${result.error}`);
              } else {
                const audioBuffer = fs.readFileSync(result.filePath);
                await client.sendMessage(from, { audio: audioBuffer, mimetype: "audio/mp3" }, { quoted: info });
              }
              break;
            }

            case "playvideo": {
              if (!text || typeof text !== "string" || text.trim().length < 1) {
                enviar("Insira o link ou termo de busca para vídeo.");
                break;
              }
              const { processDownload } = require(path.join(__dirname, "../../modules/youtube/index.js"));
              const result = await processDownload(text, "video");
              if (result.error) {
                enviar(`❌ Error: ${result.error}`);
              } else {
                const videoBuffer = fs.readFileSync(result.filePath);
                await client.sendMessage(from, { video: videoBuffer, mimetype: "video/mp4" }, { quoted: info });
              }
              break;
            }
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
  delete require.cache[file]
  require(file);
});

connectToWhatsApp().catch(async e => {
  console.error(`Erro no arquivo "./index.js": ${e}`);
});
