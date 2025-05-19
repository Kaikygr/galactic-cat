const logger = require('../utils/logger');
const config = require('../config/options.json');
require('dotenv').config();

async function sendWelcomeMessage(userId, userName, client, from, info, expirationMessage, ownerName, ownerNumber) {
  const shouldSendWelcome = process.env.SEND_WELCOME_MESSAGES === 'true';
  if (!shouldSendWelcome) {
    logger.info('Pulando mensagem de boas-vindas devido à configuração', {
      label: 'sendWelcomeMessage',
      userId,
      userName,
      reason: 'SEND_WELCOME_MESSAGES não está true',
    });
    return;
  }

  logger.debug('Iniciando processo de envio de mensagem de boas-vindas', {
    label: 'sendWelcomeMessage',
    userId,
    userName,
  });

  try {
    const botConfig = config?.bot || {};
    const onboarding = botConfig.onboarding || {};
    const ownerWhatsappLink = config?.owner?.whatsapp || '';
    const botName = botConfig.name || 'Assistente Virtual';

    logger.debug('Configurações carregadas para mensagem de boas-vindas', {
      label: 'sendWelcomeMessage',
      botName,
      hasOnboarding: !!onboarding.firstInteractionMessage,
    });

    const defaultTemplate = `Olá {userName}! 👋\n\n📱 *Bem-vindo(a) ao ${botName}*\n\n💫 *Recursos Disponíveis*:\n▸ Stickers\n▸ Inteligência Artificial\n▸ Gerenciamento de Grupos\n▸ E muito mais!\n\n📌 *Como Usar*:\nDigite {prefix}menu para ver comandos\n\n💬 *Precisa de Ajuda?*\nContato: {ownerWhatsappLink}\n\nAproveite! ✨`;

    const template = onboarding.firstInteractionMessage || defaultTemplate;
    const prefix = process.env.BOT_GLOBAL_PREFIX;

    const welcomeMessage = template
      .replace(/{userName}/g, userName?.trim() || 'usuário')
      .replace(/{ownerName}/g, ownerName || 'o desenvolvedor')
      .replace(/{prefix}/g, prefix)
      .replace(/{ownerWhatsappLink}/g, ownerWhatsappLink)
      .replace(/{botName}/g, botName);

    logger.debug('Mensagem de boas-vindas preparada, iniciando envio', {
      label: 'sendWelcomeMessage',
      userId,
      userName,
      messageLength: welcomeMessage.length,
    });

    await client.sendMessage(from, { text: welcomeMessage }, { quoted: info, ephemeralExpiration: expirationMessage });

    logger.info('Mensagem de boas-vindas enviada com sucesso', {
      label: 'sendWelcomeMessage',
      userId,
      userName,
      success: true,
    });
  } catch (error) {
    logger.error('Erro ao enviar mensagem de boas-vindas', {
      label: 'sendWelcomeMessage',
      userId,
      userName,
      error: error.message,
      stack: error.stack,
    });
  }
}

module.exports = {
  sendWelcomeMessage,
};
