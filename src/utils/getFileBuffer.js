const { downloadContentFromMessage } = require("baileys");
const logger = require("./logger");
// Define valid media types for better validation
const VALID_MEDIA_TYPES = new Set(["audio", "video", "image", "document", "sticker"]);

// Define a default maximum allowed download size (e.g., 50MB)
const DEFAULT_MAX_ALLOWED_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// Define a default download timeout (e.g., 30 seconds)
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30 * 1000; // 30 seconds

/**
 * Downloads media content from a WhatsApp message and returns it as a Buffer.
 * Provides improved validation, error handling, size limit, and timeout.
 * Uses native AbortController (Node.js >= v15).
 *
 * @param {object} mediaKey - The media key object obtained from the Baileys message object.
 *                           Should contain properties needed by downloadContentFromMessage.
 *                           *Consider adding specific key checks if needed, but be wary of Baileys internal changes.*
 * @param {string} mediaType - The type of media to download (e.g., "audio", "video", "image").
 * @param {object} [options={}] - Optional configuration.
 * @param {boolean} [options.allowUnknownType=false] - If true, attempts download even if mediaType is not in VALID_MEDIA_TYPES.
 * @param {number} [options.maxSize] - Custom maximum download size in bytes. Defaults to DEFAULT_MAX_ALLOWED_SIZE_BYTES.
 * @param {number} [options.timeoutMs] - Custom download timeout in milliseconds. Defaults to DEFAULT_DOWNLOAD_TIMEOUT_MS.
 * @returns {Promise<Buffer|null>} - Returns the media content as a Buffer, or null if an error occurs,
 *                                   validation fails, the size limit is exceeded, or the timeout is reached.
 */
