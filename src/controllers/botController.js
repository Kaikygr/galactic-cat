require('dotenv').config();

const path = require('path');
const ConfigfilePath = path.join(__dirname, '../config/options.json');
const config = require(ConfigfilePath);
const logger = require('../utils/logger');

// --- Module Imports ---
const welcomeHandlers = require('../modules/groupsModule/welcome/welcomeCommands');
const { processSticker } = require(path.join(__dirname, '../modules/stickerModule/processStickers'));
const { processPremiumStatus } = require('../database/processUserPremium');
const { processGeminiCommand, processSetPromptCommand } = require('../modules/geminiModule/geminiCommand');

// --- Utility and Controller Imports ---
const { getFileBuffer } = require(path.join(__dirname, '../utils/getFileBuffer'));
const { preProcessMessage, isCommand, processQuotedChecks, getExpiration } = require(path.join(__dirname, './messageTypeController'));
const { checkRateLimit, isUserPremium } = require('../controllers/rateLimitController');
const { logCommandAnalytics } = require('../database/processDatabase');
const { logInteraction } = require('./userDataController');
const { sendWelcomeMessage } = require('./InteractionController');

async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    if (!info.key || !info.message) {
      continue;
    }
    if (info.key.fromMe) {
      continue;
    }

    const from = info.key.remoteJid;
    if (!from) {
      logger.warn('[handleWhatsAppUpdate] Skipping update: Could not determine remote JID.', {
        key: info.key,
      });
      continue;
    }

    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? info.key.participant : info.key.remoteJid;
    if (!sender) {
      logger.warn('[handleWhatsAppUpdate] Skipping update: Could not determine sender JID.', {
        key: info.key,
      });
      continue;
    }

    const userName = info.pushName || 'Desconhecido';
    const expirationMessage = getExpiration(info);

    const { type, body, isMedia } = preProcessMessage(info);

    // --- Command Identification ---
    const processCommand = isCommand(body, config.bot.globalSettings.prefix);
    const isCmd = processCommand?.isCommand || false; // Boolean: Is it a command?
    const command = processCommand?.command; // String: Command name (e.g., 'menu') or null
    const args = processCommand?.args; // Array: Arguments after the command or null
    const text = args ? args.join(' ') : ''; // String: Full text after the command

    // --- Owner Information ---
    const isOwner = sender === config.owner.number;
    const ownerPhoneNumber = config.owner.number;
    const ownerName = config.owner.name;

    // --- Rate Limiting & Analytics (Applied ONLY to Commands) ---
    let rateLimitResult = { status: 'allowed', isPremium: false, limit: 0, currentCount: 0 }; // Default for non-commands or allowed commands

    if (isCmd) {
      if (!isOwner) {
        rateLimitResult = await checkRateLimit(sender, command);
      } else {
        logger.info(`[handleWhatsAppUpdate] Owner ${sender} bypassed rate limit check for command ${command}.`);
        rateLimitResult.isPremium = await isUserPremium(sender);
        rateLimitResult.limit = -1;
      }

      // --- Log Command Analytics Attempt ---
      try {
        await logCommandAnalytics({
          userId: sender,
          commandName: command,
          groupId: isGroup ? from : null,
          isPremiumAtExecution: rateLimitResult.isPremium,
          executionStatus: rateLimitResult.status,
          rateLimitCountBefore: rateLimitResult.currentCount,
          rateLimitLimitAtExecution: rateLimitResult.limit,
        });
      } catch (analyticsError) {
        logger.error(`[handleWhatsAppUpdate] Critical error trying to log command analytics: ${analyticsError.message}`);
      }

      // --- Handle Rate Limit Result (Block if not allowed) ---
      if (rateLimitResult.status !== 'allowed') {
        logger.info(`[handleWhatsAppUpdate] Command '!${command}' from ${sender} blocked. Status: ${rateLimitResult.status}`);
        if (rateLimitResult.message) {
          await client.sendMessage(from, { react: { text: '⏱️', key: info.key } });
          await client.sendMessage(from, { text: rateLimitResult.message }, { quoted: info, ephemeralExpiration: expirationMessage });
        } else if (rateLimitResult.status === 'disabled') {
          await client.sendMessage(from, { react: { text: '🚫', key: info.key } });
          await client.sendMessage(from, { text: `❌ O comando \`!${command}\` está desativado.` }, { quoted: info, ephemeralExpiration: expirationMessage });
        } else if (rateLimitResult.status === 'error') {
          await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
          await client.sendMessage(
            from,
            {
              text: rateLimitResult.message || `❌ Ocorreu um erro ao processar o comando \`!${command}\`. Tente novamente.`,
            },
            { quoted: info, ephemeralExpiration: expirationMessage },
          );
        }
        continue;
      }
    }

    let wasFirstEligibleInteraction = false;
    try {
      wasFirstEligibleInteraction = await logInteraction(sender, userName, isGroup, isCmd, command, isGroup ? from : null);
    } catch (logError) {
      logger.error(`[handleWhatsAppUpdate] Error calling logInteraction for ${sender}: ${logError.message}`);
    }

    if (wasFirstEligibleInteraction) {
      try {
        await sendWelcomeMessage(sender, userName, client, from, info, expirationMessage, ownerName, ownerPhoneNumber);
      } catch (welcomeError) {
        logger.error(`[handleWhatsAppUpdate] Error calling sendWelcomeMessage for ${sender}: ${welcomeError.message}`);
      }
    }

    if (isCmd) {
      const content = JSON.stringify(info.message);
      const { isQuotedMsg, isQuotedImage, isQuotedVideo, isQuotedDocument, isQuotedAudio, isQuotedSticker, isQuotedContact, isQuotedLocation, isQuotedProduct } = processQuotedChecks(type, content);

      let isGroupAdmin = false;
      if (isGroup) {
        try {
          const groupMeta = await client.groupMetadata(from);
          const admins = (groupMeta?.participants || []).filter((p) => p.admin === 'admin' || p.admin === 'superadmin').map((p) => p.id);
          isGroupAdmin = admins.includes(sender);
        } catch (groupMetaError) {
          logger.warn(`[handleWhatsAppUpdate] Failed to get groupMetadata for admin check in ${from}: ${groupMetaError.message}`);
        }
      }

      const quotedParticipant = info.message?.extendedTextMessage?.contextInfo?.participant;
      const mentionedJids = info.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targetUsers = [...new Set([quotedParticipant, ...mentionedJids].filter((jid) => jid && jid !== sender))];

      try {
        switch (command) {
          case 'menu': {
            logger.info(`[handleWhatsAppUpdate] Menu command executed by ${sender}.`);
            const commandList = Object.entries(config.commandLimits || {});
            const prefix = config.bot.globalSettings.prefix || '/';

            if (commandList.length === 0) {
              await client.sendMessage(from, { text: 'ℹ️ Nenhum comando configurado encontrado.' }, { quoted: info, ephemeralExpiration: expirationMessage });
              break;
            }

            let menuMessage = '📜 *Menu de Comandos* 📜\n\n';
            menuMessage += 'Aqui estão os comandos disponíveis:\n\n';

            commandList.forEach(([cmdName, cmdDetails]) => {
              const limits = cmdDetails?.nonPremium;
              if (!limits || limits.limit !== 0) {
                const description = cmdDetails?.description || 'Sem descrição disponível.';
                menuMessage += `🔹 *${prefix}${cmdName}* - ${description}\n`;
              }
            });

            menuMessage += '\nUse os comandos conforme listado acima.';
            await client.sendMessage(from, { text: menuMessage }, { quoted: info, ephemeralExpiration: expirationMessage });
            break;
          }

          case 's': {
            await processSticker(client, info, expirationMessage, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer);
            break;
          }

          case 'cat':
            await processGeminiCommand(client, info, sender, from, text, expirationMessage);
            break;

          case 'setia':
            {
              await processSetPromptCommand(client, info, sender, from, args);
            }
            break;

          case 'welcome':
            await welcomeHandlers.handleWelcomeToggleCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin); // Pass isGroupAdmin for potential internal use
            break;
          case 'setwelcome':
            await welcomeHandlers.handleSetWelcomeMessageCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin);
            break;
          case 'setwelcomemedia':
            await welcomeHandlers.handleSetWelcomeMediaCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin);
            break;
          case 'setexit':
            await welcomeHandlers.handleSetExitMessageCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin);
            break;
          case 'setexitmedia':
            await welcomeHandlers.handleSetExitMediaCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin);
            break;

          case 'p': {
            if (!isOwner) {
              logger.warn(`[handleWhatsAppUpdate] Non-owner ${sender} attempted owner command 'p'.`);
              await client.sendMessage(from, { text: '❌ Apenas o dono do bot pode executar este comando.' }, { quoted: info, ephemeralExpiration: expirationMessage });
              break;
            }

            const parts = text.trim().split(/\s+/);
            let potentialNumber = '';
            let duration = '';
            let targetUserJid = null;

            if (mentionedJids.length > 0) {
              targetUserJid = mentionedJids[0];
              duration = parts.length > 0 ? parts[parts.length - 1] : '';
              logger.info(`[handleWhatsAppUpdate] 'p' command target identified via mention: ${targetUserJid}`);
            } else if (quotedParticipant) {
              targetUserJid = quotedParticipant;
              duration = parts.length > 0 ? parts[parts.length - 1] : '';
              logger.info(`[handleWhatsAppUpdate] 'p' command target identified via quote: ${targetUserJid}`);
            } else {
              potentialNumber = parts.slice(0, -1).join(' ').trim();
              duration = parts.length > 0 ? parts[parts.length - 1] : '';
              if (potentialNumber) {
                let cleanNumber = potentialNumber.replace(/[^0-9+]/g, '');
                if (!cleanNumber.includes('@s.whatsapp.net')) {
                  if (cleanNumber.startsWith('+') && cleanNumber.length > 10) {
                    targetUserJid = `${cleanNumber}@s.whatsapp.net`;
                  } else if (cleanNumber.length >= 10 && cleanNumber.length <= 13) {
                    targetUserJid = `55${cleanNumber}@s.whatsapp.net`;
                  }
                } else {
                  targetUserJid = cleanNumber;
                }
                logger.info(`[handleWhatsAppUpdate] 'p' command target identified via text input: ${targetUserJid}`);
              }
            }

            const durationMatch = duration.toLowerCase().match(/^(\d+)\s*(d|h|m|days?|horas?|minutos?)$/);

            if (!targetUserJid || !duration || !durationMatch) {
              logger.warn(`[handleWhatsAppUpdate] Invalid format for 'p' command by ${sender}. Target: ${targetUserJid}, Duration: "${duration}"`);
              await client.sendMessage(
                from,
                {
                  text: '❌ Formato inválido!\nUso: `!p <@mention/número> <duração>`\nEx: `!p @user 30d` ou `!p 55119... 7days`\n\nDuração: `30d` (dias), `24h` (horas), `60m` (minutos)',
                },
                { quoted: info, ephemeralExpiration: expirationMessage },
              );
              break;
            }

            const durationString = durationMatch[0];

            try {
              await processPremiumStatus(targetUserJid, durationString, client, info, from, expirationMessage);
            } catch (error) {
              logger.error(`[handleWhatsAppUpdate] Error processing premium status for ${targetUserJid}:`, error);
              await client.sendMessage(from, { text: `❌ Erro ao processar status premium: ${error.message}` }, { quoted: info, ephemeralExpiration: expirationMessage });
            }
            break;
          }

          default:
            logger.info(`[handleWhatsAppUpdate] Comando desconhecido '!${command}' recebido de ${sender}.`);
            // Optional: Send "unknown command" message
            // await client.sendMessage(from, { text: `❓ Comando \`!${command}\` não reconhecido.` }, { quoted: info, ephemeralExpiration: expirationMessage });
            break; // Break from default case
        }
      } catch (commandError) {
        // --- Catch Errors During Command Execution ---
        logger.error(`[handleWhatsAppUpdate] ❌ Error executing command '!${command}' for user ${sender}: ${commandError.message}`, { stack: commandError.stack });
        // Notify user of the internal error
        try {
          await client.sendMessage(
            from,
            {
              text: `❌ Ocorreu um erro interno ao executar o comando \`!${command}\`. Por favor, tente novamente mais tarde ou contate o suporte.`,
            },
            { quoted: info, ephemeralExpiration: expirationMessage },
          );
        } catch (replyError) {
          logger.error(`[handleWhatsAppUpdate] ❌ Failed to send error reply to user ${sender}: ${replyError.message}`);
        }
        // Note: Analytics already logged 'allowed'. Updating to 'error' here is complex.
      }
    } // --- End of Command Processing Block (if isCmd) ---
  } // --- End of loop through messages ---
}

module.exports = handleWhatsAppUpdate;
