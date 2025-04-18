const logger = require("../../utils/logger");
const { getFileBuffer } = require("../../utils/getFileBuffer");
const { processAIResponse, updateUserSystemInstruction } = require("./processGeminiModule");
const config = require("./../../config/options.json");
/**
 * Processa um comando enviado ao Gemini, interpretando texto e imagem (se houver),
 * e envia a resposta gerada pela IA de volta ao remetente.
 * Inclui feedback visual ("digitando...") e rodapé interativo.
 *
 * @async
 * @function processGeminiCommand
 * @param {object} client - Instância do cliente (ex: Baileys).
 * @param {object} info - Informações da mensagem recebida.
 * @param {string} sender - Identificador do remetente da mensagem.
 * @param {string} from - ID da origem da mensagem (grupo ou privado).
 * @param {string} text - Texto enviado pelo usuário para ser processado.
 * @param {number} expirationMessage - Tempo para expiração da mensagem (modo efêmero).
 * @returns {Promise<void>}
 */
async function processGeminiCommand(client, info, sender, from, text, expirationMessage) {
  // --- Input Validation ---
  if (!client || !info) {
    logger.error("[ processGeminiCommand ] ❌ Parâmetros essenciais ausentes (client ou info)");
    return;
  }

  const trimmedText = text ? text.trim() : "";
  if (!trimmedText) {
    logger.warn(`[ processGeminiCommand ] ⚠️ Comando Cat recebido sem texto do usuário ${sender} em ${from}`);
    try {
      // Improved message explaining usage, image support, and setprompt
      const helpMessage = `🤔 Opa! Parece que faltou o texto para o comando \`!cat\`.

Você precisa me dizer o que fazer! Envie sua pergunta ou instrução *junto* com o comando.

*Exemplos de Uso:*
*   📝 *Texto:* \`!cat Qual a capital do Brasil?\`
*   🖼️ *Imagem:* Responda a uma foto de um cachorro com a mensagem: \`!cat Que raça é essa?\` (Sim, ele analisa imagens!)

✨ *Dica: Personalize a IA!* ✨
Use o comando \`!setIA\` para definir como a IA deve se comportar *nas suas conversas*.
*   🧠 *Exemplo:* \`!setIA\` Aja como um chef de cozinha italiano e me dê receitas simples\`
*   🧹 _Importante:_ Usar o \`!setIA\` limpa seu histórico de conversa anterior com a IA para aplicar a nova instrução.`;

      await client.sendMessage(from, { text: helpMessage }, { quoted: info, ephemeralExpiration: expirationMessage });
    } catch (sendError) {
      logger.error(`[ processGeminiCommand ] ❌ Falha ao enviar mensagem de ajuda (texto vazio) para ${from}:`, sendError);
    }
    return; // Stop processing since there's no text
  }

  // --- Start Processing ---
  logger.info(`[ processGeminiCommand ] ⏳ Processando comando Gemini de ${sender} em ${from}. Texto: "${trimmedText}"`);
  let imageBuffer = null;

  try {
    await Promise.all([client.sendMessage(from, { react: { text: "⏳", key: info.key } }), client.sendPresenceUpdate("composing", from)]);

    // --- Media Handling ---
    const mediaTypes = [info.message?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.imageMessage];
    const encmedia = mediaTypes.find(media => media);

    if (encmedia) {
      logger.info(`[ processGeminiCommand ] 🖼️ Encontrada mídia de imagem para processar com o texto.`);
      try {
        imageBuffer = await getFileBuffer(encmedia, "image");
        if (!imageBuffer) {
          logger.warn("[ processGeminiCommand ] ⚠️ Não foi possível obter o buffer da imagem, continuando apenas com texto.");
        }
      } catch (bufferError) {
        logger.error("[ processGeminiCommand ] ❌ Erro ao obter buffer da imagem:", bufferError);
      }
    }

    // --- AI Interaction ---
    const prompt = { parts: [{ text: trimmedText }] };

    const aiResponse = await processAIResponse(prompt, imageBuffer, {}, sender);

    // --- Response Handling ---
    if (!aiResponse.success) {
      logger.error("[ processGeminiCommand ] ❌ Erro retornado por processAIResponse:", aiResponse.error);
      await client.sendMessage(from, { react: { text: "⚠️", key: info.key } }); // Use warning reaction for AI-specific errors

      await client
        .sendMessage(
          config.owner.number,
          {
            text: `*⚠️ Erro na IA (Comando Gemini):*\n\n*De:* ${sender}\n*Chat:* ${from}\n*Texto:* ${trimmedText}\n*Erro:* \n${JSON.stringify(aiResponse.error)}`,
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        )
        .catch(e => logger.error("[ processGeminiCommand ] ❌ Falha ao notificar owner sobre erro da IA:", e));

      await client
        .sendMessage(
          from,
          {
            text: `*⚠️ Tive um problema ao processar sua solicitação com a inteligência artificial.*\n\n_Se o problema persistir, tente novamente mais tarde ou contate o suporte._\n\n*Detalhe técnico (se ajudar):* ${aiResponse.error?.message || "Erro desconhecido na IA"}`,
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        )
        .catch(e => logger.error("[ processGeminiCommand ] ❌ Falha ao enviar msg de erro da IA para o usuário:", e));

      return;
    }

    // --- Success ---
    logger.info(`[ processGeminiCommand ] ✅ Resposta da IA recebida com sucesso para ${sender} em ${from}`);

    const responseText = aiResponse.data;

    await client.sendMessage(from, { react: { text: "🐈‍⬛", key: info.key } });
    await client.sendMessage(
      from,
      { text: responseText, mentions: [sender] },
      {
        quoted: info,
        ephemeralExpiration: expirationMessage,
      }
    );

    logger.info(`[ processGeminiCommand ] ✅ Resposta da IA enviada com sucesso para ${from}`);
  } catch (error) {
    logger.error("[ processGeminiCommand ] ❌ Erro GERAL ao processar o comando Gemini:", error);

    try {
      await client.sendMessage(from, { react: { text: "❌", key: info.key } });

      await client
        .sendMessage(
          config.owner.number,
          {
            text: `*❌ Erro GERAL (Comando Gemini):*\n\n*De:* ${sender}\n*Chat:* ${from}\n*Texto:* ${trimmedText}\n*Erro:* \n${error.message}\n*Stack:* ${error.stack}`,
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        )
        .catch(e => logger.error("[ processGeminiCommand ] ❌ Falha ao notificar owner sobre erro GERAL:", e));

      await client
        .sendMessage(
          from,
          {
            text: `*❌ Ops! Algo deu errado ao processar seu comando.*\n\n_Já notifiquei o desenvolvedor sobre isso. Por favor, tente novamente mais tarde._\n\n*Se precisar de ajuda imediata, fale com:* ${config.owner.whatsapp}`,
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        )
        .catch(e => logger.error("[ processGeminiCommand ] ❌ Falha ao enviar msg de erro GERAL para o usuário:", e));
    } catch (notifyError) {
      logger.error("[ processGeminiCommand ] ❌ Falha CRÍTICA ao tentar notificar sobre erro GERAL:", notifyError);
    }
  } finally {
    // --- Cleanup ---
    try {
      await client.sendPresenceUpdate("paused", from);
    } catch (presenceError) {
      logger.warn("[ processGeminiCommand ] ⚠️ Falha ao resetar presence update para 'paused':", presenceError);
    }
  }
}
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
async function processSetPromptCommand(client, info, sender, from, args) {
  const newInstruction = args.join(" ").trim();

  // --- Input Validation ---
  if (!newInstruction) {
    logger.warn(`[ processSetPromptCommand ] ⚠️ Tentativa de definir instrução vazia por ${sender} em ${from}`);
    try {
      await client.sendMessage(from, { react: { text: "🤔", key: info.key } });
      await client.sendMessage(from, { text: "⚠️ Você precisa fornecer o texto da nova instrução após o comando.\n\n*Exemplo:* `!setprompt Seja um assistente pirata divertido`" }, { quoted: info });
    } catch (sendError) {
      logger.error(`[ processSetPromptCommand ] ❌ Falha ao enviar mensagem de instrução vazia para ${from}:`, sendError);
    }
    return;
  }

  if (newInstruction.length > 500) {
    // Keep the length check
    logger.warn(`[ processSetPromptCommand ] ⚠️ Tentativa de definir instrução muito longa por ${sender} (Length: ${newInstruction.length})`);
    try {
      await client.sendMessage(from, { react: { text: "📏", key: info.key } });
      await client.sendMessage(from, { text: `*⚠️ A instrução é muito longa (${newInstruction.length} caracteres). O limite é de 500 caracteres.*` }, { quoted: info });
    } catch (sendError) {
      logger.error(`[ processSetPromptCommand ] ❌ Falha ao enviar mensagem de instrução longa para ${from}:`, sendError);
    }
    return;
  }

  // --- Start Processing ---
  logger.info(`[ processSetPromptCommand ] ⏳ Processando !setprompt de ${sender} em ${from}. Nova instrução: "${newInstruction}"`);
  try {
    // --- Update Instruction and Clear History ---
    const updateResult = await updateUserSystemInstruction(sender, newInstruction);

    // --- Handle Result ---
    if (updateResult.success) {
      logger.info(`[ processSetPromptCommand ] ✅ Instrução do sistema atualizada e histórico limpo para ${sender}`);
      await client.sendMessage(from, { react: { text: "✅", key: info.key } });

      // Construct the detailed success message
      const successMessage = `✨ *Instrução do Sistema Atualizada!* ✨\n\n` + `🧠 Sua nova instrução para a IA foi definida como:\n` + `\`\`\`\n${newInstruction}\n\`\`\`\n\n` + `🧹 *Importante:* Para que a IA siga esta nova instrução corretamente, seu histórico de conversa anterior com ela foi limpo.\n\n` + `🚀 Tudo pronto! Você já pode usar o comando \`!gemini\` (ou \`!cat\`) novamente. A IA responderá seguindo a nova instrução que você definiu.`;

      await client.sendMessage(from, { text: successMessage }, { quoted: info });
    } else {
      // Handle failure from updateUserSystemInstruction
      logger.error(`[ processSetPromptCommand ] ❌ Falha ao atualizar instrução para ${sender}: ${updateResult.error}`);
      await client.sendMessage(from, { react: { text: "❌", key: info.key } });
      await client.sendMessage(from, { text: "❌ Ocorreu um erro ao tentar atualizar sua instrução. Parece que houve um problema interno. O desenvolvedor já foi notificado." }, { quoted: info });
      // Notify owner (keep this)
      await client.sendMessage(config.owner.number, { text: `*❌ Erro ao atualizar instrução (SetPrompt):*\n\n*Usuário:* ${sender}\n*Chat:* ${from}\n*Instrução Tentada:* ${newInstruction}\n*Erro:* ${updateResult.error}` });
    }
  } catch (error) {
    // Handle unexpected errors during the process
    logger.error(`[ processSetPromptCommand ] 💥 Erro INESPERADO ao processar !setprompt para ${sender}:`, error);
    try {
      // Try to notify user and owner about the unexpected error
      await client.sendMessage(from, { react: { text: "❌", key: info.key } });
      await client.sendMessage(from, { text: "❌ Ops! Ocorreu um erro inesperado ao processar sua solicitação. O desenvolvedor foi notificado para investigar." }, { quoted: info });
      // Notify owner with stack trace (keep this)
      await client.sendMessage(config.owner.number, { text: `*💥 Erro INESPERADO (SetPrompt):*\n\n*Usuário:* ${sender}\n*Chat:* ${from}\n*Instrução Tentada:* ${newInstruction}\n*Erro:* ${error.message}\n*Stack:* ${error.stack}` });
    } catch (notifyError) {
      logger.error("[ processSetPromptCommand ] 🆘 Falha CRÍTICA ao tentar notificar sobre erro inesperado:", notifyError);
    }
  }
}
module.exports = {
  processGeminiCommand,
  processSetPromptCommand,
};
