require("dotenv").config();

const path = require("path");
const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);
const logger = require("../utils/logger");

const { processSticker } = require(path.join(__dirname, "../modules/stickerModule/processStickers"));
const { getFileBuffer } = require(path.join(__dirname, "../utils/getFileBuffer"));
const { preProcessMessage, isCommand, processQuotedChecks, getExpiration } = require(path.join(__dirname, "./messageTypeController"));
const { processPremiumStatus } = require("../database/processUserPremium");
const { processGeminiCommand, processSetPromptCommand } = require("../modules/geminiModule/geminiCommand");
const { checkRateLimit } = require("../controllers/rateLimitController");
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
    const processCommand = isCommand(body, config.bot.globalSettings.prefix);
    if (!processCommand) return;

    if (processCommand?.isCommand) {
      const { command, args } = processCommand;
      const text = args ? args.join(" ") : "";
      const content = JSON.stringify(info.message);

      const isOwner = sender === config.owner.number;
      const ownerPhoneNumber = config.owner.number;
      const ownerName = config.owner.name;

      if (!isOwner) {
        const rateLimitResult = await checkRateLimit(sender, command);
        if (!rateLimitResult.allow) {
          logger.info(`[handleWhatsAppUpdate] Rate limit hit for ${sender} on command ${command}.`);
          await client.sendMessage(from, { react: { text: "⏱️", key: info.key } });
          await client.sendMessage(from, { text: rateLimitResult.message }, { quoted: info, ephemeralExpiration: expirationMessage });
          return;
        }
      } else {
        logger.info(`[handleWhatsAppUpdate] Owner ${sender} bypassed rate limit check for command ${command}.`);
      }

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
      const isGroupAdmin = isGroup ? getGroupAdmins(groupMeta?.participants || []).includes(sender) : false; // Added null check for participants

      const isQuotedUser = Object.entries(info.message || {}).reduce((acc, [_, value]) => {
        if (value?.contextInfo) {
          const mencionados = value.contextInfo.mentionedJid || [];
          const participante = value.contextInfo.participant ? [value.contextInfo.participant] : [];
          return [...acc, ...mencionados, ...participante];
        }
        return acc;
      }, []);

      switch (command) {
        case "cat":
          await processGeminiCommand(client, info, sender, from, text, expirationMessage);
          break;

        case "setia":
          await processSetPromptCommand(client, info, sender, from, args);
          break;

        case "s": {
          await processSticker(client, info, expirationMessage, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer);
          break;
        }
        case "p": {
          if (!isOwner) {
            logger.warn(`[handleWhatsAppUpdate] Non-owner ${sender} attempted to use premium command 'p'.`);
            return client.sendMessage(
              from,
              {
                text: "❌ Apenas o dono do bot pode executar este comando.",
              },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
          }

          const parts = text.trim().split(/\s+/);
          const potentialNumber = parts.slice(0, -1).join(" ");
          const duration = parts.slice(-1)[0];

          if (!potentialNumber || !duration || !/^\d+$/.test(duration.replace(/(days|d|horas|h|minutos|m)$/i, ""))) {
            logger.warn(`[handleWhatsAppUpdate] Invalid format for 'p' command by ${sender}. Text: "${text}"`);
            return client.sendMessage(
              from,
              {
                text: "❌ Formato inválido!\nUso: `!p <número> <duração>`\nEx: `!p +55 11 999998888 30d` ou `!p @mention 7days`\n\nDuração: `30d` (dias), `24h` (horas), `60m` (minutos)",
              },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
          }

          // Handle mentioned user
          let targetUser = potentialNumber.trim();
          if (info.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetUser = info.message.extendedTextMessage.contextInfo.mentionedJid[0];
            logger.info(`[handleWhatsAppUpdate] 'p' command target identified via mention: ${targetUser}`);
          } else {
            // Basic sanitation/formatting for manually entered numbers
            targetUser = targetUser.replace(/[^0-9+]/g, ""); // Remove non-numeric except +
            if (!targetUser.includes("@s.whatsapp.net")) {
              // Attempt to format - THIS IS A GUESS, adjust based on common inputs
              if (targetUser.startsWith("+") && targetUser.length > 10) {
                // Basic international format check
                targetUser = `${targetUser}@s.whatsapp.net`;
              } else if (targetUser.length >= 10 && targetUser.length <= 13) {
                // Assume BR number if not international
                targetUser = `55${targetUser}@s.whatsapp.net`; // Add BR code
              } else {
                logger.warn(`[handleWhatsAppUpdate] Could not reliably format phone number for 'p' command: ${potentialNumber}`);
                return client.sendMessage(from, { text: `❌ Número de telefone "${potentialNumber}" parece inválido. Tente mencionar o usuário ou usar o formato internacional (+55 DDD NÚMERO).` }, { quoted: info, ephemeralExpiration: expirationMessage });
              }
            }
            logger.info(`[handleWhatsAppUpdate] 'p' command target identified via text input: ${targetUser}`);
          }

          try {
            await processPremiumStatus(targetUser, duration, client, info, from, expirationMessage); // Pass more context
          } catch (error) {
            logger.error(`[handleWhatsAppUpdate] Error processing premium status for ${targetUser}:`, error);
            client.sendMessage(
              from,
              {
                text: `❌ Erro ao processar status premium: ${error.message}`,
              },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
          }
          break;
        }
        default:
          logger.info(`[handleWhatsAppUpdate] Comando desconhecido '${command}' recebido de ${sender}.`);
          //  await client.sendMessage(from, { text: `❓ Comando \`!${command}\` não reconhecido.` }, { quoted: info, ephemeralExpiration: expirationMessage });
          break;
      }
    }
    // else { // Optional: Handle non-command messages if needed
    //    logger.debug(`[handleWhatsAppUpdate] Non-command message received from ${sender}. Body: ${body ? body.substring(0, 50) : 'N/A'}`);
    // }
  }
}

module.exports = handleWhatsAppUpdate;
