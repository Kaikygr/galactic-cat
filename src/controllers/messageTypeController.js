
/**
 * Pre-processes the incoming message information to extract the content type, message body, and media flag.
 *
 * This function inspects the message object to extract:
 * - The message type using baileys.getContentType.
 * - The text or caption content from various potential message properties.
 * - A flag indicating if the message is of a media type (e.g., image, video, audio, etc.).
 *
 * @param {Object} info - The message information object containing a nested "message" property.
 * @returns {Object} An object with the following properties:
 *   @property {string} type - The detected content type of the message.
 *   @property {string|boolean} body - The extracted message body. Returns the body content as a string, or false if undefined.
 *   @property {boolean} isMedia - True if the message is a supported media type, false otherwise.
 */

/**
 * Processes a message body to extract a command and its arguments based on provided prefixes.
 *
 * The function checks if the message body starts with a given prefix (or one of multiple prefixes
 * if an array is passed), removes the prefix (and an optional additional dot), and then splits the remaining
 * string into a command and its subsequent arguments.
 *
 * @param {string} body - The message body to be processed.
 * @param {string|string[]} prefixes - A single prefix or an array of prefixes to match at the start of the body.
 * @returns {Object|null} Returns an object with the parsed command and arguments if a valid prefix is found:
 *   @property {string} comando - The command extracted (converted to lower case).
 *   @property {string[]} args - The list of arguments following the command.
 *   Returns null if the body does not start with any provided prefix or if no command is present.
 */

/**
 * Generates a set of checks to determine if a message is quoting various types of messages.
 *
 * This function maps potential quoted message types to boolean flags by checking if the message content
 * includes the marker associated with each type (for extended text messages).
 *
 * @param {string} type - The primary type of the message being checked.
 * @param {string} content - The textual content of the message to inspect for quoted message markers.
 * @returns {Object} An object containing booleans for each quoted message check:
 *   @property {boolean} isQuotedMsg - True if a text message quote is detected.
 *   @property {boolean} isQuotedImage - True if an image quote is detected.
 *   @property {boolean} isQuotedVideo - True if a video quote is detected.
 *   @property {boolean} isQuotedDocument - True if a document quote is detected.
 *   @property {boolean} isQuotedAudio - True if an audio quote is detected.
 *   @property {boolean} isQuotedSticker - True if a sticker quote is detected.
 *   @property {boolean} isQuotedContact - True if a contact quote is detected.
 *   @property {boolean} isQuotedLocation - True if a location quote is detected.
 *   @property {boolean} isQuotedProduct - True if a product quote is detected.
 */

/**
 * Retrieves the expiration timestamp from a message if one is available.
 *
 * The function iterates through various potential message types within the message information object
 * to locate and return an expiration timestamp from the message's context information.
 *
 * @param {Object} info - The message information object potentially containing multiple message types.
 * @returns {number|null} The expiration timestamp if found, or null if no expiration is set.
 */


const baileys = require("@whiskeysockets/baileys");

function preProcessMessage(info) {
  const type = baileys.getContentType(info.message);
  const body = info.message?.conversation || info.message?.viewOnceMessageV2?.message?.imageMessage?.caption || info.message?.viewOnceMessageV2?.message?.videoMessage?.caption || info.message?.imageMessage?.caption || info.message?.videoMessage?.caption || info.message?.extendedTextMessage?.text || info.message?.viewOnceMessage?.message?.videoMessage?.caption || info.message?.viewOnceMessage?.message?.imageMessage?.caption || info.message?.documentWithCaptionMessage?.message?.documentMessage?.caption || info.message?.buttonsMessage?.imageMessage?.caption || info.message?.buttonsResponseMessage?.selectedButtonId || info.message?.listResponseMessage?.singleSelectReply?.selectedRowId || info.message?.templateButtonReplyMessage?.selectedId || (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(info.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)?.id : null) || info?.text;

  // Alterado: caso body seja undefined, deve retornar false
  const finalBody = body === undefined ? false : body;

  // Alterado: lista de tipos de mídia adicionais
  const mediaTypes = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "contactMessage", "locationMessage", "productMessage"];
  const isMedia = mediaTypes.includes(type);

  return { type, body: finalBody, isMedia };
}

function processPrefix(body, prefixes) {
  if (!body) return null;
  // Se prefixes for um array, tenta cada um
  const prefix = Array.isArray(prefixes) ? prefixes.find(p => body.startsWith(p)) : prefixes;
  if (!prefix || !body.startsWith(prefix)) return null;
  let withoutPrefix = body.slice(prefix.length).trim();
  if (withoutPrefix.startsWith(".")) {
    withoutPrefix = withoutPrefix.slice(1).trim();
  }
  if (!withoutPrefix) return null;
  const parts = withoutPrefix.split(/ +/);
  const comando = parts.shift().toLowerCase();
  if (!comando) return null;
  return { comando, args: parts };
}

function getQuotedChecks(type, content) {
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

module.exports = { preProcessMessage, processPrefix, getQuotedChecks, getExpiration };