const getFileBuffer = async (mediaKey, mediaType, options = {}) => {
  const {
    allowUnknownType = false,
    maxSize = DEFAULT_MAX_ALLOWED_SIZE_BYTES,
    timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  } = options;

  // 1. Input Validation: Check for null/undefined
  if (!mediaKey || typeof mediaKey !== "object") {
    logger.warn(
      `[ getFileBuffer ] Invalid or missing 'mediaKey' parameter. Expected an object, received: ${typeof mediaKey}`
    );
    return null;
  }

  if (!mediaType || typeof mediaType !== "string") {
    logger.warn(
      `[ getFileBuffer ] Invalid or missing 'mediaType' parameter. Expected a string, received: ${typeof mediaType}`
    );
    return null;
  }

  // 2. Media Type Validation (with optional override)
  if (!VALID_MEDIA_TYPES.has(mediaType)) {
    if (!allowUnknownType) {
      logger.warn(
        `[ getFileBuffer ] Invalid mediaType specified: '${mediaType}'. Must be one of: ${[
          ...VALID_MEDIA_TYPES,
        ].join(", ")}. Set options.allowUnknownType=true to attempt download anyway.`
      );
      return null;
    } else {
      logger.info(
        `[ getFileBuffer ] Unknown mediaType specified: '${mediaType}'. Proceeding with download attempt as allowUnknownType is true.`
      );
    }
  }

  // 3. Download Logic with Robust Error Handling, Size Limit, and Timeout
  let stream;
  const controller = new AbortController(); // Usando AbortController nativo
  const timeoutId = setTimeout(() => {
    logger.warn(
      `[ getFileBuffer ] Download timed out after ${timeoutMs}ms for type '${mediaType}'. Aborting.`
    );
    controller.abort();
  }, timeoutMs);

  try {
    logger.debug(
      `[ getFileBuffer ] Attempting to download media type '${mediaType}' (Limit: ${maxSize.toLocaleString()} bytes, Timeout: ${timeoutMs}ms)...`
    );

    // Pass the AbortSignal to the download function if supported by baileys
    // Note: As of recent baileys versions, downloadContentFromMessage might not directly support AbortSignal.
    // The timeout mechanism here acts as the primary control. Check baileys docs for updates.
    stream = await downloadContentFromMessage(
      mediaKey,
      mediaType /*, { signal: controller.signal } */
    ); // Signal might not be used by baileys here

    const chunks = [];
    let totalSize = 0;

    for await (const chunk of stream) {
      // Check if aborted *before* processing chunk
      if (controller.signal.aborted) {
        // Ensure stream is properly closed on abort
        if (typeof stream.destroy === "function") {
          stream.destroy();
        } else if (typeof stream.cancel === "function") {
          // For potential future stream types
          stream.cancel();
        }
        // No need to throw here, the timeout log already happened, just exit loop
        logger.debug(
          `[ getFileBuffer ] Stream processing halted due to abort signal for type '${mediaType}'.`
        );
        clearTimeout(timeoutId); // Clear timeout as we are handling the abort
        return null; // Return null because the download was aborted
      }

      totalSize += chunk.length;

      if (totalSize > maxSize) {
        logger.warn(
          `[ getFileBuffer ] Download aborted for type '${mediaType}' - exceeded max size (${maxSize.toLocaleString()} bytes). Received ${totalSize.toLocaleString()} bytes.`
        );
        // Attempt to cleanly close the stream
        if (typeof stream.destroy === "function") {
          stream.destroy();
        } else if (typeof stream.cancel === "function") {
          stream.cancel();
        } else {
          logger.warn(
            `[ getFileBuffer ] Could not abort stream for size limit - no destroy() or cancel() method found.`
          );
        }
        clearTimeout(timeoutId); // Clear timeout as we are aborting due to size
        return null;
      }
      chunks.push(chunk);
    }

    // Clear timeout successfully if loop finishes without abort/error
    clearTimeout(timeoutId);

    // Final check after loop in case the abort happened exactly after the last chunk
    if (controller.signal.aborted) {
      logger.debug(
        `[ getFileBuffer ] Download aborted immediately after stream finished for type '${mediaType}'.`
      );
      return null;
    }

    if (chunks.length === 0 && totalSize === 0) {
      // Check totalSize too
      logger.warn(
        `[ getFileBuffer ] No data received from stream for media type '${mediaType}'. The media might be empty or inaccessible.`
      );
      return null;
    }

    const buffer = Buffer.concat(chunks);

    // This check might be redundant if totalSize > 0, but kept for safety
    if (buffer.length === 0 && totalSize > 0) {
      logger.warn(
        `[ getFileBuffer ] Download resulted in an empty buffer for media type '${mediaType}' after concatenation, despite receiving ${totalSize} bytes.`
      );
      return null;
    } else if (buffer.length === 0 && totalSize === 0) {
      // Already handled by the chunks.length check, but being explicit
      logger.warn(
        `[ getFileBuffer ] Download resulted in an empty buffer and zero bytes received for media type '${mediaType}'.`
      );
      return null;
    }

    logger.info(
      `[ getFileBuffer ] Download successful: ${buffer.length.toLocaleString()} bytes (${(
        buffer.length /
        1024 /
        1024
      ).toFixed(
        2
      )} MB) downloaded for media type '${mediaType}'. Limit: ${maxSize.toLocaleString()} bytes.`
    );
    return buffer;
  } catch (error) {
    clearTimeout(timeoutId); // Ensure timeout is cleared on any error

    // Check if the error is due to the abort signal we triggered
    if (error.name === "AbortError" || controller.signal.aborted) {
      logger.warn(`[ getFileBuffer ] Download explicitly aborted for type '${mediaType}'.`);
      // Ensure stream is cleaned up if it exists and error occurred mid-stream
      if (stream) {
        if (typeof stream.destroy === "function") stream.destroy();
        else if (typeof stream.cancel === "function") stream.cancel();
      }
      return null; // Don't log as error if it was our intended abort
    }

    // Log other errors
    logger.error(
      `[ getFileBuffer ] Failed to download or process media type '${mediaType}'. Error: ${
        error?.message || error
      }`,
      {
        // Include stack trace for better debugging
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        mediaType: mediaType,
        mediaKey: mediaKey, // Be cautious logging sensitive keys if applicable
      }
    );

    // Attempt cleanup even on unexpected errors
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
