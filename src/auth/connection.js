const {
  default: makeWASocket,
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
} = require("baileys");
const pino = require("pino");
const path = require("path");
const NodeCache = require("node-cache");
require("dotenv").config();

const logger = require("../utils/logger");
const { initDatabase } = require("./../database/processDatabase");
const { createTables, processUserData } = require("./../controllers/userDataController");
const botController = require("../controllers/botController");

const AUTH_STATE_PATH = path.join(__dirname, "temp", "auth_state");
const GROUP_CACHE_TTL_SECONDS = 5 * 60;
const RECONNECT_INITIAL_DELAY_MS = 2 * 1000;
const RECONNECT_MAX_DELAY_MS = 60 * 1000;

const groupMetadataCache = new NodeCache({ stdTTL: GROUP_CACHE_TTL_SECONDS, useClones: false });
let reconnectAttempts = 0;
let clientInstance = null;

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
  const delay = Math.min(
    RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempts,
    RECONNECT_MAX_DELAY_MS
  );
  logger.warn(
    `🔌 Conexão perdida. Tentando reconectar em ${
      delay / 1000
    } segundos... (Tentativa ${reconnectAttempts})`
  );
  setTimeout(connectToWhatsApp, delay);
};

const handleConnectionUpdate = async update => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info("📱 QR Code recebido, escaneie por favor.");
  }

  if (connection === "connecting") {
    logger.info("⏳ Conectando ao WhatsApp...");
  } else if (connection === "open") {
    logger.info("✅ Conexão aberta com sucesso. Bot disponível.");
    reconnectAttempts = 0;
  } else if (connection === "close") {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.error(
      `❌ Conexão fechada. Razão: ${
        DisconnectReason[statusCode] || "Desconhecida"
      } (Código: ${statusCode})`
    );

    if (shouldReconnect) {
      logger.info("🔄 Tentando reconectar...");
      scheduleReconnect();
    } else {
      logger.error(
        "🚫 Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code."
      );
    }
  }
};

const handleCredsUpdate = async saveCreds => {
  try {
    await saveCreds();
    ////logger.debug("🔒 Credenciais salvas com sucesso.");
  } catch (error) {
    logger.error("❌ Erro ao salvar credenciais:", error);
  }
};

const handleMessagesUpsert = async (data, client) => {
  if (!client) {
    logger.error(
      "[ handleMessagesUpsert ] ❌ Erro interno: Instância do cliente inválida em handleMessagesUpsert."
    );
    return;
  }
  try {
    await processUserData(data, client);
  } catch (error) {
    logger.error(
      `[ handleMessagesUpsert ] ❌ Erro ao processar dados do usuário/mensagem (processUserData): ${error.message}`,
      { stack: error.stack }
    );
  }

  try {
    await botController(data, client);
  } catch (error) {
    logger.error(
      `[ handleMessagesUpsert ] ❌ Erro no controlador do bot (botController): ${error.message}`,
      {
        stack: error.stack,
      }
    );
  }
};

const handleGroupsUpdate = async (updates, client) => {
  if (!client) {
    logger.error(
      "[ handleGroupsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupsUpdate."
    );
    return;
  }
  for (const event of updates) {
    if (event.id) {
      try {
        const metadata = await client.groupMetadata(event.id);
        if (metadata) {
          groupMetadataCache.set(event.id, metadata);
        } else {
          logger.warn(
            `[ handleGroupsUpdate ] ⚠️ Não foi possível obter metadados para o grupo ${event.id} após atualização.`
          );
        }
      } catch (error) {
        logger.error(
          `[ handleGroupsUpdate ] ❌ Erro ao buscar/cachear metadados do grupo ${event.id} em 'groups.update': ${error.message}`
        );
      }
    }
  }
};

const handleGroupParticipantsUpdate = async (event, client) => {
  logger.info(
    `[ handleGroupParticipantsUpdate ] 👥 Evento 'group-participants.update' no grupo ${
      event.id
    }. Ação: ${event.action}. Participantes: ${event.participants.join(", ")}`
  );
  try {
    const metadata = await client.groupMetadata(event.id);
    if (metadata) {
      groupMetadataCache.set(event.id, metadata);
    }
  } catch (error) {
    logger.error(
      `[ handleGroupParticipantsUpdate ] ❌ Erro ao atualizar metadados/participantes após 'group-participants.update' para ${event.id}: ${error.message}`
    );
  }
};

const registerAllEventHandlers = (client, saveCreds) => {
  client.ev.on("connection.update", update => handleConnectionUpdate(update));
  client.ev.on("creds.update", () => handleCredsUpdate(saveCreds));
  client.ev.on("messages.upsert", data => handleMessagesUpsert(data, client));
  client.ev.on("groups.update", updates => handleGroupsUpdate(updates, client));
  client.ev.on("group-participants.update", event => handleGroupParticipantsUpdate(event, client));
  client.ev.on("contacts.upsert", contacts => {
    // //logger.debug(`📞 Evento 'contacts.upsert': ${contacts.length} contato(s) atualizado(s).`);
  });
  client.ev.on("chats.upsert", chats => {
    ////logger.debug(`💬 Evento 'chats.upsert': ${chats.length} chat(s) atualizado(s).`);
  });
};

const connectToWhatsApp = async () => {
  try {
    logger.info(
      `[ connectToWhatsApp ]🔒 Usando diretório de estado de autenticação: ${AUTH_STATE_PATH}`
    );
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
      cachedGroupMetadata: async jid => {
        const cached = groupMetadataCache.get(jid);
        return cached;
      },
      patchMessageBeforeSending: patchInteractiveMessage,
    });

    registerAllEventHandlers(clientInstance, saveCreds);

    return clientInstance;
  } catch (error) {
    logger.error(
      `[ connectToWhatsApp ] 🔴 Erro crítico ao iniciar a conexão com o WhatsApp: ${error.message}`,
      {
        stack: error.stack,
      }
    );
    scheduleReconnect();
    return null;
  }
};

const initializeApp = async () => {
  try {
    logger.info("[ initializeApp ] 🚀 Iniciando a aplicação...");

    await initDatabase();
    logger.info("[ initializeApp ] 💾 Pool de conexões do banco de dados inicializado.");

    await createTables();
    logger.info("[ initializeApp ] 📊 Tabelas do banco de dados verificadas.");

    await connectToWhatsApp();
  } catch (error) {
    logger.error(
      `[ initializeApp ]💥 Falha crítica durante a inicialização da aplicação: ${error.message}`,
      {
        stack: error.stack,
      }
    );
  }
};

initializeApp();
