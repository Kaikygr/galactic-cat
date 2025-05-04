const logger = require('../utils/logger');
const config = require('../config/options.json');
require('dotenv').config();

async function sendWelcomeMessage(userId, userName, client, from, info, expirationMessage, ownerName, ownerNumber) {
  const shouldSendWelcome = process.env.SEND_WELCOME_MESSAGES === 'true';
  if (!shouldSendWelcome) {
    logger.info(`[ sendWelcomeMessage ] Skipping welcome message for ${userId} due to config.`);
    return;
  }

  logger.info(`[ sendWelcomeMessage ] Sending welcome message to ${userId} (${userName}).`);

  try {
    const botConfig = config?.bot || {};
    const onboarding = botConfig.onboarding || {};
    const global = botConfig.globalSettings || {};
    const ownerWhatsappLink = config?.owner?.whatsapp || '';

    const template = onboarding.firstInteractionMessage || '👋 Bem-vindo(a)! Use `{prefix}menu` para descobrir o que posso fazer.';
    const prefix = global?.prefix?.[0] || '.';

    const welcomeMessage = template
      .replace(/{userName}/g, userName?.trim() || 'usuário')
      .replace(/{ownerName}/g, ownerName || 'o desenvolvedor')
      .replace(/{prefix}/g, prefix)
      .replace(/{ownerWhatsappLink}/g, ownerWhatsappLink);

    await client.sendMessage(userId, { text: welcomeMessage }, { quoted: info, ephemeralExpiration: expirationMessage });
    logger.info(`[sendWelcomeMessage] ✅ Mensagem enviada para ${userId}.`);
  } catch (error) {
    logger.error(`[sendWelcomeMessage] ❌ Erro ao enviar para ${userId}: ${error.message}`, { stack: error.stack });
  }
}
