/**
 * @file Manages the WhatsApp connection, event handling, and reconnection logic using Baileys.
 * This module is responsible for initializing the WhatsApp client, handling various
 * events like connection updates, message receipts, group updates, and ensuring
 * credentials are saved. It also implements an exponential backoff strategy for reconnections.
 */

const { default: makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason } = require('baileys');
const pino = require('pino');
const path = require('path');

require('dotenv').config();

const logger = require('../utils/logger');
const { initDatabase } = require('./../database/processDatabase');
const { createTables, processUserData } = require('./../controllers/userDataController');
const { processParticipantUpdate } = require('../controllers/groupEventsController');
const botController = require('../controllers/botController');

/**
 * @constant {string} AUTH_STATE_PATH
 * @description The file system path where authentication state (session files) will be stored.
 */
const AUTH_STATE_PATH = path.join(__dirname, 'temp', 'auth_state');

/**
 * @type {number}
 * @description Counter for a_tual reconnection attempts.
 */
let reconnectAttempts = 0;
/**
 * @type {NodeJS.Timeout | null}
 * @description Timeout ID for the scheduled reconnection. Null if no reconnection is scheduled.
 */
let reconnectTimeout = null;

/**
 * @type {import('baileys').WASocket | null}
 * @description Holds the singleton instance of the Baileys WhatsApp client.
 */
let clientInstance = null;

/**
 * Schedules a reconnection attempt with an exponential backoff strategy.
 * @param {() => Promise<void> | void} connectFn - The function to call to attempt reconnection.
 * @param {object} [options] - Options for scheduling the reconnect.
 * @param {number} [options.initialDelay=1000] - Initial delay in milliseconds.
 * @param {number} [options.maxDelay=60000] - Maximum delay in milliseconds.
 * @param {number} [options.maxExponent=6] - Maximum exponent for the backoff calculation.
 * @param {string} [options.label='scheduleReconnect'] - A label for logging purposes.
 */
const scheduleReconnect = (
  connectFn,
  options = {
    initialDelay: 1000,
    maxDelay: 60000,
    maxExponent: 6,
    label: 'scheduleReconnect',
  },
) => {
  if (reconnectTimeout) return;

  reconnectAttempts = Math.min(reconnectAttempts + 1, options.maxExponent + 10);
  const exponent = Math.min(reconnectAttempts, options.maxExponent);
  const delay = Math.min(options.initialDelay * 2 ** exponent, options.maxDelay);

  logger.warn(`[ ${options.label} ] Conexão perdida. Tentando reconectar em ${delay / 1000}s... Tentativa: ${reconnectAttempts}`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectFn();
  }, delay);
};

/**
 * Resets the reconnection attempt counter and clears any pending reconnection timeout.
 * @param {string} [label='ConnectionLogic'] - A label for logging purposes to indicate
 *                                             what triggered the reset.
 */
const resetReconnectAttempts = (label = 'ConnectionLogic') => {
  logger.info(`[ ${label} ] Resetando tentativas de reconexão.`);
  reconnectAttempts = 0;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
};

/**
 * Handles connection updates from the Baileys client.
 * This includes QR code generation, connection status changes (connecting, open, close),
 * and managing reconnection logic based on disconnection reasons.
 * @param {Partial<import('baileys').ConnectionState>} update - The connection update object from Baileys.
 */
const handleConnectionUpdate = async (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info('[ handleConnectionUpdate ] QR Code recebido, escaneie por favor.');
    reconnectAttempts = 0;
    resetReconnectAttempts('handleConnectionUpdate-QR');
  }

  if (connection === 'connecting') {
    logger.info('[ handleConnectionUpdate ] Conectando ao WhatsApp...');
  } else if (connection === 'open') {
    logger.info('[ handleConnectionUpdate ] Conexão aberta com sucesso. Bot disponível.');
    resetReconnectAttempts('handleConnectionUpdate-Open');
  } else if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.error(`[ handleConnectionUpdate ] Conexão fechada. Razão: ${DisconnectReason[statusCode] || 'Desconhecida'} Código: ${statusCode}`);

    if (shouldReconnect) {
      logger.info('[ handleConnectionUpdate ] Tentando reconectar...');
      scheduleReconnect(connectToWhatsApp, {
        initialDelay: 1000,
        maxDelay: 60000,
        maxExponent: 10,
        label: 'WhatsAppConnection',
      });
    } else {
      logger.error("[ handleConnectionUpdate ]  Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code.");
    }
  }
};

