// /home/kaiky/Área de trabalho/dev/src/controllers/botController.js
require("dotenv").config();

const path = require("path");
const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);
const logger = require("../utils/logger");
const moment = require("moment-timezone"); // Ensure moment is required

const { processSticker } = require(path.join(
  __dirname,
  "../modules/stickerModule/processStickers"
));
const { getFileBuffer } = require(path.join(
  __dirname,
  "../utils/getFileBuffer"
));
const {
  preProcessMessage,
  isCommand,
  processQuotedChecks,
  getExpiration,
} = require(path.join(__dirname, "./messageTypeController"));
const { processPremiumStatus } = require("../database/processUserPremium");
const {
  processGeminiCommand,
  processSetPromptCommand,
} = require("../modules/geminiModule/geminiCommand");
const { checkRateLimit } = require("../controllers/rateLimitController");
const welcomeHandlers = require("../modules/groupsModule/welcome/welcomeCommands");
const { logCommandAnalytics } = require("../database/processDatabase"); // <-- Import the new function

async function handleWhatsAppUpdate(upsert, client) {
  for (const info of upsert?.messages || []) {
    if (!info.key || !info.message) continue; // Use continue for cleaner loop
    if (info?.key?.fromMe) continue;

    const from = info?.key?.remoteJid;
    const isGroup = from?.endsWith("@g.us");
    const sender = isGroup ? info.key.participant : info.key.remoteJid;
    const userName = info?.pushName || "Desconhecido";
    const expirationMessage = getExpiration(info);

    // Ensure sender is valid before proceeding
    if (!sender) {
      logger.warn(
        "[handleWhatsAppUpdate] Could not determine sender JID. Skipping message.",
        { key: info.key }
      );
      continue;
    }

    const { type, body, isMedia } = preProcessMessage(info);
    const processCommand = isCommand(body, config.bot.globalSettings.prefix);
    if (!processCommand?.isCommand) continue; // Use continue

    const { command, args } = processCommand;
    const text = args ? args.join(" ") : "";
    const content = JSON.stringify(info.message);

    const isOwner = sender === config.owner.number;
    const ownerPhoneNumber = config.owner.number;
    const ownerName = config.owner.name;

    // --- Rate Limit Check & Analytics Logging ---
    let rateLimitResult;
    if (!isOwner) {
      // Apply rate limit check only if the user is not the owner
      rateLimitResult = await checkRateLimit(sender, command);
    } else {
      // Owner bypasses rate limit check, but we still need a result object for logging
      logger.info(
        `[handleWhatsAppUpdate] Owner ${sender} bypassed rate limit check for command ${command}.`
      );
      // Fetch premium status for logging consistency, even for owner
      const ownerIsPremium =
        await require("./rateLimitController").isUserPremium(sender); // Re-check premium for owner if needed for analytics
      rateLimitResult = {
        status: "allowed",
        isPremium: ownerIsPremium,
        limit: -1,
      }; // Simulate allowed status for owner
    }

    // --- Log Analytics Data ---
    try {
      await logCommandAnalytics({
        userId: sender,
        commandName: command,
        groupId: isGroup ? from : null,
        isPremiumAtExecution: rateLimitResult.isPremium, // Use status from checkRateLimit result
        executionStatus: rateLimitResult.status, // 'allowed', 'rate_limited', 'disabled', 'error'
        rateLimitCountBefore: rateLimitResult.currentCount, // Can be undefined/null
        rateLimitLimitAtExecution: rateLimitResult.limit, // Can be undefined/null
      });
    } catch (analyticsError) {
      // LogCommandAnalytics already logs its internal errors, but you could add more here if needed
      logger.error(
        `[handleWhatsAppUpdate] Critical error trying to log analytics: ${analyticsError.message}`
      );
    }
    // --- End Analytics Logging ---

    // --- Handle Rate Limit Outcome ---
    if (rateLimitResult.status !== "allowed") {
      logger.info(
        `[handleWhatsAppUpdate] Command '${command}' from ${sender} blocked. Status: ${rateLimitResult.status}`
      );
      if (rateLimitResult.message) {
        await client.sendMessage(from, {
          react: { text: "⏱️", key: info.key },
        }); // React even for disabled/error
        await client.sendMessage(
          from,
          { text: rateLimitResult.message },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
      } else if (rateLimitResult.status === "disabled") {
        // Send a generic disabled message if none provided by checkRateLimit
        await client.sendMessage(from, {
          react: { text: "🚫", key: info.key },
        });
        await client.sendMessage(
          from,
          { text: `❌ O comando \`!${command}\` está desativado.` },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
      } else if (rateLimitResult.status === "error") {
        // Send a generic error message if none provided
        await client.sendMessage(from, {
          react: { text: "⚠️", key: info.key },
        });
        await client.sendMessage(
          from,
          {
            text: `❌ Ocorreu um erro ao processar o comando \`!${command}\`. Tente novamente.`,
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
      }
      continue; // Stop processing this command
    }
    // --- End Rate Limit Handling ---

    // --- Command Execution Logic ---
    const {
      isQuotedMsg,
      isQuotedImage,
      isQuotedVideo,
      isQuotedDocument,
      isQuotedAudio,
      isQuotedSticker,
      isQuotedContact,
      isQuotedLocation,
      isQuotedProduct,
    } = processQuotedChecks(type, content);

    function getGroupAdmins(participants) {
      // ... (keep existing implementation)
      const admins = [];
      for (const participant of participants) {
        if (
          participant.admin === "admin" ||
          participant.admin === "superadmin"
        ) {
          admins.push(participant.id);
        }
      }
      return admins;
    }
    const groupMeta = isGroup
      ? await client.groupMetadata(from).catch(err => {
          logger.warn(
            `[handleWhatsAppUpdate] Failed to get groupMetadata for ${from}: ${err.message}`
          );
          return null; // Handle cases where metadata might fail (e.g., bot removed)
        })
      : null;
    const isGroupAdmin =
      isGroup && groupMeta
        ? getGroupAdmins(groupMeta?.participants || []).includes(sender)
        : false;

    const isQuotedUser = Object.entries(info.message || {}).reduce(
      (acc, [_, value]) => {
        // ... (keep existing implementation)
        if (value?.contextInfo) {
          const mencionados = value.contextInfo.mentionedJid || [];
          const participante = value.contextInfo.participant
            ? [value.contextInfo.participant]
            : [];
          return [...acc, ...mencionados, ...participante];
        }
        return acc;
      },
      []
    );

    // Wrap the switch in a try...catch for command execution errors (optional, but good practice)
    try {
      switch (command) {
        // --- NEW MENU COMMAND ---
        case "menu": {
          // ... (existing menu logic) ...
          logger.info(
            `[handleWhatsAppUpdate] Menu command executed by ${sender}.`
          );
          const commandList = Object.entries(config.commandLimits);
          const prefix = config.bot.globalSettings.prefix[0] || "!"; // Use the first prefix

          if (commandList.length === 0) {
            await client.sendMessage(
              from,
              { text: "ℹ️ Nenhum comando configurado encontrado." },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
            break;
          }

          let menuMessage = "📜 *Menu de Comandos* 📜\n\n";
          menuMessage += "Aqui estão os comandos disponíveis:\n\n";

          commandList.forEach(([cmdName, cmdDetails]) => {
            // Only show commands that are not disabled (limit !== 0)
            const limits = cmdDetails.nonPremium; // Check non-premium limit as a baseline
            if (limits && limits.limit !== 0) {
              const description =
                cmdDetails.description || "Sem descrição disponível.";
              menuMessage += `🔹 *${prefix}${cmdName}* - ${description}\n`;
            }
          });

          menuMessage += "\nUse os comandos conforme listado acima.";

          await client.sendMessage(
            from,
            { text: menuMessage },
            { quoted: info, ephemeralExpiration: expirationMessage }
          );
          break;
        }
        // --- END OF MENU COMMAND ---

        case "cat":
          await processGeminiCommand(
            client,
            info,
            sender,
            from,
            text,
            expirationMessage
          );
          break;

        case "setia":
          // Add admin/owner check if needed
          await processSetPromptCommand(client, info, sender, from, args);
          break;

        case "s": {
          await processSticker(
            client,
            info,
            expirationMessage,
            sender,
            from,
            text,
            isMedia,
            isQuotedVideo,
            isQuotedImage,
            config,
            getFileBuffer
          );
          break;
        }

        // --- Welcome Commands ---
        case "welcome": {
          await welcomeHandlers.handleWelcomeToggleCommand(
            client,
            info,
            sender,
            from,
            text,
            expirationMessage,
            isGroup,
            isGroupAdmin
          );
          break;
        }
        case "setwelcome": {
          await welcomeHandlers.handleSetWelcomeMessageCommand(
            client,
            info,
            sender,
            from,
            text,
            expirationMessage,
            isGroup,
            isGroupAdmin
          );
          break;
        }
        case "setwelcomemedia": {
          await welcomeHandlers.handleSetWelcomeMediaCommand(
            client,
            info,
            sender,
            from,
            text,
            expirationMessage,
            isGroup,
            isGroupAdmin
          );
          break;
        }
        case "setexit": {
          await welcomeHandlers.handleSetExitMessageCommand(
            client,
            info,
            sender,
            from,
            text,
            expirationMessage,
            isGroup,
            isGroupAdmin
          );
          break;
        }
        case "setexitmedia": {
          await welcomeHandlers.handleSetExitMediaCommand(
            client,
            info,
            sender,
            from,
            text,
            expirationMessage,
            isGroup,
            isGroupAdmin
          );
          break;
        }
        // --- End Welcome Commands ---

        case "p": {
          if (!isOwner) {
            logger.warn(
              `[handleWhatsAppUpdate] Non-owner ${sender} attempted 'p' command.`
            );
            // No need to send message here, rate limit check already handled non-owner attempts if 'p' is configured
            // If 'p' is NOT in commandLimits, this check is still needed.
            if (!config.commandLimits?.p) {
              // Only send message if 'p' has no limits defined (owner check is primary)
              return client.sendMessage(
                from,
                { text: "❌ Apenas o dono do bot pode executar este comando." },
                { quoted: info, ephemeralExpiration: expirationMessage }
              );
            }
            // If 'p' *is* in commandLimits, the rate limit check would have blocked non-owners if configured correctly.
            // If it reached here, it means the non-owner was allowed by rate limit config, which is unlikely for an owner command.
            // It's safer to keep the explicit owner check.
            return client.sendMessage(
              from,
              { text: "❌ Apenas o dono do bot pode executar este comando." },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
          }

          // ... (rest of the 'p' command logic remains the same) ...
          const parts = text.trim().split(/\s+/);
          // Adjust parsing if mention is the *only* thing + duration
          let potentialNumber = "";
          let duration = "";
          let targetUser = null;

          if (
            info.message?.extendedTextMessage?.contextInfo?.mentionedJid
              ?.length > 0
          ) {
            targetUser =
              info.message.extendedTextMessage.contextInfo.mentionedJid[0];
            // Assume duration is the last part if mention exists
            duration = parts.length > 0 ? parts[parts.length - 1] : "";
            logger.info(
              `[handleWhatsAppUpdate] 'p' command target identified via mention: ${targetUser}`
            );
          } else {
            // Assume number is everything except the last part
            potentialNumber = parts.slice(0, -1).join(" ").trim();
            duration = parts.length > 0 ? parts[parts.length - 1] : "";
            if (potentialNumber) {
              targetUser = potentialNumber.replace(/[^0-9+]/g, ""); // Remove non-numeric except +
              if (!targetUser.includes("@s.whatsapp.net")) {
                if (targetUser.startsWith("+") && targetUser.length > 10) {
                  targetUser = `${targetUser}@s.whatsapp.net`;
                } else if (targetUser.length >= 10 && targetUser.length <= 13) {
                  targetUser = `55${targetUser}@s.whatsapp.net`;
                } else {
                  targetUser = null; // Invalid format
                }
              }
              logger.info(
                `[handleWhatsAppUpdate] 'p' command target identified via text input: ${targetUser}`
              );
            }
          }

          // Validate duration format (allow d/h/m with optional space)
          const durationMatch = duration
            .toLowerCase()
            .match(/^(\d+)\s*(d|h|m|days|horas|minutos)?$/);

          if (!targetUser || !duration || !durationMatch) {
            logger.warn(
              `[handleWhatsAppUpdate] Invalid format for 'p' command by ${sender}. Target: ${targetUser}, Duration: "${duration}"`
            );
            return client.sendMessage(
              from,
              {
                text: "❌ Formato inválido!\nUso: `/p <@mention ou número> <duração>`\nEx: `!p @user 30d` ou `!p 5511999998888 7days`\n\nDuração: `30d` (dias), `24h` (horas), `60m` (minutos)",
              },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
          }

          // Use the matched duration string for parsing
          const durationString = durationMatch[0];

          try {
            await processPremiumStatus(
              targetUser,
              durationString,
              client,
              info,
              from,
              expirationMessage
            );
          } catch (error) {
            logger.error(
              `[handleWhatsAppUpdate] Error processing premium status for ${targetUser}:`,
              error
            );
            client.sendMessage(
              from,
              { text: `❌ Erro ao processar status premium: ${error.message}` },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
          }
          break;
        }
        default:
          logger.info(
            `[handleWhatsAppUpdate] Comando desconhecido '${command}' recebido de ${sender}.`
          );
          // Optional: Send unknown command message
          // await client.sendMessage(from, { text: `❓ Comando \`!${command}\` não reconhecido.` }, { quoted: info, ephemeralExpiration: expirationMessage });
          break;
      }
    } catch (commandError) {
      logger.error(
        `[handleWhatsAppUpdate] ❌ Error executing command '${command}' for user ${sender}: ${commandError.message}`,
        { stack: commandError.stack }
      );
      // Optional: Notify user of internal error during command execution
      await client.sendMessage(
        from,
        {
          text: `❌ Ocorreu um erro interno ao executar o comando \`!${command}\`. Por favor, tente novamente mais tarde ou contate o suporte.`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      // NOTE: We already logged the 'allowed' status in analytics.
      // You *could* update the analytics entry here to 'error', but that's more complex.
      // Logging the attempt is often sufficient for analytics.
    }
  } // End of loop through messages
}

module.exports = handleWhatsAppUpdate;
