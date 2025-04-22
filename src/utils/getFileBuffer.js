const { downloadContentFromMessage } = require("baileys");
const logger = require("./logger");
const VALID_MEDIA_TYPES = new Set(["audio", "video", "image", "document", "sticker"]);

const DEFAULT_MAX_ALLOWED_SIZE_BYTES = 50 * 1024 * 1024;

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30 * 1000;

const getFileBuffer = async (mediaKey, mediaType, options = {}) => {
  const { allowUnknownType = false, maxSize = DEFAULT_MAX_ALLOWED_SIZE_BYTES, timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS } = options;
  if (!mediaKey || typeof mediaKey !== "object") {
    logger.warn(`[ getFileBuffer ] Invalid or missing 'mediaKey' parameter. Expected an object, received: ${typeof mediaKey}`);
    return null;
  }

  if (!mediaType || typeof mediaType !== "string") {
    logger.warn(`[ getFileBuffer ] Invalid or missing 'mediaType' parameter. Expected a string, received: ${typeof mediaType}`);
    return null;
  }

  if (!VALID_MEDIA_TYPES.has(mediaType)) {
    if (!allowUnknownType) {
      logger.warn(`[ getFileBuffer ] Invalid mediaType specified: '${mediaType}'. Must be one of: ${[...VALID_MEDIA_TYPES].join(", ")}. Set options.allowUnknownType=true to attempt download anyway.`);
      return null;
    } else {
      logger.info(`[ getFileBuffer ] Unknown mediaType specified: '${mediaType}'. Proceeding with download attempt as allowUnknownType is true.`);
    }
  }

  let stream;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn(`[ getFileBuffer ] Download timed out after ${timeoutMs}ms for type '${mediaType}'. Aborting.`);
    controller.abort();
  }, timeoutMs);

  try {
    logger.debug(`[ getFileBuffer ] Attempting to download media type '${mediaType}' (Limit: ${maxSize.toLocaleString()} bytes, Timeout: ${timeoutMs}ms)...`);

    stream = await downloadContentFromMessage(mediaKey, mediaType);

    const chunks = [];
    let totalSize = 0;

    for await (const chunk of stream) {
      if (controller.signal.aborted) {
        if (typeof stream.destroy === "function") {
          stream.destroy();
        } else if (typeof stream.cancel === "function") {
          stream.cancel();
        }
        clearTimeout(timeoutId);
        return null;
      }

      totalSize += chunk.length;

      if (totalSize > maxSize) {
        logger.warn(`[ getFileBuffer ] Download aborted for type '${mediaType}' - exceeded max size (${maxSize.toLocaleString()} bytes). Received ${totalSize.toLocaleString()} bytes.`);
        if (typeof stream.destroy === "function") {
          stream.destroy();
        } else if (typeof stream.cancel === "function") {
          stream.cancel();
        } else {
          logger.warn(`[ getFileBuffer ] Could not abort stream for size limit - no destroy() or cancel() method found.`);
        }
        clearTimeout(timeoutId);
        return null;
      }
      chunks.push(chunk);
    }

    clearTimeout(timeoutId);

    if (controller.signal.aborted) {
      logger.debug(`[ getFileBuffer ] Download aborted immediately after stream finished for type '${mediaType}'.`);
      return null;
    }

    if (chunks.length === 0 && totalSize === 0) {
      // Check totalSize too
      logger.warn(`[ getFileBuffer ] No data received from stream for media type '${mediaType}'. The media might be empty or inaccessible.`);
      return null;
    }

    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0 && totalSize > 0) {
      logger.warn(`[ getFileBuffer ] Download resulted in an empty buffer for media type '${mediaType}' after concatenation, despite receiving ${totalSize} bytes.`);
      return null;
    } else if (buffer.length === 0 && totalSize === 0) {
      logger.warn(`[ getFileBuffer ] Download resulted in an empty buffer and zero bytes received for media type '${mediaType}'.`);
      return null;
    }

    logger.info(`[ getFileBuffer ] Download successful: ${buffer.length.toLocaleString()} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB) downloaded for media type '${mediaType}'. Limit: ${maxSize.toLocaleString()} bytes.`);
    return buffer;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError" || controller.signal.aborted) {
      logger.warn(`[ getFileBuffer ] Download explicitly aborted for type '${mediaType}'.`);
      if (stream) {
        if (typeof stream.destroy === "function") stream.destroy();
        else if (typeof stream.cancel === "function") stream.cancel();
      }
      return null;
    }

    logger.error(`[ getFileBuffer ] Failed to download or process media type '${mediaType}'. Error: ${error?.message || error}`, {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      mediaType: mediaType,
      mediaKey: mediaKey,
    });

    if (stream) {
      if (typeof stream.destroy === "function") {
        stream.destroy();
      } else if (typeof stream.cancel === "function") {
        stream.cancel();
      }
    }
    return null;
  }
};

module.exports = {
  getFileBuffer,
};
