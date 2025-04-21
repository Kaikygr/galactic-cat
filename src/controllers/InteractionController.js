// /home/kaiky/Área de trabalho/dev/src/controllers/InteractionController.js
const logger = require("../utils/logger");
const config = require("../config/options.json");
// No need for runQuery or ensureHasInteractedColumn here anymore

/**
 * Sends the configured welcome message to a user.
 * Called after logInteraction confirms it's the first eligible interaction.
 *
 * @param {string} userId - The user's JID.
 * @param {string} userName - The user's push name.
 * @param {object} client - The Baileys client instance.
 * @param {string} from - The JID the message came from (group or user).
 * @param {object} info - The original Baileys message info object for quoting.
 * @param {number|null} expirationMessage - Ephemeral message setting.
 * @param {string} ownerName - Bot owner's name from config.
 * @param {string} ownerNumber - Bot owner's number (JID) from config (passed but maybe not used in message).
 * @returns {Promise<void>}
 */
async function sendWelcomeMessage(userId, userName, client, from, info, expirationMessage, ownerName, ownerNumber) {
  logger.info(`[sendWelcomeMessage] Solicitado envio de boas-vindas para ${userId} (${userName}).`);
  try {
    // Get the welcome message template from config
    const welcomeMessageTemplate = config?.bot?.onboarding?.firstInteractionMessage || "👋 Bem-vindo(a)! Use `{prefix}menu` para descobrir o que posso fazer."; // Default updated slightly

    // Get necessary values from config for replacement
    const prefix = config?.bot?.globalSettings?.prefix?.[0] || "#"; // Get the first prefix or default to #
    const ownerWhatsappLink = config?.owner?.whatsapp || ""; // Get the owner's WhatsApp link

    // Replace placeholders - Use global flag 'g' in case placeholders appear multiple times
    let welcomeMessage = welcomeMessageTemplate
      .replace(/{userName}/g, userName || "usuário")
      .replace(/{ownerName}/g, ownerName || "o desenvolvedor")
      .replace(/{prefix}/g, prefix) // Add replacement for prefix
      .replace(/{ownerWhatsappLink}/g, ownerWhatsappLink); // Add replacement for WhatsApp link
    // Removed the replacement for {ownerNumber} as it's not in the recommended templates

    // Send the message
    await client.sendMessage(userId, { text: welcomeMessage }, { quoted: info, ephemeralExpiration: expirationMessage });
    logger.info(`[sendWelcomeMessage] ✅ Mensagem de boas-vindas enviada para ${userId}.`);
  } catch (error) {
    logger.error(`[sendWelcomeMessage] ❌ Erro ao enviar mensagem de boas-vindas para ${userId}: ${error.message}`, { stack: error.stack });
    // Consider re-throwing or handling the error more robustly if sending the welcome message is critical
  }
}

module.exports = {
  sendWelcomeMessage,
};
