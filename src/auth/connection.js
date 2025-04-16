// /home/kaiky/Área de trabalho/dev/src/auth/connection.js

// --- Core Dependencies ---
const { default: makeWASocket, Browsers, makeInMemoryStore, useMultiFileAuthState, DisconnectReason } = require("baileys");
const pino = require("pino");
const path = require("path");
const NodeCache = require("node-cache");
require("dotenv").config(); // Ensure environment variables are loaded

// --- Utilities & Controllers ---
const logger = require("../utils/logger");
const { getFileBuffer } = require("../utils/getFileBuffer"); // Assuming needed by botController indirectly
const { initDatabase, runQuery } = require("./../database/processDatabase"); // Correct import
const { createTables, processUserData } = require("./../controllers/userDataController"); // Correct import
const botController = require("../controllers/botController"); // Correct import path
const { isUserPremium } = require("../controllers/rateLimitController"); // Example if needed elsewhere

// --- Constants ---
const AUTH_STATE_PATH = path.join(__dirname, "temp", "auth_state"); // Define path clearly
const GROUP_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const RECONNECT_INITIAL_DELAY_MS = 2 * 1000; // 2 seconds
const RECONNECT_MAX_DELAY_MS = 60 * 1000; // 1 minute

// --- Module State ---
const groupMetadataCache = new NodeCache({ stdTTL: GROUP_CACHE_TTL_SECONDS, useClones: false });
let reconnectAttempts = 0;
let clientInstance = null; // Hold the client instance

// --- Helper Functions ---

/**
 * Patches interactive messages for compatibility.
 * @param {object} message - The message object.
 * @returns {object} - The patched message object.
 */
const patchInteractiveMessage = message => {
  // This function seems specific to Baileys handling; keep unless known to be obsolete.
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

/**
 * Schedules a reconnection attempt with exponential backoff.
 */
const scheduleReconnect = () => {
  reconnectAttempts++;
  const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS);
  logger.warn(`🔌 Conexão perdida. Tentando reconectar em ${delay / 1000} segundos... (Tentativa ${reconnectAttempts})`);
  setTimeout(connectToWhatsApp, delay);
};

// --- Event Handlers ---

/**
 * Handles connection updates (open, close, connecting).
 * @param {object} update - The connection update object from Baileys.
 */
const handleConnectionUpdate = async update => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info("📱 QR Code recebido, escaneie por favor.");
    // Optionally: Implement QR code display/handling (e.g., qrcode-terminal)
  }

  if (connection === "connecting") {
    logger.info("⏳ Conectando ao WhatsApp...");
  } else if (connection === "open") {
    logger.info("✅ Conexão aberta com sucesso. Bot disponível.");
    reconnectAttempts = 0; // Reset attempts on successful connection
  } else if (connection === "close") {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.error(`❌ Conexão fechada. Razão: ${DisconnectReason[statusCode] || "Desconhecida"} (Código: ${statusCode})`);

    if (shouldReconnect) {
      logger.info("🔄 Tentando reconectar...");
      scheduleReconnect();
    } else {
      logger.error("🚫 Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code.");
      // Optionally: Implement cleanup or exit logic
      // process.exit(1); // Example: Exit if logged out
    }
  }
};

/**
 * Handles credential updates.
 * @param {Function} saveCreds - Function to save the authentication state.
 */
const handleCredsUpdate = async saveCreds => {
  try {
    await saveCreds();
    logger.debug("🔒 Credenciais salvas com sucesso.");
  } catch (error) {
    logger.error("❌ Erro ao salvar credenciais:", error);
  }
};

/**
 * Handles incoming messages ('messages.upsert').
 * @param {object} data - The message upsert data from Baileys.
 * @param {object} client - The Baileys client instance.
 */
const handleMessagesUpsert = async (data, client) => {
  // Ensure client is valid before proceeding
  if (!client) {
    logger.error("❌ Erro interno: Instância do cliente inválida em handleMessagesUpsert.");
    return;
  }
  try {
    // Process user data first (saving users, groups, messages)
    // Pass the client instance correctly
    await processUserData(data, client);
  } catch (error) {
    logger.error(`❌ Erro ao processar dados do usuário/mensagem (processUserData): ${error.message}`, { stack: error.stack });
    // Decide if you want to continue to botController even if userData fails
  }

  try {
    // Process commands and bot logic
    await botController(data, client);
  } catch (error) {
    logger.error(`❌ Erro no controlador do bot (botController): ${error.message}`, { stack: error.stack });
  }
};

/**
 * Handles group metadata updates.
 * @param {Array<object>} updates - Array of group update events.
 * @param {object} client - The Baileys client instance.
 */
const handleGroupsUpdate = async (updates, client) => {
  if (!client) {
    logger.error("❌ Erro interno: Instância do cliente inválida em handleGroupsUpdate.");
    return;
  }
  logger.debug(`🔄 Evento 'groups.update' recebido: ${updates.length} atualização(ões).`);
  for (const event of updates) {
    if (event.id) {
      try {
        logger.info(`✨ Atualizando metadados para o grupo: ${event.id}`);
        const metadata = await client.groupMetadata(event.id);
        if (metadata) {
          groupMetadataCache.set(event.id, metadata);
          logger.debug(`📦 Metadados do grupo ${event.id} cacheados.`);
          // Optionally: Save updated metadata to the database here as well
          // await saveGroupToDatabase(metadata); // Assuming you have this function in userDataController
        } else {
          logger.warn(`⚠️ Não foi possível obter metadados para o grupo ${event.id} após atualização.`);
        }
      } catch (error) {
        logger.error(`❌ Erro ao buscar/cachear metadados do grupo ${event.id} em 'groups.update': ${error.message}`);
      }
    }
  }
};

