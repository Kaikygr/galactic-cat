// /home/kaiky/Área de trabalho/dev/src/utils/functions.js
const { downloadContentFromMessage } = require("baileys");
const logger = require("./logger"); // Assuming logger supports optional chaining (?. method calls)

// Define valid media types for better validation
const VALID_MEDIA_TYPES = new Set(["audio", "video", "image", "document", "sticker"]);

// Define a maximum allowed download size (e.g., 50MB) to prevent resource exhaustion
// Adjust this value based on your needs and server capabilities.
const MAX_ALLOWED_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Downloads media content from a WhatsApp message and returns it as a Buffer.
 * Provides improved validation, error handling, and a size limit.
 *
 * @param {object} mediaKey - The media key object obtained from the Baileys message object.
 *                           Should contain properties needed by downloadContentFromMessage (e.g., mediaKey, directPath).
 * @param {string} mediaType - The type of media to download (e.g., "audio", "video", "image").
 * @param {object} [options={}] - Optional configuration.
 * @param {boolean} [options.allowUnknownType=false] - If true, attempts download even if mediaType is not in VALID_MEDIA_TYPES.
 * @returns {Promise<Buffer|null>} - Returns the media content as a Buffer, or null if an error occurs,
 *                                   validation fails, or the size limit is exceeded.
 */
const getFileBuffer = async (mediaKey, mediaType, options = {}) => {
  const { allowUnknownType = false } = options;

  // 1. Input Validation: Check for null/undefined
  if (!mediaKey || typeof mediaKey !== "object") {
    logger?.warn(`[ getFileBuffer ] 📄 Invalid or missing 'mediaKey' parameter. Expected an object, received: ${typeof mediaKey}`);
    return null;
  }

  if (!mediaType || typeof mediaType !== "string") {
    logger?.warn(`[ getFileBuffer ] 📄 Invalid or missing 'mediaType' parameter. Expected a string, received: ${typeof mediaType}`);
    return null;
  }

  // 2. Media Type Validation (with optional override)
  if (!VALID_MEDIA_TYPES.has(mediaType)) {
    if (!allowUnknownType) {
      logger?.warn(`[ getFileBuffer ] 📄 Invalid mediaType specified: '${mediaType}'. Must be one of: ${[...VALID_MEDIA_TYPES].join(", ")}. Set options.allowUnknownType=true to attempt download anyway.`);
      return null;
    } else {
      logger?.warn(`[ getFileBuffer ] 📄 Unknown mediaType specified: '${mediaType}'. Proceeding with download attempt as allowUnknownType is true.`);
      // Proceed, Baileys might handle it or throw an error caught below.
    }
  }

  // 3. Download Logic with Robust Error Handling and Size Limit
  let stream; // Declare stream outside try for potential use in finally/catch if needed
  try {
    logger?.debug(`[ getFileBuffer ] 📄 Attempting to download media type '${mediaType}'...`);
    stream = await downloadContentFromMessage(mediaKey, mediaType);
    const chunks = [];
    let totalSize = 0;

    // Asynchronously iterate over the stream chunks
    for await (const chunk of stream) {
      totalSize += chunk.length;

      // Check against the size limit
      if (totalSize > MAX_ALLOWED_SIZE_BYTES) {
        // Important: Abort the download stream to free up resources
        if (typeof stream.destroy === "function") {
          stream.destroy();
        } else if (typeof stream.cancel === "function") {
          // Some streams might use cancel()
          stream.cancel();
        }
        logger?.warn(`[ getFileBuffer ] 📄 Download aborted for type '${mediaType}' - exceeded max size (${MAX_ALLOWED_SIZE_BYTES} bytes). Received ${totalSize} bytes.`);
        return null; // Return null as the download is incomplete/failed due to size
      }
      chunks.push(chunk);
    }

    // Check if any data was received (stream might end without error but be empty)
    if (chunks.length === 0) {
      logger?.warn(`[ getFileBuffer ] 📄 No data received from stream for media type '${mediaType}'. The media might be empty or inaccessible.`);
      return null;
    }

    const buffer = Buffer.concat(chunks);

    // Final check if buffer is unexpectedly empty after concatenation
    if (buffer.length === 0) {
      logger?.warn(`[ getFileBuffer ] 📄 Download resulted in an empty buffer for media type '${mediaType}' after concatenation.`);
      return null;
    }

    logger?.info(`[ getFileBuffer ] 📄 Successfully downloaded ${buffer.length} bytes (within ${MAX_ALLOWED_SIZE_BYTES} byte limit) for media type '${mediaType}'.`);
    return buffer;
  } catch (error) {
    // Log specific errors for better debugging
    logger?.error(`[ getFileBuffer ] 📄 Failed to download or process media type '${mediaType}'. Error: ${error?.message || error}`, { stack: error?.stack });
    // Ensure stream is closed/destroyed on error if it exists and has a destroy method
    if (stream && typeof stream.destroy === "function") {
      stream.destroy();
    }
    return null; // Return null consistently on failure
  }
};

module.exports = {
  getFileBuffer,
  MAX_ALLOWED_SIZE_BYTES, // Export the constant if it might be useful elsewhere
};
