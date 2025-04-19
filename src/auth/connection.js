const { default: makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason } = require("baileys");
const pino = require("pino");
const path = require("path");
const NodeCache = require("node-cache");
require("dotenv").config();

const logger = require("../utils/logger");
const { initDatabase } = require("./../database/processDatabase");
const { createTables, processUserData } = require("./../controllers/userDataController");
const botController = require("../controllers/botController");
// Import the new handler
const { processParticipantUpdate } = require("../controllers/groupEventsController"); // <--- ADD THIS

const AUTH_STATE_PATH = path.join(__dirname, "temp", "auth_state");
const GROUP_CACHE_TTL_SECONDS = 5 * 60;
const RECONNECT_INITIAL_DELAY_MS = 2 * 1000;
const RECONNECT_MAX_DELAY_MS = 60 * 1000;

const groupMetadataCache = new NodeCache({ stdTTL: GROUP_CACHE_TTL_SECONDS, useClones: false });
let reconnectAttempts = 0;
let clientInstance = null;

const patchInteractiveMessage = message => {
  // ... (keep existing code)
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
  // ... (keep existing code)
  reconnectAttempts++;
  const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS);
  logger.warn(`[ scheduleReconnect ] 🔌 Conexão perdida. Tentando reconectar em ${delay / 1000} segundos... (Tentativa ${reconnectAttempts})`);
  setTimeout(connectToWhatsApp, delay);
};

const handleConnectionUpdate = async update => {
  // ... (keep existing code)
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info("[ handleConnectionUpdate ] 📱 QR Code recebido, escaneie por favor."); // Changed log tag
  }

  if (connection === "connecting") {
    logger.info("[ handleConnectionUpdate ] ⏳ Conectando ao WhatsApp..."); // Changed log tag
  } else if (connection === "open") {
    logger.info("[ handleConnectionUpdate ] ✅ Conexão aberta com sucesso. Bot disponível."); // Changed log tag
    reconnectAttempts = 0;
  } else if (connection === "close") {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.error(
      `[ handleConnectionUpdate ] ❌ Conexão fechada. Razão: ${
        // Changed log tag
        DisconnectReason[statusCode] || "Desconhecida"
      } (Código: ${statusCode})`
    );

    if (shouldReconnect) {
      logger.info("[ handleConnectionUpdate ] 🔄 Tentando reconectar..."); // Changed log tag
      scheduleReconnect();
    } else {
      logger.error(
        "[ handleConnectionUpdate ] 🚫 Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code." // Changed log tag
      );
    }
  }
};

const handleCredsUpdate = async saveCreds => {
  // ... (keep existing code)
  try {
    await saveCreds();
    logger.info("[ handleCredsUpdate ] 🔒 Credenciais salvas com sucesso.");
  } catch (error) {
    logger.error("[ handleCredsUpdate ] ❌ Erro ao salvar credenciais:", error);
  }
};

const handleMessagesUpsert = async (data, client) => {
  // ... (keep existing code)
  if (!client) {
    logger.error("[ handleMessagesUpsert ] ❌ Erro interno: Instância do cliente inválida em handleMessagesUpsert.");
    return;
  }
  try {
    await processUserData(data, client);
  } catch (error) {
    logger.error(`[ handleMessagesUpsert ] ❌ Erro ao processar dados do usuário/mensagem (processUserData): ${error.message}`, { stack: error.stack });
  }

  try {
    await botController(data, client);
  } catch (error) {
    logger.error(`[ handleMessagesUpsert ] ❌ Erro no controlador do bot (botController): ${error.message}`, {
      stack: error.stack,
    });
  }
};

const handleGroupsUpdate = async (updates, client) => {
  // ... (keep existing code)
  if (!client) {
    logger.error("[ handleGroupsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupsUpdate.");
    return;
  }
  for (const event of updates) {
    if (event.id) {
      try {
        const metadata = await client.groupMetadata(event.id);
        if (metadata) {
          groupMetadataCache.set(event.id, metadata);
        } else {
          logger.warn(`[ handleGroupsUpdate ] ⚠️ Não foi possível obter metadados para o grupo ${event.id} após atualização.`);
        }
      } catch (error) {
        logger.error(`[ handleGroupsUpdate ] ❌ Erro ao buscar/cachear metadados do grupo ${event.id} em 'groups.update': ${error.message}`);
      }
    }
  }
};

