const baileys = require('baileys');
const logger = require('../utils/logger');
require('dotenv').config();

function preProcessMessage(info) {
  const type = baileys.getContentType(info.message);
  const body = info.message?.conversation || info.viewOnceMessage?.message || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.viewOnceMessageV2?.message?.videoMessage?.caption || info.message?.imageMessage?.caption || info.message?.videoMessage?.caption || info.message?.extendedTextMessage?.text || info.message?.viewOnceMessage?.message?.videoMessage?.caption || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.documentWithCaptionMessage?.message?.documentMessage?.caption || info.message?.buttonsMessage?.imageMessage?.caption || info.message?.buttonsResponseMessage?.selectedButtonId || info.message?.listResponseMessage?.singleSelectReply?.selectedRowId || info.message?.templateButtonReplyMessage?.selectedId || (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)?.id : null) || info?.text;

  const finalBody = body === undefined ? false : body;

  const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'contactMessage', 'locationMessage', 'productMessage'];
  const isMedia = mediaTypes.includes(type);

  return { type, body: finalBody, isMedia };
}

/**
 * Verifica se uma mensagem de texto é um comando válido com base em um prefixo definido.
 *
 * @param {string} body - O conteúdo da mensagem que será verificado.
 * @returns {{
 *   isCommand: boolean,
 *   command?: string,
 *   args?: string
 * }} Um objeto indicando se é um comando, e se for, retorna o nome do comando e os argumentos como string.
 *
 **/
function isCommand(body) {
  const prefix = process.env.BOT_GLOBAL_PREFIX || '.';

  if (!body || !body.startsWith(prefix)) return { isCommand: false };

  const withoutPrefix = body.slice(prefix.length).trim();

  const spaceIndex = withoutPrefix.indexOf(' ');

  let command, args;

  if (spaceIndex === -1) {
    command = withoutPrefix.toLowerCase();
    args = '';
  } else {
    command = withoutPrefix.slice(0, spaceIndex).toLowerCase();
    args = withoutPrefix.slice(spaceIndex + 1).trim();
  }

  if (!command) return { isCommand: false };

  return { isCommand: true, command, args };
}

function processQuotedChecks(type, content) {
  const quotedTypes = {
    textMessage: 'isQuotedMsg',
    imageMessage: 'isQuotedImage',
    videoMessage: 'isQuotedVideo',
    documentMessage: 'isQuotedDocument',
    audioMessage: 'isQuotedAudio',
    stickerMessage: 'isQuotedSticker',
    contactMessage: 'isQuotedContact',
    locationMessage: 'isQuotedLocation',
    productMessage: 'isQuotedProduct',
  };

  const quotedChecks = {};
  for (const [key, value] of Object.entries(quotedTypes)) {
    quotedChecks[value] = type === 'extendedTextMessage' && content.includes(key);
  }

  return {
    isQuotedMsg: quotedChecks.isQuotedMsg,
    isQuotedImage: quotedChecks.isQuotedImage,
    isQuotedVideo: quotedChecks.isQuotedVideo,
    isQuotedDocument: quotedChecks.isQuotedDocument,
    isQuotedAudio: quotedChecks.isQuotedAudio,
    isQuotedSticker: quotedChecks.isQuotedSticker,
    isQuotedContact: quotedChecks.isQuotedContact,
    isQuotedLocation: quotedChecks.isQuotedLocation,
    isQuotedProduct: quotedChecks.isQuotedProduct,
  };
}

/**
 * Extrai o valor de expiração de uma mensagem do WhatsApp, ou retorna 24 horas (em segundos) por padrão.
 * @param {object} info - Objeto da mensagem recebido via Baileys.
 * @returns {number} Timestamp de expiração (em segundos).
 */
function getExpiration(info) {
  const DEFAULT_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 horas

  if (!info || typeof info !== 'object' || !info.message) {
    return DEFAULT_EXPIRATION_SECONDS;
  }

  const messageTypes = ['conversation', 'viewOnceMessageV2', 'imageMessage', 'videoMessage', 'extendedTextMessage', 'viewOnceMessage', 'documentWithCaptionMessage', 'buttonsMessage', 'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage', 'interactiveResponseMessage'];

  // Verifica diretamente nos tipos de mensagem listados
  for (const type of messageTypes) {
    const rawMessage = info.message[type];
    const messageContent = rawMessage?.message ?? rawMessage;

    const expiration = messageContent?.contextInfo?.expiration;
    if (typeof expiration === 'number') {
      return expiration;
    }
  }

  // Busca profunda para garantir cobertura de todos os casos
  const deepSearch = (obj) => {
    if (typeof obj !== 'object' || obj === null) return null;

    if (obj.contextInfo?.expiration && typeof obj.contextInfo.expiration === 'number') {
      return obj.contextInfo.expiration;
    }

    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const result = deepSearch(value);
      if (result !== null) return result;
    }

    return null;
  };

  const found = deepSearch(info.message);
  return typeof found === 'number' ? found : null;
}

module.exports = { preProcessMessage, isCommand, processQuotedChecks, getExpiration };