/**
 * Handles group participant updates.
 * @param {object} event - The participant update event data.
 * @param {object} client - The Baileys client instance.
 */
const handleGroupParticipantsUpdate = async (event, client) => {
  // Example: Log participant changes
  logger.info(`👥 Evento 'group-participants.update' no grupo ${event.id}. Ação: ${event.action}. Participantes: ${event.participants.join(", ")}`);
  // Optionally: Update your database based on adds/removes/promotions/demotions
  // You might need to fetch fresh group metadata here if the cache isn't updated fast enough
  try {
    const metadata = await client.groupMetadata(event.id);
    if (metadata) {
      groupMetadataCache.set(event.id, metadata); // Update cache
      // await saveGroupParticipantsToDatabase(event.id, metadata.participants); // Update DB
    }
  } catch (error) {
    logger.error(`❌ Erro ao atualizar metadados/participantes após 'group-participants.update' para ${event.id}: ${error.message}`);
  }
};

/**
 * Registers all necessary Baileys event handlers.
 * @param {object} client - The Baileys client instance.
 * @param {Function} saveCreds - Function to save authentication state.
 */
const registerAllEventHandlers = (client, saveCreds) => {
  // Connection Events
  client.ev.on("connection.update", update => handleConnectionUpdate(update)); // Pass only update
  client.ev.on("creds.update", () => handleCredsUpdate(saveCreds)); // Pass saveCreds

  // Message Events
  client.ev.on("messages.upsert", data => handleMessagesUpsert(data, client)); // Pass data and client

  // Group Events
  client.ev.on("groups.update", updates => handleGroupsUpdate(updates, client)); // Pass updates and client
  client.ev.on("group-participants.update", event => handleGroupParticipantsUpdate(event, client)); // Pass event and client

  // Other potential events to handle (optional)
  client.ev.on("contacts.upsert", contacts => {
    logger.debug(`📞 Evento 'contacts.upsert': ${contacts.length} contato(s) atualizado(s).`);
    // Handle contact updates if needed
  });
  client.ev.on("chats.upsert", chats => {
    logger.debug(`💬 Evento 'chats.upsert': ${chats.length} chat(s) atualizado(s).`);
    // Handle chat updates if needed
  });

  logger.info("👂 Todos os handlers de eventos registrados.");
};

// --- Main Connection Logic ---

/**
 * Initializes and connects to WhatsApp.
 */
const connectToWhatsApp = async () => {
  try {
    // Ensure the auth state directory exists (optional, useMultiFileAuthState might create it)
    // fs.mkdirSync(AUTH_STATE_PATH, { recursive: true }); // Uncomment if needed

    // IMPORTANT: Add AUTH_STATE_PATH to your .gitignore file!
    logger.info(`🔒 Usando diretório de estado de autenticação: ${AUTH_STATE_PATH}`);
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_PATH);

    logger.info("🌐 Iniciando a conexão com o WhatsApp...");

    clientInstance = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }), // Use 'debug' or 'info' for more Baileys logs
      printQRInTerminal: true,
      mobile: false, // Keep false unless specifically needed and handled
      browser: Browsers.macOS("Desktop"), // Or Browsers.appropriate('Desktop')
      syncFullHistory: false, // Set to true only if absolutely necessary - significantly increases startup time/resources
      msgRetryCounterMap: {}, // Keep default retry logic
      // Provide the cache fetch function
      cachedGroupMetadata: async jid => {
        const cached = groupMetadataCache.get(jid);
        if (cached) logger.debug(`📦 [Cache Hit] Metadados do grupo ${jid} encontrados.`);
        else logger.debug(`📦 [Cache Miss] Metadados do grupo ${jid} não encontrados.`);
        return cached;
      },
      patchMessageBeforeSending: patchInteractiveMessage,
      // Consider adding connection options for reliability:
      // connectTimeoutMs: 30_000, // 30 seconds
      // keepAliveIntervalMs: 20_000 // 20 seconds
    });

    // --- Store Setup (Optional but Recommended for some features) ---
    // const store = makeInMemoryStore({});
    // store.bind(clientInstance.ev); // Bind store to events if using it

    // Register all event handlers
    registerAllEventHandlers(clientInstance, saveCreds);

    return clientInstance; // Return the client instance on success
  } catch (error) {
    logger.error(`🔴 Erro crítico ao iniciar a conexão com o WhatsApp: ${error.message}`, { stack: error.stack });
    // Schedule reconnect even if initial connection fails critically
    scheduleReconnect();
    // Re-throw or handle appropriately if needed elsewhere
    // throw new Error(`Falha ao iniciar conexão: ${error.message}`);
    return null; // Indicate failure
  }
};

/**
 * Initializes the application (Database, etc.) and starts the WhatsApp connection.
 */
const initializeApp = async () => {
  try {
    logger.info("🚀 Iniciando a aplicação...");

    // 1. Initialize Database Pool (once)
    await initDatabase(); // Corrected call
    logger.info("💾 Pool de conexões do banco de dados inicializado.");

    // 2. Create/Verify Database Tables (once)
    await createTables(); // Corrected call
    logger.info("📊 Tabelas do banco de dados verificadas/criadas.");

    // 3. Start WhatsApp Connection
    await connectToWhatsApp();
  } catch (error) {
    logger.error(`💥 Falha crítica durante a inicialização da aplicação: ${error.message}`, { stack: error.stack });
    // Decide if the app should exit or attempt recovery
    // process.exit(1); // Example: Exit on critical initialization failure
    // If connectToWhatsApp failed, scheduleReconnect should have been called already.
  }
};

// --- Start the Application ---
initializeApp();

// Optional: Export the client instance if needed elsewhere (use with caution)
// module.exports = { getClient: () => clientInstance };
