const logger = require("../../utils/logger");
const { getFileBuffer } = require("../../utils/functions");
const { processAIResponse, updateUserSystemInstruction } = require("./processGeminiModule");
const config = require("./../../config/options.json");
let response = null;

/**
 * Processa um comando enviado ao Gemini, interpretando texto e imagem (se houver),
 * e envia a resposta gerada pela IA de volta ao remetente.
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
  if (!client || !info || !text) {
    logger.error("[ processGeminiCommand ] ❌ Parâmetros obrigatórios ausentes (client, info ou text)");
    return;
  }

  try {
    const mediaTypes = {
      image: [info.message?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.imageMessage],
    };

    const encmedia = findFirstValidMedia(mediaTypes);

    const prompt = await buildPrompt(encmedia, text);

    const imageBuffer = encmedia ? await getFileBuffer(encmedia, "image") : null;

    const aiResponse = await processAIResponse(prompt, imageBuffer, {}, sender);

    if (!aiResponse.success) {
      logger.error("[ processGeminiCommand ] ❌ Erro retornado por processAIResponse:", aiResponse.error);
      await client.sendMessage(from, { react: { text: "❌", key: info.key } });
      await client.sendMessage(
        config.owner.number,
        {
          text: `*❌ Ocorreu um erro ao processar o comando Gemini (AI Error):*\n\n*ID do remetente:* ${sender}\n*Texto enviado:* ${text}\n*Erro:* \n${JSON.stringify(aiResponse.error)}`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      await client.sendMessage(
        from,
        {
          text: `*❌ Ocorreu um erro ao processar sua solicitação com a IA. Tente novamente mais tarde.*\n\n*📨 O desenvolvedor já foi notificado sobre o erro.*\n*📨Se desejar entrar em contato, use o link abaixo:*\n${config.owner.whatsapp}`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      return;
    }

    await client.sendMessage(from, { react: { text: "🐈‍⬛", key: info.key } });
    await client.sendMessage(
      from,
      { text: aiResponse.data, mentions: [sender] },
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
      await client.sendMessage(
        config.owner.number,
        {
          text: `*❌ Ocorreu um erro GERAL ao processar o comando Gemini:*\n\n*ID do remetente:* ${sender}\n*Texto enviado:* ${text}\n*Erro:* \n${error.message}\n${error.stack}`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      await client.sendMessage(
        from,
        {
          text: `*❌ Ocorreu um erro inesperado ao processar sua solicitação. Tente novamente mais tarde.*\n\n*📨 O desenvolvedor já foi notificado sobre o erro.*\n*📨Se desejar entrar em contato, use o link abaixo:*\n${config.owner.whatsapp}`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    } catch (notifyError) {
      logger.error("[ processGeminiCommand ] ❌ Falha ao enviar notificação de erro:", notifyError);
    }
  }
}

/**
 * Processa o comando para definir a instrução do sistema do Gemini para um usuário.
 *
 * @async
 * @function processSetPromptCommand
 * @param {object} client - Instância do cliente (ex: Baileys).
 * @param {object} info - Informações da mensagem recebida.
 * @param {string} sender - Identificador do remetente da mensagem.
 * @param {string} from - ID da origem da mensagem (grupo ou privado).
 * @param {string[]} args - Argumentos passados para o comando.
 * @returns {Promise<void>}
 */