/**
 * Handles credential updates from Baileys.
 * Saves the updated credentials using the `saveCreds` function provided by `useMultiFileAuthState`.
 * @param {() => Promise<void>} saveCreds - The function to save credentials.
 */
const handleCredsUpdate = async (saveCreds) => {
  if (typeof saveCreds !== 'function') {
    logger.error('[ handleCredsUpdate ] saveCreds não é uma função válida.');
    return;
  }

  try {
    await saveCreds();
    logger.info('[ handleCredsUpdate ] Credenciais salvas com sucesso.');
  } catch (error) {
    logger.error('[ handleCredsUpdate ] Erro ao salvar credenciais:', {
      message: error.message,
      stack: error.stack,
    });
  }
};

/**
 * Handles incoming or updated messages ('messages.upsert' event).
 * It ensures a valid client instance and message structure before delegating
 * the processing to `processMessage` using `setImmediate` to avoid blocking the event loop.
 * @param {import('baileys').BaileysEventMap['messages.upsert']} data - The message upsert data from Baileys.
 * @param {import('baileys').WASocket} client - The Baileys client instance.
 */
const handleMessagesUpsert = async (data, client) => {
  if (!client) {
    logger.error('[ handleMessagesUpsert ] Instância do cliente inválida.');
    return;
  }

  const msg = data.messages?.[0];
  if (!msg?.key?.remoteJid || !msg.message) {
    return;
  }

  // Process the message in the next tick to free up the event loop quickly.
  setImmediate(() => processMessage(data, client, msg));
};

/**
 * Processes a single message.
 * This function is responsible for calling `processUserData` to handle user-related data
 * and then `botController` to execute bot-specific logic for the message.
 * @param {import('baileys').BaileysEventMap['messages.upsert']} data - The raw message upsert data.
 * @param {import('baileys').WASocket} client - The Baileys client instance.
 * @param {import('baileys').WAMessage} msg - The specific message object to process.
 */
const processMessage = async (data, client, msg) => {
  const messageId = msg.key.id;
  const remoteJid = msg.key.remoteJid;

  try {
    await processUserData(data, client);
  } catch (err) {
    logger.error(`[ processMessage ] ID:${messageId} Erro em processUserData para ${remoteJid}: ${err.message}`, {
      stack: err.stack,
    });
    return;
  }

  try {
    await botController(data, client);
  } catch (err) {
    const messageType = Object.keys(msg.message || {})[0] || 'tipo desconhecido';
    logger.error(`[ processMessage ] ID:${messageId} ❌ Erro em botController com tipo '${messageType}' no JID ${remoteJid}: ${err.message}`, {
      stack: err.stack,
    });
    return;
  }
};

/**
 * Handles group metadata updates ('groups.update' event).
 * @param {import('baileys').GroupMetadata[]} updates - An array of group update objects from Baileys.
 * @param {import('baileys').WASocket} client - The Baileys client instance.
 */
const handleGroupsUpdate = async (updates, client) => {
  if (!client) {
    logger.error('[ handleGroupsUpdate ] Instância do cliente inválida.');
    return;
  }

  if (!Array.isArray(updates)) {
    logger.warn('[ handleGroupsUpdate ] Atualizações de grupo recebidas não são um array.');
    return;
  }

  logger.info(`[ handleGroupsUpdate ]  Recebido ${updates.length} evento(s) de atualização de grupo.`);

  updates.forEach((groupUpdate) => {
    const groupId = groupUpdate.id;
    if (groupId) {
      logger.debug(`[ handleGroupsUpdate ] Evento de atualização para o grupo ${groupId}:`, groupUpdate);
    } else {
      logger.warn('[ handleGroupsUpdate ] Evento de atualização de grupo sem JID.');
    }
  });
};

/**
 * Handles group participant updates ('group-participants.update' event).
 * This includes events like users joining, leaving, being promoted, or demoted in a group.
 * @param {import('baileys').GroupParticipantsUpdateData} event - The group participant update event data.
 * @param {import('baileys').WASocket} client - The Baileys client instance.
 */
