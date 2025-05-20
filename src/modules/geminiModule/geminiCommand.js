const logger = require('../../utils/logger');
const { getFileBuffer } = require('../../utils/getFileBuffer');
const { processAIResponse, updateUserSystemInstruction } = require('./processGeminiModule');
const config = require('./../../config/options.json');

const { botPrefix } = require('./../../config/config');

async function handleEmptyGeminiInput(client, info, sender, from, expirationMessage) {
  logger.warn(`[ processGeminiCommand ] ⚠️ Comando ${botPrefix}cat recebido sem texto do usuário ${sender} em ${from}`);
  const helpMessage = `🤔 Opa! Parece que faltou o texto para o comando \`${botPrefix}cat\`

Você precisa me dizer o que fazer! Envie sua pergunta ou instrução *junto* com o comando.

*Exemplos de Uso:*
*   📝 *Texto:* \`${botPrefix}cat Qual a capital do Brasil?\`
*   🖼️ *Imagem:* Responda a uma foto de um cachorro com a mensagem: \`${botPrefix}cat Que raça é essa?\` (Sim, ele analisa imagens!)

✨ *Dica: Personalize a IA!* ✨
Use o comando \`${botPrefix}setia\` para definir como a IA deve se comportar *nas suas conversas*.
*   🧠 *Exemplo:* \`${botPrefix}setia\` Aja como um chef de cozinha italiano e me dê receitas simples\`
*   🧹 _Importante:_ Usar o \`${botPrefix}setia\` limpa seu histórico de conversa anterior com a IA para aplicar a nova instrução.`;

  try {
    await client.sendMessage(
      from,
      {
        image: { url: 'https://api.telegram.org/file/bot6369612385:AAGvQkKlh_BHBJbs9zH8rorSM84W9xQwlno/photos/file_1552.jpg' },
        caption: helpMessage, // Use caption for text accompanying an image
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    );
  } catch (sendError) {
    logger.error(`[handleEmptyGeminiInput] ❌ Falha ao enviar mensagem de ajuda para ${from}:`, sendError);
  }
}

async function sendProcessingIndicators(client, from, messageKey) {
  try {
    await Promise.all([client.sendMessage(from, { react: { text: '⏳', key: messageKey } }), client.sendPresenceUpdate('composing', from)]);
  } catch (error) {
    logger.warn(`[ sendProcessingIndicators ] ⚠️ Falha ao enviar indicadores de processamento para ${from}:`, error);
  }
}

async function getImageBufferFromInfo(info) {
  const mediaTypes = [info.message?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.imageMessage];
  const encmedia = mediaTypes.find((media) => media);

  if (encmedia) {
    logger.info('[getImageBufferFromInfo] 🖼️ Encontrada mídia de imagem para processar.');
    try {
      const imageBuffer = await getFileBuffer(encmedia, 'image');
      if (!imageBuffer) {
        logger.warn('[getImageBufferFromInfo] ⚠️ Não foi possível obter o buffer da imagem.');
        return null;
      }
      return imageBuffer;
    } catch (bufferError) {
      logger.error('[getImageBufferFromInfo] ❌ Erro ao obter buffer da imagem:', bufferError);
      return null;
    }
  }
  return null;
}

async function handleGeminiAIError(client, from, sender, text, aiError, info, expirationMessage) {
  logger.error(`[processGeminiCommand] ❌ Erro da IA para ${sender}:`, aiError);
  try {
    await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
  } catch (reactError) {
    logger.warn(`[handleGeminiAIError] ⚠️ Falha ao enviar reação de erro AI para ${from}:`, reactError);
  }

  client
    .sendMessage(
      config.owner.number,
      {
        text: `*⚠️ Erro na IA (Comando Gemini):*\n\n*De:* ${sender}\n*Chat:* ${from}\n*Texto:* ${text}\n*Erro:* \n${JSON.stringify(aiError)}`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    )
    .catch((e) => logger.error('[handleGeminiAIError] ❌ Falha ao notificar owner sobre erro da IA:', e));

  client
    .sendMessage(
      from,
      {
        text: `*⚠️ Tive um problema ao processar sua solicitação com a inteligência artificial.*\n\n_Se o problema persistir, tente novamente mais tarde ou contate o suporte._\n\n*Detalhe técnico (se ajudar):* ${aiError?.message || 'Erro desconhecido na IA'}`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    )
    .catch((e) => logger.error('[handleGeminiAIError] ❌ Falha ao enviar msg de erro da IA para o usuário:', e));
}

async function sendGeminiAISuccess(client, from, sender, responseText, info, expirationMessage) {
  logger.info(`[processGeminiCommand] ✅ Resposta da IA recebida com sucesso para ${sender} em ${from}`);
  try {
    await client.sendMessage(from, { react: { text: '🐈‍⬛', key: info.key } });
    await client.sendMessage(
      from,
      { text: responseText, mentions: [sender] },
      {
        quoted: info,
        ephemeralExpiration: expirationMessage,
      },
    );
    logger.info(`[sendGeminiAISuccess] ✅ Resposta da IA enviada com sucesso para ${from}`);
  } catch (error) {
    logger.error(`[sendGeminiAISuccess] ❌ Falha ao enviar resposta de sucesso da IA para ${from}:`, error);
  }
}

async function handleGeminiGeneralError(client, from, sender, text, error, info, expirationMessage) {
  logger.error(`[processGeminiCommand] ❌ Erro GERAL (Comando Gemini) para ${sender}:`, error);
  try {
    await client.sendMessage(from, { react: { text: '❌', key: info.key } });
  } catch (reactError) {
    logger.warn(`[handleGeminiGeneralError] ⚠️ Falha ao enviar reação de erro geral para ${from}:`, reactError);
  }

  client
    .sendMessage(
      config.owner.number,
      {
        text: `*❌ Erro GERAL (Comando Gemini):*\n\n*De:* ${sender}\n*Chat:* ${from}\n*Texto:* ${text}\n*Erro:* \n${error.message}\n*Stack:* ${error.stack}`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    )
    .catch((e) => logger.error('[handleGeminiGeneralError] ❌ Falha ao notificar owner sobre erro GERAL:', e));

  client
    .sendMessage(
      from,
      {
        text: `*❌ Ops! Algo deu errado ao processar seu comando.*\n\n_Já notifiquei o desenvolvedor sobre isso. Por favor, tente novamente mais tarde._\n\n*Se precisar de ajuda imediata, fale com:* ${config.owner.whatsapp}`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    )
    .catch((e) => logger.error('[handleGeminiGeneralError] ❌ Falha ao enviar msg de erro GERAL para o usuário:', e));
}

async function finalizeGeminiProcessing(client, from) {
  try {
    await client.sendPresenceUpdate('paused', from);
  } catch (presenceError) {
    logger.warn("[finalizeGeminiProcessing] ⚠️ Falha ao resetar presence update para 'paused':", presenceError);
  }
}

// --- Função Principal do Comando Gemini ---
async function processGeminiCommand(client, info, sender, from, text, expirationMessage) {
  if (!client || !info) {
    logger.error('[ processGeminiCommand ] ❌ Parâmetros essenciais ausentes (client ou info)');
    return;
  }

  const trimmedText = text ? text.trim() : '';
  if (!trimmedText) {
    await handleEmptyGeminiInput(client, info, sender, from, expirationMessage);
    return;
  }

  logger.info(`[ processGeminiCommand ] ⏳ Processando comando Gemini de ${sender} em ${from}. Texto: "${trimmedText}"`);

  try {
    await sendProcessingIndicators(client, from, info.key);
    const imageBuffer = await getImageBufferFromInfo(info);

    const prompt = { parts: [{ text: trimmedText }] };
    const aiResponse = await processAIResponse(prompt, imageBuffer, {}, sender);

    if (!aiResponse.success) {
      await handleGeminiAIError(client, from, sender, trimmedText, aiResponse.error, info, expirationMessage);
      return;
    }

    await sendGeminiAISuccess(client, from, sender, aiResponse.data, info, expirationMessage);
  } catch (error) {
    await handleGeminiGeneralError(client, from, sender, trimmedText, error, info, expirationMessage);
  } finally {
    await finalizeGeminiProcessing(client, from);
  }
}

// --- Funções Auxiliares para processSetPromptCommand ---

async function validateSetPromptArgs(client, info, sender, from, newInstruction) {
  if (!newInstruction || newInstruction.trim() === '') {
    logger.warn(`[processSetPromptCommand] ⚠️ Tentativa de definir instrução vazia por ${sender} em ${from}`);
    try {
      await client.sendMessage(from, { react: { text: '🤔', key: info.key } });
      await client.sendMessage(
        from,
        {
          text: `⚠️ Você precisa fornecer o texto da nova instrução após o comando.\n\n*Exemplo:* \`${botPrefix}setprompt Seja um assistente pirata divertido\``,
        },
        { quoted: info },
      );
    } catch (sendError) {
      logger.error(`[validateSetPromptArgs] ❌ Falha ao enviar mensagem de instrução vazia para ${from}:`, sendError);
    }
    return false;
  }

  if (newInstruction.length > 500) {
    logger.warn(`[processSetPromptCommand] ⚠️ Tentativa de definir instrução muito longa por ${sender} (Length: ${newInstruction.length})`);
    try {
      await client.sendMessage(from, { react: { text: '📏', key: info.key } });
      await client.sendMessage(
        from,
        {
          text: `*⚠️ A instrução é muito longa (${newInstruction.length} caracteres). O limite é de 500 caracteres.*`,
        },
        { quoted: info },
      );
    } catch (sendError) {
      logger.error(`[validateSetPromptArgs] ❌ Falha ao enviar mensagem de instrução longa para ${from}:`, sendError);
    }
    return false;
  }
  return true;
}

async function handleSetPromptUpdateSuccess(client, info, sender, from, newInstruction) {
  logger.info(`[processSetPromptCommand] ✅ Instrução do sistema atualizada e histórico limpo para ${sender}`);
  try {
    await client.sendMessage(from, { react: { text: '✅', key: info.key } });
    const successMessage = `✨ *Instrução do Sistema Atualizada!* ✨\n\n` + `🧠 Sua nova instrução para a IA foi definida como:\n` + `\`\`\`\n${newInstruction}\n\`\`\`\n\n` + `🧹 *Importante:* Para que a IA siga esta nova instrução corretamente, seu histórico de conversa anterior com ela foi limpo.\n\n` + `🚀 Tudo pronto! Você já pode usar o comando \`${botPrefix}gemini\` (ou \`${botPrefix}cat\`) novamente. A IA responderá seguindo a nova instrução que você definiu.`;
    await client.sendMessage(from, { text: successMessage }, { quoted: info });
  } catch (error) {
    logger.error(`[handleSetPromptUpdateSuccess] ❌ Falha ao enviar mensagem de sucesso para ${from}:`, error);
  }
}

async function handleSetPromptUpdateFailure(client, info, sender, from, newInstruction, updateError) {
  logger.error(`[processSetPromptCommand] ❌ Falha ao atualizar instrução para ${sender}: ${updateError}`);
  try {
    await client.sendMessage(from, { react: { text: '❌', key: info.key } });
    await client.sendMessage(
      from,
      {
        text: '❌ Ocorreu um erro ao tentar atualizar sua instrução. Parece que houve um problema interno. O desenvolvedor já foi notificado.',
      },
      { quoted: info },
    );
  } catch (sendError) {
    logger.error(`[handleSetPromptUpdateFailure] ❌ Falha ao enviar mensagem de erro de atualização para ${from}:`, sendError);
  }
  client
    .sendMessage(config.owner.number, {
      text: `*❌ Erro ao atualizar instrução (SetPrompt):*\n\n*Usuário:* ${sender}\n*Chat:* ${from}\n*Instrução Tentada:* ${newInstruction}\n*Erro:* ${updateError}`,
    })
    .catch((e) => logger.error(`[handleSetPromptUpdateFailure] ❌ Falha ao notificar owner:`, e));
}

async function handleSetPromptUnexpectedError(client, info, sender, from, newInstruction, error) {
  logger.error(`[processSetPromptCommand] 💥 Erro INESPERADO ao processar ${botPrefix}setprompt para ${sender}:`, error);
  try {
    await client.sendMessage(from, { react: { text: '❌', key: info.key } });
    await client.sendMessage(
      from,
      {
        text: '❌ Ops! Ocorreu um erro inesperado ao processar sua solicitação. O desenvolvedor foi notificado para investigar.',
      },
      { quoted: info },
    );
  } catch (sendError) {
    logger.error(`[handleSetPromptUnexpectedError] ❌ Falha ao enviar mensagem de erro inesperado para ${from}:`, sendError);
  }
  client
    .sendMessage(config.owner.number, {
      text: `*💥 Erro INESPERADO (SetPrompt):*\n\n*Usuário:* ${sender}\n*Chat:* ${from}\n*Instrução Tentada:* ${newInstruction}\n*Erro:* ${error.message}\n*Stack:* ${error.stack}`,
    })
    .catch((e) => logger.error(`[handleSetPromptUnexpectedError] ❌ Falha ao notificar owner sobre erro inesperado:`, e));
}

// --- Função Principal do Comando SetPrompt ---
/**
 * Processa o comando para definir a instrução do sistema do Gemini para um usuário.
 * Limpa o histórico de chat do usuário para aplicar a nova instrução.
 *
 * @async
 * @function processSetPromptCommand
 * @param {object} client - Instância do cliente (ex: Baileys).
 * @param {object} info - Informações da mensagem recebida.
 * @param {string} sender - Identificador do remetente da mensagem.
 * @param {string} from - ID da origem da mensagem (grupo ou privado).
 * @param {string[]} args - Argumentos passados para o comando (a nova instrução).
 * @returns {Promise<void>}
 */
async function processSetPromptCommand(client, info, sender, from, newInstructionArg) {
  const newInstruction = newInstructionArg; // Renomeando para clareza, args é geralmente um array

  if (!(await validateSetPromptArgs(client, info, sender, from, newInstruction))) {
    return;
  }

  logger.info(`[ processSetPromptCommand ] ⏳ Processando ${botPrefix}setprompt de ${sender} em ${from}. Nova instrução: "${newInstruction}"`);
  try {
    const updateResult = await updateUserSystemInstruction(sender, newInstruction);

    if (updateResult.success) {
      await handleSetPromptUpdateSuccess(client, info, sender, from, newInstruction);
    } else {
      await handleSetPromptUpdateFailure(client, info, sender, from, newInstruction, updateResult.error);
    }
  } catch (error) {
    await handleSetPromptUnexpectedError(client, info, sender, from, newInstruction, error);
  }
}

module.exports = {
  processGeminiCommand,
  processSetPromptCommand,
};
