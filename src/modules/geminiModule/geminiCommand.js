const logger = require("../../utils/logger");
const { getFileBuffer } = require("../../utils/functions");
const { processAIResponse } = require("./processGeminiModule");
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
    // Define os caminhos possíveis para imagens na mensagem (direta ou citada)
    const mediaTypes = {
      image: [info.message?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.imageMessage],
    };

    // Busca a primeira mídia de imagem válida (se houver)
    const encmedia = findFirstValidMedia(mediaTypes);

    // Monta o prompt para envio à IA, podendo incluir imagem
    const prompt = await buildPrompt(encmedia, text);

    // Busca o buffer da imagem, se houver uma
    const imageBuffer = encmedia ? await getFileBuffer(encmedia, "image") : null;

    // Processa a resposta da IA com base no prompt e imagem
    response = await processAIResponse(prompt, imageBuffer, {}, sender);
    console.log(response);

    // Envia reação e resposta da IA ao chat de origem
    await client.sendMessage(from, { react: { text: "🐈‍⬛", key: info.key } });
    await client.sendMessage(
      from,
      { text: response.data, mentions: [sender] },
      {
        quoted: info,
        ephemeralExpiration: expirationMessage,
      }
    );

    logger.info(`[ processGeminiCommand ] ✅ Resposta da IA enviada com sucesso para ${from}`);
  } catch (error) {
    logger.error("[ processGeminiCommand ] ❌ Erro ao processar o comando Gemini:", error);

    await client.sendMessage(from, {
      react: { text: "❌", key: info.key },
    });

    await client.sendMessage(
      config.owner.number,
      {
        text: `*❌ Ocorreu um erro ao processar o comando Gemini:*\n\n*ID do remetente:* ${sender}\n*Texto enviado:* ${text}\n*Erro:* \n${JSON.stringify(response.error)}`,
      },
      {
        quoted: info,
        ephemeralExpiration: expirationMessage,
      }
    );

    await client.sendMessage(
      from,
      {
        text: `*❌ Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.*\n\n*📨 O desenvolvedor já foi notificado sobre o erro.*\n*📨Se desejar entrar em contato, use o link abaixo:*\n${config.owner.whatsapp}`,
      },
      {
        quoted: info,
        ephemeralExpiration: expirationMessage,
      }
    );
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

  return {
    parts: [
      basePart,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: (await getFileBuffer(media, "image")).toString("base64"),
        },
      },
    ],
  };
}

module.exports = {
  processGeminiCommand,
};
