
/**
 * @file connection.js
 * @description Handles connection establishment with WhatsApp through the Baileys library,
 * authentication management, event registration, message processing, and reconnection logic.
 */

/**
 * Patches an interactive message by wrapping it in a viewOnceMessage if needed.
 *
 * @function patchInteractiveMessage
 * @param {Object} message - The original message object, potentially containing an interactiveMessage.
 * @returns {Object} - The modified message object with a viewOnceMessage structure if interactiveMessage exists; otherwise, returns the original message.
 */

/**
 * Increments the reconnect attempt counter and schedules a reconnection using an exponential backoff delay.
 *
 * @function scheduleReconnect
 * @returns {void}
 */

/**
 * Registers all event handlers for the WhatsApp client.
 *
 * This function handles:
 * - Simple events such as "chats.upsert" and "contacts.upsert" (with no operations).
 * - Group events like "groups.update" (updating the group metadata cache) and "group-participants.update" (logging updates).
 * - Processed events including "connection.update" for handling connection status, "creds.update" for credentials saving, 
 *   and "messages.upsert" for processing incoming messages via the bot controller.
 *
 * @function registerAllEventHandlers
 * @param {object} client - The WhatsApp client instance.
 * @param {Function} saveCreds - Callback function to persist authentication credentials.
 * @returns {void}
 */

/**
 * Handles connection updates from the WhatsApp client.
 *
 * On a connection open event:
 * - Logs a success message.
 * - Resets the reconnect attempt counter.
 * - Sends a status message to the bot owner indicating successful connection.
 *
 * On a connection close event:
 * - Clears any active metrics tracking intervals.
 * - Schedules a reconnect.
 *
 * @function handleConnectionUpdate
 * @param {Object} update - An object containing the connection update details.
 * @param {object} client - The WhatsApp client instance.
 * @returns {Promise<void>}
 */

/**
 * Establishes a connection to WhatsApp using the Baileys library.
 *
 * This function:
 * - Loads/initializes the multi-file authentication state.
 * - Configures and initializes the WhatsApp client.
 * - Binds an in-memory store for storing the state.
 * - Registers all necessary event handlers.
 *
 * If connection fails, it schedules a reconnection using exponential backoff.
 *
 * @async
 * @function connectToWhatsApp
 * @returns {Promise<void>}
 */


const { default: makeWASocket, Browsers, makeInMemoryStore } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const NodeCache = require("node-cache");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
const RECONNECT_INITIAL_DELAY = 2000;
const RECONNECT_MAX_DELAY = 60000;
let reconnectAttempts = 0;
let metricsIntervalId = null;

const logger = require("../utils/logger");
const { processMessage }  = require("./userSaveData")

const patchInteractiveMessage = message => {
  return message?.interactiveMessage
    ? {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadataVersion: 2,
              deviceListMetadata: {},
            },
            ...message,
          },
        },
      }
    : message;
};

const scheduleReconnect = () => {
  reconnectAttempts++;
  const delay = Math.min(RECONNECT_INITIAL_DELAY * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY);
  setTimeout(() => connectToWhatsApp(), delay);
};

const registerAllEventHandlers = (client, saveCreds) => {
  const simpleEvents = {
    "chats.upsert": () => {},
    "contacts.upsert": () => {},
  };

  Object.entries(simpleEvents).forEach(([event, handler]) => client.ev.on(event, handler));

  const groupEvents = {
    "groups.update": async ([event]) => {
      const metadata = await client.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    },

    "group-participants.update": async event => {
      logger.info(`Evento de atualização de participantes de grupo: ${JSON.stringify(event)}`);
    },
  };

  Object.entries(groupEvents).forEach(([event, handler]) => client.ev.on(event, handler));

  client.ev.process(async events => {
    const eventHandlers = {
      "connection.update": async data => await handleConnectionUpdate(data, client),

      "creds.update": async data => {
        await saveCreds();
      },

      "messages.upsert": async data => {
        processMessage(data);
        require(path.join(__dirname, "..", "controllers", "botController.js"))(data, client);
      },
    };

    for (const [event, data] of Object.entries(events)) {
      try {
        if (eventHandlers[event]) {
          await eventHandlers[event](data);
        }
      } catch (error) {
        logger.error(`Erro ao processar o evento ${event}: ${error.message}`);
      }
    }
  });
};

const handleConnectionUpdate = async (update, client) => {
  try {
    const { connection } = update;
    if (connection === "open") {
      logger.info("✅ Conexão aberta com sucesso. Bot disponível.");
      reconnectAttempts = 0;

      const config = require("../config/options.json");
      await client.sendMessage(config.owner.number, {
        text: "🟢 O bot foi iniciado com sucesso.",
      });
      logger.info("🛠️ Mensagem de status enviada para o proprietário.");
    }
    if (connection === "close") {
      if (metricsIntervalId) {
        clearInterval(metricsIntervalId);
        metricsIntervalId = null;
      }
      scheduleReconnect();
    }
  } catch (error) {
    scheduleReconnect();
  }
};

const connectToWhatsApp = async () => {
  try {
    const connectionLogs = path.join(__dirname, "temp");
    const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);
    logger.info("🌐 Iniciando a conexão com o WhatsApp...");

    const client = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      mobile: false,
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: true,
      cachedGroupMetadata: async jid => groupCache.get(jid),
      patchMessageBeforeSending: patchInteractiveMessage,
    });

    const store = makeInMemoryStore({});
    store.bind(client.ev);
    registerAllEventHandlers(client, saveCreds);
  } catch (error) {
    scheduleReconnect();
    logger.error(`🔴 Erro ao iniciar a conexão: ${error.message}`);
    throw new Error("Erro ao iniciar a conexão com o WhatsApp:", error);
  }
};

connectToWhatsApp().catch(async error => {
  scheduleReconnect();
  logger.error(`🔴 Erro ao iniciar a conexão: ${error.message}`);
  throw new Error("Error ao inciar a conexão com o WhatsApp:", error);
});