async function processSetPromptCommand(client, info, sender, from, args) {
  const newInstruction = args.join(" ");

  if (!newInstruction) {
    logger.warn(`[ processSetPromptCommand ] ⚠️ Tentativa de definir instrução vazia por ${sender}`);
    await client.sendMessage(from, { text: "⚠️ Você precisa fornecer o texto da nova instrução após o comando.\n\n*Exemplo:* `!setprompt Seja um assistente pirata divertido`" }, { quoted: info });
    return;
  }

  if (newInstruction.length > 500) {
    logger.warn(`[ processSetPromptCommand ] ⚠️ Tentativa de definir instrução muito longa por ${sender}`);
    await client.sendMessage(from, { text: "*⚠️ A instrução é muito longa. O limite é de 500 caracteres.*" }, { quoted: info });
    return;
  }

  try {
    const updateResult = await updateUserSystemInstruction(sender, newInstruction);

    if (updateResult.success) {
      logger.info(`[ processSetPromptCommand ] ⚠️ Instrução do sistema atualizada para ${sender}`);
      await client.sendMessage(from, { react: { text: "✅", key: info.key } });
      await client.sendMessage(from, { text: updateResult.message || "✅ Sua instrução de sistema foi atualizada com sucesso! Seu histórico de chat anterior foi limpo para aplicar a nova instrução." }, { quoted: info });
    } else {
      logger.error(`[ processSetPromptCommand ] ⚠️ Falha ao atualizar instrução para ${sender}: ${updateResult.error}`);
      await client.sendMessage(from, { react: { text: "❌", key: info.key } });
      await client.sendMessage(from, { text: "❌ Ocorreu um erro ao tentar atualizar sua instrução. O desenvolvedor foi notificado." }, { quoted: info });
      await client.sendMessage(config.owner.number, { text: `*❌ Erro ao atualizar instrução (SetPrompt):*\n\n*Usuário:* ${sender}\n*Instrução:* ${newInstruction}\n*Erro:* ${updateResult.error}` });
    }
  } catch (error) {
    logger.error(`[ processSetPromptCommand ] ⚠️ Erro inesperado ao processar !setprompt para ${sender}:`, error);
    try {
      await client.sendMessage(from, { react: { text: "❌", key: info.key } });
      await client.sendMessage(from, { text: "❌ Ocorreu um erro inesperado ao processar sua solicitação. O desenvolvedor foi notificado." }, { quoted: info });
      await client.sendMessage(config.owner.number, { text: `*❌ Erro INESPERADO ao atualizar instrução (SetPrompt):*\n\n*Usuário:* ${sender}\n*Instrução:* ${newInstruction}\n*Erro:* ${error.message}\n${error.stack}` }); // Include stack trace for unexpected errors
    } catch (notifyError) {
      logger.error("[ processSetPromptCommand ] ⚠️ Falha ao enviar notificação de erro inesperado:", notifyError);
    }
  }
}

/**
 * Encontra e retorna a primeira mídia válida em um objeto de tipos de mídia.
 *
 * @function findFirstValidMedia
 * @param {Object} mediaTypes - Objeto contendo arrays com possíveis caminhos de mídia.
 * @returns {Object|null} - O primeiro objeto de mídia encontrado ou null.
 */
function findFirstValidMedia(mediaTypes) {
  for (const paths of Object.values(mediaTypes)) {
    const media = paths.find(path => path);
    if (media) return media;
  }
  return null;
}

/**
 * Constrói o prompt para envio à IA, podendo conter texto e imagem codificada.
 *
 * @async
 * @function buildPrompt
 * @param {Object|null} media - Objeto de mídia (imagem), se houver.
 * @param {string} text - Texto enviado pelo usuário.
 * @returns {Promise<Object>} - Objeto `parts` formatado para consumo pela IA.
 */
async function buildPrompt(media, text) {
  const basePart = { text };
  if (!media) return { parts: [basePart] };

  try {
    const buffer = await getFileBuffer(media, "image");
    if (!buffer) {
      logger.warn("[ buildPrompt ] ⚠️ Não foi possível obter o buffer da imagem.");
      return { parts: [basePart] }; // Proceed without image if buffer fails
    }
    return {
      parts: [
        basePart,
        {
          inlineData: {
            mimeType: "image/jpeg", // Assuming jpeg, might need refinement if other types are common
            data: buffer.toString("base64"),
          },
        },
      ],
    };
  } catch (error) {
    logger.error("[ buildPrompt ] ❌ Erro ao processar imagem para o prompt:", error);
    return { parts: [basePart] }; // Fallback to text-only on error
  }
}

module.exports = {
  processGeminiCommand,
  processSetPromptCommand, // Export the new function
};
