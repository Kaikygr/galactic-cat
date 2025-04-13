const baileys = require("baileys");

function preProcessMessage(info) {
  const type = baileys.getContentType(info.message);
  const body = info.message?.conversation || info.viewOnceMessage?.message || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.viewOnceMessageV2?.message?.videoMessage?.caption || info.message?.imageMessage?.caption || info.message?.videoMessage?.caption || info.message?.extendedTextMessage?.text || info.message?.viewOnceMessage?.message?.videoMessage?.caption || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.documentWithCaptionMessage?.message?.documentMessage?.caption || info.message?.buttonsMessage?.imageMessage?.caption || info.message?.buttonsResponseMessage?.selectedButtonId || info.message?.listResponseMessage?.singleSelectReply?.selectedRowId || info.message?.templateButtonReplyMessage?.selectedId || (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)?.id : null) || info?.text;

  const finalBody = body === undefined ? false : body;

  const mediaTypes = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "contactMessage", "locationMessage", "productMessage"];
  const isMedia = mediaTypes.includes(type);

  return { type, body: finalBody, isMedia };
}

function isCommand(body, prefixes) {
  if (!body) return false;
  if (!Array.isArray(prefixes)) prefixes = [prefixes];
  const prefix = prefixes.find(p => body.startsWith(p));
  if (!prefix) return { isCommand: false };
  const withoutPrefix = body.slice(prefix.length);
  const parts = withoutPrefix.split(/ +/);
  const command = parts.shift().toLowerCase();
  if (!command) return null;
  return { isCommand: true, command, args: parts };
}

function processQuotedChecks(type, content) {
  const quotedTypes = {
    textMessage: "isQuotedMsg",
    imageMessage: "isQuotedImage",
    videoMessage: "isQuotedVideo",
    documentMessage: "isQuotedDocument",
    audioMessage: "isQuotedAudio",
    stickerMessage: "isQuotedSticker",
    contactMessage: "isQuotedContact",
    locationMessage: "isQuotedLocation",
    productMessage: "isQuotedProduct",
  };

  const quotedChecks = {};
  for (const [key, value] of Object.entries(quotedTypes)) {
    quotedChecks[value] = type === "extendedTextMessage" && content.includes(key);
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

function getExpiration(info) {
  const messageTypes = ["conversation", "viewOnceMessageV2", "imageMessage", "videoMessage", "extendedTextMessage", "viewOnceMessage", "documentWithCaptionMessage", "buttonsMessage", "buttonsResponseMessage", "listResponseMessage", "templateButtonReplyMessage", "interactiveResponseMessage"];

  for (const type of messageTypes) {
    const message = info.message?.[type]?.message || info.message?.[type];
    if (message?.contextInfo?.expiration) {
      return message.contextInfo.expiration;
    }
  }

  return null;
}

module.exports = { preProcessMessage, isCommand, processQuotedChecks, getExpiration };