// --- MODIFIED FUNCTION ---
const handleGroupParticipantsUpdate = async (event, client) => {
  logger.info(`[ handleGroupParticipantsUpdate ] 👥 Evento recebido para grupo ${event.id}. Ação: ${event.action}. Participantes: ${event.participants.join(", ")}`);

  // 1. Update local cache (optional but often useful)
  try {
    const metadata = await client.groupMetadata(event.id);
    if (metadata) {
      groupMetadataCache.set(event.id, metadata);
      logger.debug(`[ handleGroupParticipantsUpdate ] Cache de metadados atualizado para ${event.id}`);
    } else {
      logger.warn(`[ handleGroupParticipantsUpdate ] Não foi possível obter metadados para ${event.id} para atualizar o cache.`);
    }
  } catch (error) {
    logger.error(`[ handleGroupParticipantsUpdate ] ❌ Erro ao buscar/cachear metadados após 'group-participants.update' para ${event.id}: ${error.message}`);
    // Decide if you want to proceed without updated cache or return
    // return; // Example: Stop processing if cache update fails critically
  }

  // 2. Delegate processing to the dedicated handler
  try {
    // Pass the original event and the client instance
    await processParticipantUpdate(event, client);
  } catch (error) {
    // Catch errors specifically from the delegated handler (though it should ideally handle its own errors)
    logger.error(
      `[ handleGroupParticipantsUpdate ] ❌ Erro retornado pelo processador de evento (processParticipantUpdate) para ${event.id}: ${error.message}`,
      { stack: error.stack } // Log stack if available
    );
  }
};
// --- END OF MODIFIED FUNCTION ---

const registerAllEventHandlers = (client, saveCreds) => {
  client.ev.on("connection.update", update => handleConnectionUpdate(update));
  client.ev.on("creds.update", () => handleCredsUpdate(saveCreds)); // No need to pass saveCreds directly if handleCredsUpdate closes over it
  client.ev.on("messages.upsert", data => handleMessagesUpsert(data, client));
  client.ev.on("groups.update", updates => handleGroupsUpdate(updates, client));
  // The handler function itself is updated, the registration remains the same
  client.ev.on("group-participants.update", event => handleGroupParticipantsUpdate(event, client));
  client.ev.on("contacts.upsert", contacts => {
    logger.info(`[ registerAllEventHandlers ] 📞 Evento 'contacts.upsert': ${contacts.length} contato(s) atualizado(s).`);
  });
  client.ev.on("chats.upsert", chats => {
    logger.debug(`[ registerAllEventHandlers ] 💬 Evento 'chats.upsert': ${chats.length} chat(s) atualizado(s).`);
  });
};

const connectToWhatsApp = async () => {
  // ... (keep existing code)
  try {
    logger.info(`[ connectToWhatsApp ] 🔒 Usando diretório de estado de autenticação: ${AUTH_STATE_PATH}`);
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_PATH);

    logger.info("[ connectToWhatsApp ] 🌐 Iniciando a conexão com o WhatsApp...");

    clientInstance = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      mobile: false,
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: false,
      msgRetryCounterMap: {},
      // Keep the cachedGroupMetadata function as it uses the local cache
      cachedGroupMetadata: async jid => {
        const cached = groupMetadataCache.get(jid);
        // logger.debug(`[ cachedGroupMetadata ] Cache hit for ${jid}: ${!!cached}`); // Optional: debug cache hits
        return cached;
      },
      patchMessageBeforeSending: patchInteractiveMessage,
    });

    // Pass saveCreds correctly here if needed by handleCredsUpdate closure
    registerAllEventHandlers(clientInstance, saveCreds);

    return clientInstance;
  } catch (error) {
    logger.error(`[ connectToWhatsApp ] 🔴 Erro crítico ao iniciar a conexão com o WhatsApp: ${error.message}`, {
      stack: error.stack,
    });
    scheduleReconnect();
    return null;
  }
};

const initializeApp = async () => {
  // ... (keep existing code)
  try {
    logger.info("[ initializeApp ] 🚀 Iniciando a aplicação...");

    await initDatabase();
    logger.info("[ initializeApp ] 💾 Pool de conexões do banco de dados inicializado.");

    await createTables();
    logger.info("[ initializeApp ] 📊 Tabelas do banco de dados verificadas.");

    await connectToWhatsApp();
  } catch (error) {
    logger.error(`[ initializeApp ] 💥 Falha crítica durante a inicialização da aplicação: ${error.message}`, {
      stack: error.stack,
    });
    // Consider exiting or implementing more robust retry logic here if initialization fails critically
    // process.exit(1);
  }
};

initializeApp();