const handleGroupParticipantsUpdate = async (event, client) => {
  if (!client) {
    logger.error('[ handleGroupParticipantsUpdate ] Instância do cliente inválida.');
    return;
  }

  if (!event || typeof event !== 'object' || !event.id || !Array.isArray(event.participants)) {
    logger.warn('[ handleGroupParticipantsUpdate ] Evento de participantes inválido ou malformado.');
    return;
  }

  const groupId = event.id;
  const action = event.action || 'ação desconhecida';
  const participants = event.participants.join(', ');

  logger.info(`[ handleGroupParticipantsUpdate ] Evento recebido para grupo ${groupId}. Ação: ${action}. Participantes: ${participants}`);

  try {
    await processParticipantUpdate(event, client);
  } catch (error) {
    logger.error(`[ handleGroupParticipantsUpdate ] Erro ao processar evento para ${groupId}: ${error.message}`, {
      stack: error.stack,
    });
  }
};

/**
 * Registers all Baileys event handlers to their respective handler functions.
 * @param {import('baileys').WASocket} client - The Baileys client instance.
 * @param {() => Promise<void>} saveCreds - The function to save credentials,
 *                                         passed to `handleCredsUpdate`.
 */
const registerAllEventHandlers = (client, saveCreds) => {
  client.ev.on('connection.update', (update) => handleConnectionUpdate(update));
  client.ev.on('creds.update', () => handleCredsUpdate(saveCreds));
  client.ev.on('messages.upsert', (data) => handleMessagesUpsert(data, client));
  client.ev.on('groups.update', (updates) => handleGroupsUpdate(updates, client));
  client.ev.on('group-participants.update', (event) => handleGroupParticipantsUpdate(event, client));
};

/**
 * Initializes and connects the Baileys WhatsApp client.
 * It sets up multi-file authentication, configures the socket with appropriate options,
 * registers event handlers, and handles initial connection errors by scheduling reconnections.
 * @async
 * @returns {Promise<import('baileys').WASocket | null>} A promise that resolves to the Baileys client instance, or null if a critical error occurs during initial setup.
 */
const connectToWhatsApp = async () => {
  try {
    logger.info(`[ connectToWhatsApp ] Usando diretório de estado de autenticação: ${AUTH_STATE_PATH}`);
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_PATH);

    logger.info('[ connectToWhatsApp ] Iniciando a conexão com o WhatsApp...');

    clientInstance = makeWASocket({
      auth: state,
      logger: pino({ level: process.env.DEBUG_BAILEYS === 'true' ? 'debug' : 'silent' }),
      printQRInTerminal: true,
      mobile: false,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: process.env.SYNC_FULL_HISTORY === 'true',
      msgRetryCounterMap: {},
    });

    registerAllEventHandlers(clientInstance, saveCreds);

    return clientInstance;
  } catch (error) {
    logger.error(`[ connectToWhatsApp ] Erro crítico ao iniciar a conexão com o WhatsApp: ${error.message}`, {
      stack: error.stack,
    });
    scheduleReconnect(connectToWhatsApp, {
      initialDelay: 1500,
      maxDelay: 60000,
      maxExponent: 10,
      label: 'WhatsAppInitialConnectFail',
    });
    return null;
  }
};

/**
 * Initializes the application.
 * This function orchestrates the setup of the database, creation/verification of tables,
 * and then initiates the connection to WhatsApp.
 * @async
 */
const initializeApp = async () => {
  try {
    logger.info('[ initializeApp ] Iniciando a aplicação...');

    await initDatabase();
    logger.info('[ initializeApp ] Pool de conexões do banco de dados inicializado.');

    await createTables();
    logger.info('[ initializeApp ] Tabelas do banco de dados verificadas/criadas.');

    await connectToWhatsApp();
  } catch (error) {
    logger.error(`[ initializeApp ] Falha crítica durante a inicialização da aplicação: ${error.message}`, {
      stack: error.stack,
    });
    process.exit(1);
  }
};

initializeApp();

/**
 * @module connection
 * @description Provides access to the Baileys WhatsApp client instance.
 */
module.exports = {
  /** @returns {import('baileys').WASocket | null} The current Baileys client instance, or null if not connected. */
  getClientInstance: () => clientInstance,
};
