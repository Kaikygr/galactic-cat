const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execProm = util.promisify(exec);
const config = require('../../config/options.json');
const { getFileBuffer } = require('../../utils/getFileBuffer');
const logger = require('../../utils/logger');

const { botPrefix } = require('./../../config/config');

const tempDir = path.join(__dirname, 'sticker_temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Envia uma reação de erro, uma mensagem de erro para o usuário e registra o erro.
 * Notifica o proprietário do bot, se configurado.
 * @async
 * @param {any} client - O cliente Baileys.
 * @param {string} from - O JID do chat de origem.
 * @param {object} key - A chave da mensagem original para reagir.
 * @param {number} expirationMessage - O tempo de expiração da mensagem.
 * @param {string} userMessageText - O texto da mensagem de erro a ser enviada ao usuário.
 * @param {string} logMessage - A mensagem a ser registrada no log.
 * @param {Error} error - O objeto de erro.
 * @param {object} originalInfo - O objeto de informação da mensagem original.
 */
async function sendErrorReactionAndMessage(client, from, key, expirationMessage, userMessageText, logMessage, error, originalInfo) {
  await client.sendMessage(from, { react: { text: '❌', key } });
  await client.sendMessage(from, { text: userMessageText }, { quoted: originalInfo, ephemeralExpiration: expirationMessage });
  logger.error(logMessage, error);

  if (config.owner?.number && originalInfo) {
    const senderId = originalInfo.sender ? originalInfo.sender.split('@')[0] : 'Desconhecido';
    await client.sendMessage(
      config.owner.number,
      {
        text: `❌ *Erro no Módulo Sticker!*\n\nDetalhes: ${logMessage}\nUsuário: ${senderId}\n\n\`\`\`${String(error)}\`\`\``,
      },
      { quoted: originalInfo, ephemeralExpiration: expirationMessage },
    );
  }
}

/**
 * Extrai detalhes da mídia (tipo e objeto da mídia) da mensagem.
 * @param {object} info - O objeto de informação da mensagem.
 * @returns {{tipoMidia: string, encmedia: object} | null} Um objeto com o tipo de mídia e a mídia, ou null se nenhuma mídia for encontrada.
 * @property {string} tipoMidia - O tipo de mídia ('image', 'video', 'sticker').
 * @property {object} encmedia - O objeto da mensagem de mídia.
 */
function extractMediaDetails(info) {
  const caminhosPossiveis = {
    image: [info.message?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.imageMessage],
    video: [info.message?.videoMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.videoMessage],
    sticker: [info.message?.stickerMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage],
  };

  for (const [tipo, caminhos] of Object.entries(caminhosPossiveis)) {
    for (const caminho of caminhos) {
      if (caminho) {
        return { tipoMidia: tipo, encmedia: caminho };
      }
    }
  }
  return null;
}

/**
 * Lida com o caso em que nenhuma mídia é detectada para a criação de sticker.
 * Envia uma mensagem de ajuda ao usuário.
 * @async
 * @param {any} client - O cliente Baileys.
 * @param {string} from - O JID do chat de origem.
 * @param {object} info - O objeto de informação da mensagem original.
 * @param {number} expirationMessage - O tempo de expiração da mensagem.
 */
async function handleNoMedia(client, from, info, expirationMessage) {
  await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
  const noMediaHelpText =
    `⚠️ *Ops! Nenhuma mídia encontrada para criar o sticker.*\n\n` +
    `Para que eu possa te ajudar, por favor, envie uma *imagem/vídeo* ou *responda a uma mensagem* que contenha a mídia desejada usando o comando:\n` +
    `*${botPrefix}sticker*\n\n` +
    `ℹ️ *Dicas e Informações Úteis:*\n\n` +
    `🔹 *Tipos de Mídia Aceitos:*\n` +
    `  - Imagens (JPG, PNG, GIF animado, etc.)\n` +
    `  - Vídeos curtos (MP4, etc.)\n` +
    `  - Stickers já existentes (para adicionar seus metadados)\n\n` +
    `🔹 *Recomendações para Vídeos:*\n` +
    `  - _Duração ideal:_ até 5 segundos.\n` +
    `  - _Tamanho máximo:_ 1.5 MB (arquivos maiores podem não ser processados).\n` +
    `  - _Dica extra:_ Vídeos muito longos ou de alta definição podem demorar mais ou até falhar. Se tiver problemas, tente com vídeos menores ou com resolução mais baixa.\n\n` +
    `📏 *Como seu Sticker Ficará:*\n` +
    `  - Todas as mídias são convertidas para o formato *WebP* e redimensionadas para *512x512 pixels* (padrão do WhatsApp).\n\n` +
    `📝 *Personalize o Nome do Pacote e Autor:*\n` +
    `  - Quer dar um toque especial? Defina o nome do pacote e o autor do sticker!\n` +
    `  - Use o comando: *${botPrefix}sticker Nome do Pacote | Nome do Autor*\n` +
    `  - _Exemplo:_ *${botPrefix}sticker Meus Gatinhos | Por #nome*\n` +
    `  - Se você enviar apenas um texto (sem o " | "), ele será usado como "Nome do Pacote".\n` +
    `  - _Variáveis dinâmicas que você pode usar:_ \`#nome\` (seu nome de usuário), \`#id\` (seu número), \`#data\` (data atual).\n` +
    `  - Suas preferências de nome e autor são salvas! Da próxima vez, usarei as mesmas, a menos que você envie um novo texto com o comando.\n\n` +
    `Tente novamente seguindo estas dicas! ✨`;
  try {
    await client.sendMessage(
      from,
      {
        image: { url: 'https://api.telegram.org/file/bot6369612385:AAGvQkKlh_BHBJbs9zH8rorSM84W9xQwlno/photos/file_1548.jpg' },
        caption: noMediaHelpText,
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    );
  } catch (imgError) {
    logger.error('Erro ao enviar imagem de ajuda em handleNoMedia:', imgError);
  }
}

/**
 * Verifica se o tamanho da mídia excede o limite máximo permitido.
 * @async
 * @param {any} client - O cliente Baileys.
 * @param {string} from - O JID do chat de origem.
 * @param {object} info - O objeto de informação da mensagem original.
 * @param {number} expirationMessage - O tempo de expiração da mensagem.
 * @param {string} tipoMidia - O tipo de mídia ('video', 'sticker').
 * @param {object} encmedia - O objeto da mensagem de mídia.
 * @returns {Promise<boolean>} True se o tamanho for aceitável, false caso contrário.
 */
async function checkMediaSize(client, from, info, expirationMessage, tipoMidia, encmedia) {
  const fileLength = encmedia?.fileLength || 0;
  const maxFileSize = 1.5 * 1024 * 1024; // 1.5 MB

  if ((tipoMidia === 'video' || tipoMidia === 'sticker') && fileLength > maxFileSize) {
    await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
    await client.sendMessage(
      from,
      {
        text: '⚠️ *Arquivo Excede o Limite de Tamanho*\n\n' + 'O vídeo ou sticker que você enviou é maior que o limite permitido de *1,5 MB*.\n' + 'Arquivos grandes podem causar problemas de processamento e uso excessivo de dados.\n\n' + 'Por favor, envie uma versão menor do arquivo. Para vídeos, considere reduzir a duração ou a resolução.',
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    );
    return false;
  }
  return true;
}

/**
 * Classe de erro personalizada para erros de descriptografia de mídia.
 * @class MediaDecryptionError
 * @extends {Error}
 */
class MediaDecryptionError extends Error {
  /**
   * @param {string} message - A mensagem de erro.
   */
  constructor(message) {
    super(message);
    this.name = 'MediaDecryptionError';
  }
}

/**
 * Baixa a mídia, salva em um arquivo temporário e determina a extensão e se precisa de processamento com FFmpeg.
 * @async
 * @param {object} encmedia - O objeto da mensagem de mídia.
 * @param {string} tipoMidia - O tipo de mídia ('image', 'video', 'sticker').
 * @returns {Promise<{mediaPath: string, processWithFfmpeg: boolean, tipoMidia: string}>} Um objeto com o caminho do arquivo, flag de processamento e tipo de mídia.
 * @throws {MediaDecryptionError} Se ocorrer um erro de descriptografia.
 * @throws {Error} Se ocorrer outro erro durante o download ou salvamento.
 */
async function downloadAndSaveTempMedia(encmedia, tipoMidia) {
  let mediaBuffer;
  try {
    mediaBuffer = await getFileBuffer(encmedia, tipoMidia);
  } catch (e) {
    if (e.message.includes('bad decrypt')) {
      throw new MediaDecryptionError('Erro ao descriptografar mídia.');
    }
    throw e;
  }

  let mediaExtension = '';
  let processWithFfmpeg = true;

  switch (tipoMidia) {
    case 'image':
      mediaExtension = '.jpg';
      break;
    case 'video':
      mediaExtension = '.mp4';
      break;
    case 'sticker':
      mediaExtension = '.webp';
      processWithFfmpeg = false;
      break;
  }

  const mediaPath = path.join(tempDir, `temp_file_${Date.now()}${mediaExtension}`);
  fs.writeFileSync(mediaPath, mediaBuffer);

  if (!fs.existsSync(mediaPath)) {
    logger.error(`Falha ao criar o arquivo de mídia temporário em: ${mediaPath}`);
    throw new Error('Falha ao criar arquivo de mídia temporário.');
  }
  return { mediaPath, processWithFfmpeg, tipoMidia };
}

/**
 * Converte a mídia para o formato WebP.
 * @async
 * @param {string} mediaPath - O caminho para o arquivo de mídia de entrada.
 * @param {string} tipoMidiaMedia - O tipo da mídia original (usado para determinar o filtro FFmpeg).
 * @param {boolean} processWithFfmpegFlag - Indica se o FFmpeg deve ser usado para conversão.
 * @returns {Promise<string>} O caminho para o arquivo WebP convertido.
 */
async function convertToWebp(mediaPath, tipoMidiaMedia, processWithFfmpegFlag) {
  const outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
  if (processWithFfmpegFlag) {
    const filtro = tipoMidiaMedia === 'video' ? 'fps=10,scale=512:512' : 'scale=512:512';
    await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -lossless 1 -loop 0 -preset default -an -vf "${filtro}" "${outputPath}"`);
  } else {
    fs.copyFileSync(mediaPath, outputPath);
  }
  return outputPath;
}

/**
 * Obtém ou define as informações do pacote de stickers (nome e autor) com base no texto fornecido e nas preferências salvas.
 * @param {string | undefined} text - O texto fornecido com o comando, pode conter nome e autor separados por "|".
 * @param {string} sender - O JID do remetente.
 * @param {string} pushName - O nome de usuário (pushName) do remetente.
 * @returns {{stickerPackName: string, stickerPackPublisher: string}} Um objeto com o nome do pacote e o autor do sticker.
 * @property {string} stickerPackName - O nome do pacote de stickers.
 * @property {string} stickerPackPublisher - O nome do autor do pacote de stickers.
 */
function getStickerPackInfo(text, sender, pushName) {
  const formattedSender = sender.replace(/@s\.whatsapp\.net$/, '');
  const prefsPath = path.join(__dirname, 'data', 'stickerPrefs.json');
  let stickerPrefs = {};
  if (fs.existsSync(prefsPath)) {
    try {
      stickerPrefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
    } catch (err) {
      logger.warn('Erro ao ler stickerPrefs.json, usando objeto vazio.', err);
      stickerPrefs = {};
    }
  }
  const key = formattedSender;

  const defaultComputedName = `👤 Usuário: ${pushName}\n🆔 ID: ${formattedSender}\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}`;
  const defaultComputedPublisher = `\n\n👑 Criador: https://bit.ly/m/Kaally`;

  let storedName = stickerPrefs[key]?.stickerPackName ?? defaultComputedName;
  let storedPublisher = stickerPrefs[key]?.stickerPackPublisher ?? defaultComputedPublisher;

  let stickerPackNameForCurrentSticker;
  let stickerPackPublisherForCurrentSticker;
  let nameToSaveInPrefs;
  let publisherToSaveInPrefs;

  if (text && text.trim()) {
    const trimmedText = text.trim();
    if (trimmedText.includes('|')) {
      const parts = trimmedText.split('|').map((p) => p.trim());
      nameToSaveInPrefs = parts[0] !== '' ? parts[0] : storedName;
      publisherToSaveInPrefs = parts[1] !== '' ? parts[1] : storedPublisher;
      stickerPackNameForCurrentSticker = nameToSaveInPrefs;
      stickerPackPublisherForCurrentSticker = publisherToSaveInPrefs;
    } else {
      nameToSaveInPrefs = trimmedText !== '' ? trimmedText : null;
      publisherToSaveInPrefs = storedPublisher;
      stickerPackNameForCurrentSticker = trimmedText !== '' ? trimmedText : defaultComputedName;
      stickerPackPublisherForCurrentSticker = storedPublisher;
    }

    stickerPrefs[key] = {
      stickerPackName: nameToSaveInPrefs,
      stickerPackPublisher: publisherToSaveInPrefs,
    };
    const prefsDir = path.dirname(prefsPath);
    if (!fs.existsSync(prefsDir)) {
      fs.mkdirSync(prefsDir, { recursive: true });
    }
    fs.writeFileSync(prefsPath, JSON.stringify(stickerPrefs, null, 2));
  } else {
    stickerPackNameForCurrentSticker = storedName;
    stickerPackPublisherForCurrentSticker = storedPublisher;
  }

  const replacedName = stickerPackNameForCurrentSticker.replace(/#nome/g, pushName).replace(/#id/g, formattedSender).replace(/#data/g, new Date().toLocaleDateString('pt-BR'));
  const replacedPublisher = stickerPackPublisherForCurrentSticker.replace(/#nome/g, pushName).replace(/#id/g, formattedSender).replace(/#data/g, new Date().toLocaleDateString('pt-BR'));

  return {
    stickerPackName: replacedName,
    stickerPackPublisher: replacedPublisher,
  };
}

/**
 * Aplica metadados EXIF (nome do pacote e autor) a um arquivo de sticker WebP usando webpmux.
 * @async
 * @param {string} stickerPath - O caminho para o arquivo de sticker WebP.
 * @param {string} packName - O nome do pacote de stickers.
 * @param {string} packPublisher - O nome do autor do pacote de stickers.
 */
async function applyStickerMetadata(stickerPath, packName, packPublisher) {
  const json = {
    'sticker-pack-name': packName,
    'sticker-pack-publisher': packPublisher,
  };
  const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
  const exifBuffer = Buffer.concat([exifAttr, jsonBuff]);
  exifBuffer.writeUIntLE(jsonBuff.length, 14, 4);

  const metaPath = path.join(tempDir, `meta_${Date.now()}.temp.exif`);
  fs.writeFileSync(metaPath, exifBuffer);

  try {
    const webpmuxPath = (await execProm('which webpmux')).stdout.trim();
    await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${stickerPath}" -o "${stickerPath}"`);
  } finally {
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }
  }
}

/**
 * Processa uma solicitação para criar um sticker a partir de uma mídia.
 * @async
 * @param {any} client - O cliente Baileys.
 * @param {object} info - O objeto de informação da mensagem original.
 * @param {number} expirationMessage - O tempo de expiração da mensagem.
 * @param {string} sender - O JID do remetente.
 * @param {string} from - O JID do chat de origem.
 * @param {string | undefined} text - O texto que acompanha o comando, pode conter nome do pacote e autor.
 * @returns {Promise<void>}
 */
async function processSticker(client, info, expirationMessage, sender, from, text) {
  let tempMediaPath = null;
  let finalStickerPath = null;

  try {
    const mediaDetails = extractMediaDetails(info);
    if (!mediaDetails) {
      await handleNoMedia(client, from, info, expirationMessage);
      return;
    }
    const { tipoMidia, encmedia } = mediaDetails;

    await client.sendMessage(from, { react: { text: '⏳', key: info.key } });
    await client.sendMessage(from, { text: '⚙️ Processando sua solicitação de sticker. Aguarde um momento...' }, { quoted: info, ephemeralExpiration: expirationMessage });

    if (!(await checkMediaSize(client, from, info, expirationMessage, tipoMidia, encmedia))) {
      return;
    }

    try {
      const downloaded = await downloadAndSaveTempMedia(encmedia, tipoMidia);
      tempMediaPath = downloaded.mediaPath;
      finalStickerPath = await convertToWebp(tempMediaPath, downloaded.tipoMidia, downloaded.processWithFfmpeg);
    } catch (error) {
      if (error instanceof MediaDecryptionError) {
        await sendErrorReactionAndMessage(client, from, info.key, expirationMessage, '❌ *Erro ao Acessar Mídia Criptografada*\n\n' + 'Não foi possível processar a mídia enviada devido a um erro de descriptografia. ' + 'Isso geralmente acontece com mídias que foram encaminhadas muitas vezes, mídias "ver uma vez" que já expiraram, ou arquivos corrompidos.\n\n' + 'Por favor, tente as seguintes opções:\n' + '- Envie a mídia original novamente (não encaminhada).\n' + '- Peça ao remetente original para enviar a mídia diretamente para você.\n' + '- Tente com um arquivo de mídia diferente.', 'Erro de descriptografia de mídia', error, info);
      } else if (error.message.includes('Falha ao criar arquivo de mídia temporário')) {
        await sendErrorReactionAndMessage(client, from, info.key, expirationMessage, '❌ *Erro Interno Durante a Preparação*\n\n' + 'Ocorreu uma falha técnica ao tentar criar os arquivos temporários necessários para o processamento do seu sticker. ' + 'Nossa equipe técnica foi notificada sobre este incidente.\n\n' + 'Pedimos desculpas pelo inconveniente. Por favor, tente novamente em alguns minutos.', 'Falha ao criar arquivo temporário', error, info);
      } else {
        await sendErrorReactionAndMessage(client, from, info.key, expirationMessage, '❌ *Erro ao Carregar a Mídia*\n\n' + 'Houve uma falha ao tentar carregar os dados da mídia que você enviou. ' + 'Isso pode ser causado por um formato de arquivo não suportado, arquivo corrompido, ou um problema temporário de rede.\n\n' + 'Por favor, verifique se o arquivo está em um formato comum (imagem ou vídeo) e tente novamente. Se o problema persistir, tente com uma mídia diferente.', 'Erro ao baixar ou salvar mídia', error, info);
      }
      return;
    }

    if (!fs.existsSync(finalStickerPath)) {
      throw new Error(`Arquivo de sticker não encontrado (${finalStickerPath}) após conversão.`);
    }

    const { stickerPackName, stickerPackPublisher } = getStickerPackInfo(text, sender, info.pushName);

    await applyStickerMetadata(finalStickerPath, stickerPackName, stickerPackPublisher);
    if (!fs.existsSync(finalStickerPath)) {
      throw new Error(`Arquivo de sticker não encontrado (${finalStickerPath}) após webpmux.`);
    }

    await client.sendMessage(from, { react: { text: '🐈‍⬛', key: info.key } });
    await client.sendMessage(from, { sticker: fs.readFileSync(finalStickerPath) }, { quoted: info, ephemeralExpiration: expirationMessage });
  } catch (error) {
    await sendErrorReactionAndMessage(client, from, info.key, expirationMessage, '❌ *Falha Inesperada no Processamento do Sticker*\n\n' + 'Lamentamos, mas um erro inesperado ocorreu enquanto seu sticker estava sendo criado. ' + 'Isso pode ser devido a um problema com o formato da mídia que não foi detectado anteriormente, ou uma instabilidade momentânea no sistema de processamento.\n\n' + 'Recomendamos verificar se a mídia está em um formato padrão (JPG, PNG para imagens; MP4 para vídeos curtos) e tentar novamente. ' + 'Se o erro continuar, por favor, aguarde um pouco antes de uma nova tentativa ou contate o suporte se disponível.', 'Erro genérico ao processar sticker', error, info);
  } finally {
    if (tempMediaPath && fs.existsSync(tempMediaPath)) {
      try {
        fs.unlinkSync(tempMediaPath);
      } catch (unlinkError) {
        logger.error(`Erro ao deletar arquivo temporário de mídia: ${tempMediaPath}`, unlinkError);
      }
    }
    if (finalStickerPath && fs.existsSync(finalStickerPath)) {
      try {
        fs.unlinkSync(finalStickerPath);
      } catch (unlinkError) {
        logger.error(`Erro ao deletar arquivo final de sticker: ${finalStickerPath}`, unlinkError);
      }
    }
  }
}

module.exports = { processSticker };
