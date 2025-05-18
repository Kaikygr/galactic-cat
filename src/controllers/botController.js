require('dotenv').config();

//a

const path = require('path');
const ConfigfilePath = path.join(__dirname, '../config/options.json');
const config = require(ConfigfilePath);
const logger = require('../utils/logger');

const welcomeHandlers = require('../modules/groupsModule/welcome/welcomeCommands');
const { processSticker } = require(path.join(__dirname, '../modules/stickerModule/processStickers'));
const { processPremiumStatus } = require('../database/processUserPremium');
const { processGeminiCommand, processSetPromptCommand } = require('../modules/geminiModule/geminiCommand');

const { getFileBuffer } = require(path.join(__dirname, '../utils/getFileBuffer'));
const { preProcessMessage, isCommand, processQuotedChecks, getExpiration } = require(path.join(__dirname, './messageTypeController'));
const { checkRateLimit, isUserPremium } = require('../controllers/rateLimitController');
const { logCommandAnalytics } = require('../database/processDatabase');
const { logInteraction } = require('./userDataController');
const { sendWelcomeMessage } = require('./InteractionController');

async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    if (!info.key || !info.message) {
      logger.debug('Mensagem ignorada: sem key ou message');
      continue;
    }
    if (info.key.fromMe) {
      logger.debug('Mensagem ignorada: enviada pelo bot');
      continue;
    }

    const from = info.key.remoteJid;
    if (!from) {
      logger.warn('Mensagem ignorada: JID remoto indeterminado', {
        messageKey: info.key,
      });
      continue;
    }

    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? info.key.participant : info.key.remoteJid;
    if (!sender) {
      logger.warn('Mensagem ignorada: JID do remetente indeterminado', {
        messageKey: info.key,
        groupId: isGroup ? from : null,
      });
      continue;
    }

    logger.debug('Processando mensagem', {
      sender,
      isGroup,
      groupId: isGroup ? from : null,
      messageType: info.message ? Object.keys(info.message)[0] : null,
    });

    const userName = info.pushName || 'Desconhecido';
    const expirationMessage = getExpiration(info);

    const { type, body, isMedia } = preProcessMessage(info);

    const processCommand = isCommand(body);
    logger.debug('Comando detectado', {
      isCommand: processCommand.isCommand,
      command: processCommand.command,
      args: processCommand.args,
    });

    const isCmd = processCommand.isCommand;
    const command = processCommand.command;
    const args = processCommand.args ?? '';
    const text = args;

    const isOwner = sender === config.owner.number;
    const ownerPhoneNumber = config.owner.number;
    const ownerName = config.owner.name;

    let rateLimitResult = { status: 'allowed', isPremium: false, limit: 0, currentCount: 0 };

    if (isCmd) {
      if (!isOwner) {
        logger.debug('Verificando rate limit', {
          sender,
          command,
          isOwner: false,
        });
        rateLimitResult = await checkRateLimit(sender, command);
      } else {
        logger.debug('Rate limit ignorado para owner', {
          sender,
          command,
        });

        rateLimitResult.isPremium = await isUserPremium(sender);
        rateLimitResult.limit = -1;
      }

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
        logger.error('Falha ao registrar analytics do comando', {
          error: analyticsError.message,
          sender,
          command,
          stack: analyticsError.stack,
        });
      }

      if (rateLimitResult.status !== 'allowed') {
        logger.info('Comando bloqueado por rate limit', {
          command,
          sender,
          status: rateLimitResult.status,
          message: rateLimitResult.message,
        });
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
            const prefix = process.env.BOT_GLOBAL_PREFIX || '.';

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

          case 's':
          case 'sticker': {
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
            await welcomeHandlers.handleWelcomeToggleCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin);
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

          default:
            logger.info(`[handleWhatsAppUpdate] Comando desconhecido '!${command}' recebido de ${sender}.`);
            // await client.sendMessage(from, { text: `❓ Comando \`!${command}\` não reconhecido.` }, { quoted: info, ephemeralExpiration: expirationMessage });
            break;
        }
      } catch (commandError) {
        logger.error(`[handleWhatsAppUpdate] ❌ Error executing command '!${command}' for user ${sender}: ${commandError.message}`, { stack: commandError.stack });
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
      }
    }
  }
}

module.exports = handleWhatsAppUpdate;
