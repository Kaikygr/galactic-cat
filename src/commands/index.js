/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const fs = require("fs-extra");
const path = require("path");
const texts = require(path.join(__dirname, "../../data/jsons/texts.json"));
const { geminiAIModel } = require(path.join(__dirname, "exports.js"));
const { logMessageInfo } = require(path.join(__dirname, "messageLogs.js"));
const { createSticker } = require(path.join(__dirname, "../../modules/sticker/sticker"));

const { getGroupAdmins, getFileBuffer } = require(path.join(__dirname, "../../utils/functions.js"));

const ConfigfilePath = path.join(__dirname, "../../auth/data/options.json");
const config = require(ConfigfilePath);

const util = require("util");
const exec = require("child_process").exec;
const execProm = util.promisify(exec);

async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    const from = info.key.remoteJid;

    if (!info.message) return;
    if (upsert.type == "append") return;
    if (info.key.fromMe) return;

    const baileys = require("@whiskeysockets/baileys");
    const content = JSON.stringify(info.message);
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

    const text = args.join(" ");
    const sleep = async ms => {
      return new Promise(resolve => setTimeout(resolve, ms));
    };
  
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

        case "sticker": 
        case "s": {
          // Se for vídeo (para sticker animado)
          if ((isMedia && info.message.videoMessage) || isQuotedVideo) {
            const videoDuration = isMedia && info.message.videoMessage
              ? info.message.videoMessage.seconds
              : (isQuotedVideo ? info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage.seconds : 0);
            if (videoDuration < 11 || (isQuotedVideo && videoDuration < 35)) {
              let encmedia = isQuotedVideo
                ? info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage
                : info.message.videoMessage;
              const mediaBuffer = await getFileBuffer(encmedia, "video");
              const mediaPath = path.join("src", "temp", `temp_${Date.now()}.mp4`);
              fs.writeFileSync(mediaPath, mediaBuffer);
              try {
                const outputPath = path.join("src", "temp", `sticker_${Date.now()}.webp`);
                await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -filter:v fps=fps=15 -lossless 1 -loop 0 -preset default -an -vsync 0 -s 200:200 "${outputPath}"`);
                // Cria o JSON com informações separadas: do usuário e do owner
                const dateFormatted = new Date().toLocaleString("pt-BR");
                const json = { 
                  "sticker-pack-name": `User: ${info.pushName || sender}`, 
                  "sticker-pack-publisher": `Owner: ${config.owner.name}`
                };
                const exifAttr = Buffer.from([
                  0x49,0x49,0x2a,0x00,
                  0x08,0x00,0x00,0x00,
                  0x01,0x00,0x41,0x57,
                  0x07,0x00,0x00,0x00,
                  0x00,0x00,0x16,0x00,
                  0x00,0x00
                ]);
                const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
                const exif = Buffer.concat([exifAttr, jsonBuff]);
                exif.writeUIntLE(jsonBuff.length, 14, 4);
                const metaPath = path.join("src", "temp", `meta_${Date.now()}.temp.exif`);
                fs.writeFileSync(metaPath, exif);
                let webpmuxPath = "";
                try {
                  webpmuxPath = (await execProm("which webpmux")).stdout.trim();
                  if (!webpmuxPath) throw new Error();
                } catch (e) {
                  throw new Error("webpmux não encontrado. Por favor, instale-o no seu sistema.");
                }
                await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${outputPath}" -o "${outputPath}"`);
                fs.unlinkSync(metaPath);
                await client.sendMessage(from, { sticker: fs.readFileSync(outputPath) }, { quoted: info });
                fs.unlinkSync(outputPath);
              } catch (error) {
                enviar(`Erro: ${error.message}`);
              }
              fs.unlinkSync(mediaPath);
            } else {
              enviar("Vídeo muito longo para sticker animada.");
            }
          }
          else if ((isMedia && !info.message.videoMessage) || isQuotedImage) {
            let encmedia = isQuotedImage
              ? info.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage
              : info.message.imageMessage;
            const mediaBuffer = await getFileBuffer(encmedia, "image");
            const mediaPath = path.join("src", "temp", `temp_${Date.now()}.jpg`);
            fs.writeFileSync(mediaPath, mediaBuffer);
            try {
              const dateFormatted = new Date().toLocaleString("pt-BR");
              const userDesc = `User: ${info.pushName || sender}`;
              const ownerDesc = `Owner: ${config.owner.name}`;
              const stickerPath = await createSticker(mediaPath, userDesc, ownerDesc);
              await client.sendMessage(from, { sticker: fs.readFileSync(stickerPath) }, { quoted: info });
              fs.unlinkSync(stickerPath);
            } catch (error) {
              enviar(`Erro: ${error.message}`);
            }
            fs.unlinkSync(mediaPath);
          } else {
            enviar("Envie ou cite uma imagem ou vídeo para criar o sticker.");
          }
        }
        break;

      case "exec": {
        if (!isOwner) {
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
          enviar(`Operação executada com sucesso:\n${result}`);
        } catch (error) {
          enviar(`Erro na execução: ${error.message}`);
        }
        break;
      }
    
    }
  }
}

module.exports = handleWhatsAppUpdate;

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.info(`O arquivo "${__filename}" foi atualizado.`);
  delete require.cache[file];
  require(file);
});
