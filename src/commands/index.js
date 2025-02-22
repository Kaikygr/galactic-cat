/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

require("dotenv").config();

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
const fetch = require("node-fetch");

async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    const from = info.key.remoteJid;
    await client.readMessages([info.key]);

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

    // Função auxiliar para processar o comando sticker.
    const processStickerCommand = async (info, sender, from) => {
      let encmedia, mediaBuffer, mediaPath, mediaExtension;
      
      // Define o tamanho padrão
      let outputSize = "512:512";
      // Se os argumentos do comando incluírem "original", usa esse valor
      if (!text.includes("original")) {
        outputSize = "original";
        // Opcionalmente remova a palavra "original" dos args para evitar conflitos
        // args = args.filter(arg => arg !== "original");
      }
      
      // Verifica se é um sticker animado (vídeo)
      if ((isMedia && info.message.videoMessage) || isQuotedVideo) {
        const videoDuration = isMedia && info.message.videoMessage
          ? info.message.videoMessage.seconds
          : info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage.seconds;
        if (videoDuration >= (isQuotedVideo ? 35 : 11)) {
          return enviar("Vídeo muito longo para sticker animada.");
        }
        encmedia = isQuotedVideo
          ? info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage
          : info.message.videoMessage;
        mediaBuffer = await getFileBuffer(encmedia, "video");
        mediaExtension = ".mp4";
      }
      // Caso de imagem
      else if ((isMedia && !info.message.videoMessage) || isQuotedImage) {
        encmedia = isQuotedImage
          ? info.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage
          : info.message.imageMessage;
        mediaBuffer = await getFileBuffer(encmedia, "image");
        mediaExtension = ".jpg";
      }
      else {
        return enviar("Envie ou cite uma imagem ou vídeo para criar o sticker.");
      }
      
      // Gera um arquivo temporário com a mídia
      mediaPath = path.join("src", "temp", `temp_${Date.now()}${mediaExtension}`);
      fs.writeFileSync(mediaPath, mediaBuffer);
      
      try {
        // Cria o sticker e obtém o caminho final do arquivo, passando o outputSize determinado
        const stickerPath = await createSticker(
          mediaPath,
          `User: ${info.pushName || sender}`,
          `Owner: ${config.owner.name}`,
          outputSize
        );
        // Envia o sticker lido do arquivo final
        await client.sendMessage(from, { sticker: fs.readFileSync(stickerPath) }, { quoted: info });
      } catch (error) {
        enviar(`Erro: ${error.message}`);
      }
      fs.unlinkSync(mediaPath);
    };

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
      case "s":
      {
        await processStickerCommand(info, sender, from);
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

      case "instadl": {
        if (!args.length) {
          enviar("Forneça o link do Instagram.");
          break;
        }
        // Novo retorno para o usuário
        enviar("Aguarde, processando...");
        const instaUrl = args[0];
        try {
          const apiKey = process.env.INSTA_API_KEY;
          if (!apiKey) {
            enviar("INSTA_API_KEY não configurado.");
            break;
          }
          const apiEndpoint = `https://zero-two.online/api/dl/multidl?url=${encodeURIComponent(instaUrl)}&apikey=${apiKey}`;
          const response = await fetch(apiEndpoint);
          const result = await response.json();
          if (!result.medias || result.medias.length === 0) {
            enviar("Nenhuma mídia encontrada.");
            break;
          }
          if (result.medias.length > 1) {
            // Suporte para múltiplas mídias
            for (let i = 0; i < result.medias.length; i++) {
              const media = result.medias[i];
              if (media.videoAvailable) {
                await client.sendMessage(from, { video: { url: media.url }, caption: i === 0 ? result.title || "" : "" }, { quoted: info });
              } else {
                await client.sendMessage(from, { image: { url: media.url }, caption: i === 0 ? result.title || "" : "" }, { quoted: info });
              }
            }
          } else {
            // Tratamento para única mídia
            const media = result.medias[0];
            if (media.videoAvailable) {
              await client.sendMessage(from, { video: { url: media.url }, caption: result.title || "" }, { quoted: info });
            } else {
              await client.sendMessage(from, { image: { url: media.url }, caption: result.title || "" }, { quoted: info });
            }
          }
        } catch (error) {
          console.error(error);
          enviar("Erro ao baixar o conteúdo do Instagram.");
        }
        break;
      }
      case "tiktok": {
        if (!args.length) {
          enviar("Forneça o link do TikTok.");
          break;
        }
        enviar("Aguarde, processando...");
        const tiktokUrl = args[0];
        try {
          const apiKey = process.env.TIKTOK_API_KEY;
          if (!apiKey) {
            enviar("TIKTOK_API_KEY não configurado.");
            break;
          }
          const apiEndpoint = `https://zero-two.online/download/tiktok?url=${encodeURIComponent(tiktokUrl)}&apikey=${apiKey}`;
          const response = await fetch(apiEndpoint);
          const result = await response.json();
          if (!result.status || !result.resultado) {
            enviar("Erro ao processar o TikTok.");
            break;
          }
          const videoUrl = result.resultado.videoSemMarca;
          await client.sendMessage(from, { video: { url: videoUrl }, caption: `Vídeo sem marca` }, { quoted: info });
        } catch (error) {
          console.error(error);
          enviar("Erro ao baixar o conteúdo do TikTok.");
        }
        break;
      }
      case "ytaudio": {
        if (!args.length) {
          enviar("Forneça o link do YouTube.");
          break;
        }
        enviar("Aguarde, processando...");
        const ytUrl = args[0];
        try {
          const apiKey = process.env.YTAUDIO_API_KEY;
          if (!apiKey) {
            enviar("YTAUDIO_API_KEY não configurado.");
            break;
          }
          const apiEndpoint = `https://zero-two.online/api/dl/ytaudio2?url=${encodeURIComponent(ytUrl)}&apikey=${apiKey}`;
          // Como a API retorna o audio diretamente, obtenha o buffer da resposta
          const response = await fetch(apiEndpoint);
          const audioBuffer = await response.buffer();
          await client.sendMessage(from, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: info });
        } catch (error) {
          console.error(error);
          enviar("Erro ao baixar o áudio do YouTube.");
        }
        break;
      }
      case "ytvideo": {
        if (!args.length) {
          enviar("Forneça o link do YouTube.");
          break;
        }
        enviar("Aguarde, processando...");
        const ytUrl = args[0];
        try {
          const apiKey = process.env.YTVIDEO_API_KEY;
          if (!apiKey) {
            enviar("YTVIDEO_API_KEY não configurado.");
            break;
          }
          const apiEndpoint = `https://zero-two.online/api/dl/ytvideo2?url=${encodeURIComponent(ytUrl)}&apikey=${apiKey}`;
          const response = await fetch(apiEndpoint);
          const videoBuffer = await response.buffer();
          await client.sendMessage(from, { video: videoBuffer, mimetype: "video/mp4" }, { quoted: info });
        } catch (error) {
          console.error(error);
          enviar("Erro ao baixar o vídeo do YouTube.");
        }
        break;
      }
      case "play": {
        if (!args.length) {
          enviar("Forneça o nome para pesquisa no YouTube. Ex: play nome_da_musica video");
          break;
        }
        const validOptions = ["video", "audio", "ambos"];
        let potentialOption = args[args.length - 1].toLowerCase();
        let option, query;
        if (validOptions.includes(potentialOption)) {
          option = potentialOption;
          query = args.slice(0, -1).join(" ");
        } else {
          option = "audio";
          query = args.join(" ");
        }
        if (!query) {
          enviar("Forneça o nome para pesquisa no YouTube.");
          break;
        }
        enviar("Aguarde, processando sua busca...");
        try {
          const searchApiKey = process.env.YTSRC_API_KEY;
          if (!searchApiKey) {
            enviar("YTSRC_API_KEY não configurado.");
            break;
          }
          const searchEndpoint = `https://zero-two.online/api/ytsrc?q=${encodeURIComponent(query)}&apikey=${searchApiKey}`;
          const searchRes = await fetch(searchEndpoint);
          const contentType = searchRes.headers.get("content-type") || "";
          let searchResult;
          if (contentType.includes("application/json")) {
            searchResult = await searchRes.json();
          } else {
            const textResult = await searchRes.text();
            console.error("Resposta não JSON:", textResult);
            enviar("Erro: resposta inválida da busca.");
            break;
          }
          if (!searchResult.status || !searchResult.resultado || searchResult.resultado.length === 0) {
            enviar("Nenhum vídeo encontrado para essa pesquisa.");
            break;
          }
          const videoInfo = searchResult.resultado[0];
          const caption = `🎵 Título: ${videoInfo.title}
⏱ Duração: ${videoInfo.duration.timestamp}
👁 Visualizações: ${videoInfo.views}
✍️ Autor: ${videoInfo.author.name}
🔗 Link: ${videoInfo.url}
📝 Descrição: ${videoInfo.description.substring(0, 20)}...`;

          if (option === "video" || option === "ambos") {
            const ytVideoApiKey = process.env.YTVIDEO_API_KEY;
            if (!ytVideoApiKey) {
              enviar("YTVIDEO_API_KEY não configurado.");
              break;
            }
            const videoDownloadEndpoint = `https://zero-two.online/api/dl/ytvideo2?url=${encodeURIComponent(videoInfo.url)}&apikey=${ytVideoApiKey}`;
            const videoRes = await fetch(videoDownloadEndpoint);
            if (!videoRes.ok) {
              enviar("Erro ao baixar o vídeo.");
              break;
            }
            const videoBuffer = await videoRes.buffer();
            await client.sendMessage(from, { video: videoBuffer, mimetype: "video/mp4", caption: option === "video" ? caption : "" }, { quoted: info });
          }

          if (option === "audio" || option === "ambos") {
            const ytAudioApiKey = process.env.YTAUDIO_API_KEY;
            if (!ytAudioApiKey) {
              enviar("YTAUDIO_API_KEY não configurado.");
              break;
            }
            const audioDownloadEndpoint = `https://zero-two.online/api/dl/ytaudio2?url=${encodeURIComponent(videoInfo.url)}&apikey=${ytAudioApiKey}`;
            const audioRes = await fetch(audioDownloadEndpoint);
            if (!audioRes.ok) {
              enviar("Erro ao baixar o áudio.");
              break;
            }
            const audioBuffer = await audioRes.buffer();
            // Envia imagem com thumbnail e descrição
            await client.sendMessage(from, { image: { url: videoInfo.thumbnail }, caption: caption }, { quoted: info });
            // Envia o áudio
            await client.sendMessage(from, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: info });
          }
        } catch (error) {
          console.error(error);
          enviar("Erro ao processar a pesquisa do YouTube.");
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
