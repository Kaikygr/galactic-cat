const { default: makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason } = require('baileys');
const pino = require('pino');
const path = require('path');

require('dotenv').config();

const logger = require('../utils/logger');
const { initDatabase } = require('./../database/processDatabase');
const { createTables, processUserData } = require('./../controllers/userDataController');
const { processParticipantUpdate } = require('../controllers/groupEventsController');
const botController = require('../controllers/botController');

const AUTH_STATE_PATH = path.join(__dirname, 'temp', 'auth_state');

let reconnectAttempts = 0;
let reconnectTimeout = null;

let clientInstance = null;

const scheduleReconnect = (
  connectFn,
  options = {
    initialDelay: 1000, // 1 segundo
    maxDelay: 60000, // 60 segundos
    maxExponent: 6, // até 2^6 = 64x multiplicação no máximo
    label: 'scheduleReconnect',
  },
) => {
  if (reconnectTimeout) return;

  // Incrementa, mas limita para evitar overflow ou números excessivamente grandes se maxExponent for pequeno
  reconnectAttempts = Math.min(reconnectAttempts + 1, options.maxExponent + 10);
  const exponent = Math.min(reconnectAttempts, options.maxExponent);
  const delay = Math.min(options.initialDelay * 2 ** exponent, options.maxDelay);

  logger.warn(`[ ${options.label} ] Conexão perdida. Tentando reconectar em ${delay / 1000}s... Tentativa: ${reconnectAttempts}`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectFn();
  }, delay);
};

const resetReconnectAttempts = (label = 'ConnectionLogic') => {
  logger.info(`[ ${label} ] Resetando tentativas de reconexão.`);
  reconnectAttempts = 0;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
};

const handleConnectionUpdate = async (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info('[ handleConnectionUpdate ] 📱 QR Code recebido, escaneie por favor.');
    reconnectAttempts = 0;
    resetReconnectAttempts('handleConnectionUpdate-QR');
  }

  if (connection === 'connecting') {
    logger.info('[ handleConnectionUpdate ] ⏳ Conectando ao WhatsApp...');
  } else if (connection === 'open') {
    logger.info('[ handleConnectionUpdate ] ✅ Conexão aberta com sucesso. Bot disponível.');
    resetReconnectAttempts('handleConnectionUpdate-Open');
  } else if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.error(`[ handleConnectionUpdate ] ❌ Conexão fechada. Razão: ${DisconnectReason[statusCode] || 'Desconhecida'} (Código: ${statusCode})`);

    if (shouldReconnect) {
      logger.info('[ handleConnectionUpdate ] 🔄 Tentando reconectar...');
      scheduleReconnect(connectToWhatsApp, {
        initialDelay: 1000,
        maxDelay: 60000,
        maxExponent: 10, // Mantendo o valor original do MAX_RECONNECT_EXPONENT
        label: 'WhatsAppConnection',
      });
    } else {
      logger.error("[ handleConnectionUpdate ] 🚫 Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code.");
    }
  }
};

const handleCredsUpdate = async (saveCreds) => {
  try {
    await saveCreds();
    logger.info('[ handleCredsUpdate ] 🔒 Credenciais salvas com sucesso.');
  } catch (error) {
    logger.error('[ handleCredsUpdate ] ❌ Erro ao salvar credenciais:', error);
  }
};

const handleMessagesUpsert = async (data, client) => {
  if (!client) {
    logger.error('[ handleMessagesUpsert ] ❌ Erro interno: Instância do cliente inválida em handleMessagesUpsert.');
    return;
  }

  const msg = data.messages?.[0];

  if (!msg || !msg.key || !msg.message) {
    return;
  }
  setImmediate(
    async (deferredData, deferredClient, deferredMsg) => {
      const messageIdForLog = deferredMsg.key.id;
      const remoteJidForLog = deferredMsg.key.remoteJid;
      try {
        try {
          await processUserData(deferredData, deferredClient);
        } catch (error) {
          logger.error(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) ❌ Erro ao processar dados do usuário/mensagem (processUserData) para ${remoteJidForLog}: ${error.message}`, { stack: error.stack });
          return;
        }

        try {
          await botController(deferredData, deferredClient);
        } catch (error) {
          const messageType = Object.keys(deferredMsg.message || {})[0] || 'tipo desconhecido';
          logger.error(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) ❌ Erro em botController ao lidar com mensagem tipo '${messageType}' no JID ${remoteJidForLog}: ${error.message}`, {
            stack: error.stack,
          });
        }
      } catch (outerError) {
        logger.error(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) 💥 Erro crítico inesperado no processamento agendado para ${remoteJidForLog}: ${outerError.message}`, { stack: outerError.stack });
      } finally {
      }
    },
    data,
    client,
    msg,
  );
};

const handleGroupsUpdate = async (updates, client) => {
  if (!client) {
    logger.error('[ handleGroupsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupsUpdate.');
    return;
  }
  logger.info(`[ handleGroupsUpdate ] 🔄 Recebido ${updates.length} evento(s) de atualização de grupo.`);

  for (const event of updates) {
    const groupId = event.id;
    if (groupId) {
      logger.debug(`[ handleGroupsUpdate ] Evento de atualização para o grupo ${groupId}:`, event);
    } else {
      logger.warn('[ handleGroupsUpdate ] Recebido evento de atualização de grupo sem JID.');
    }
  }
};

const handleGroupParticipantsUpdate = async (event, client) => {
  if (!client) {
    logger.error('[ handleGroupParticipantsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupParticipantsUpdate.');
    return;
  }
  const groupId = event.id;
  logger.info(`[ handleGroupParticipantsUpdate ] 👥 Evento recebido para grupo ${groupId}. Ação: ${event.action}. Participantes: ${event.participants.join(', ')}`);
  try {
    await processParticipantUpdate(event, client);
  } catch (error) {
    logger.error(`[ handleGroupParticipantsUpdate ] ❌ Erro retornado pelo processador de evento (processParticipantUpdate) para ${groupId}: ${error.message}`, { stack: error.stack });
  }
};

const registerAllEventHandlers = (client, saveCreds) => {
  // Evento de atualização do estado da conexão
  client.ev.on('connection.update', (update) => handleConnectionUpdate(update));
  client.ev.on('creds.update', () => handleCredsUpdate(saveCreds));
  client.ev.on('messages.upsert', (data) => handleMessagesUpsert(data, client));
  client.ev.on('groups.update', (updates) => handleGroupsUpdate(updates, client));
  client.ev.on('group-participants.update', (event) => handleGroupParticipantsUpdate(event, client));
};

const connectToWhatsApp = async () => {
  try {
    logger.info(`[ connectToWhatsApp ] 🔒 Usando diretório de estado de autenticação: ${AUTH_STATE_PATH}`);
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_PATH);

    logger.info('[ connectToWhatsApp ] 🌐 Iniciando a conexão com o WhatsApp...');

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
    logger.error(`[ connectToWhatsApp ] 🔴 Erro crítico ao iniciar a conexão com o WhatsApp: ${error.message}`, {
      stack: error.stack,
    });
    scheduleReconnect(connectToWhatsApp, {
      initialDelay: 1500, // Pode ser um pouco diferente para o erro inicial
      maxDelay: 60000,
      maxExponent: 10,
      label: 'WhatsAppInitialConnectFail',
    });
    return null;
  }
};

const initializeApp = async () => {
  try {
    logger.info('[ initializeApp ] 🚀 Iniciando a aplicação...');

    await initDatabase();
    logger.info('[ initializeApp ] 💾 Pool de conexões do banco de dados inicializado.');

    await createTables();
    logger.info('[ initializeApp ] 📊 Tabelas do banco de dados verificadas/criadas.');

    await connectToWhatsApp();
  } catch (error) {
    logger.error(`[ initializeApp ] 💥 Falha crítica durante a inicialização da aplicação: ${error.message}`, {
      stack: error.stack,
    });
    process.exit(1);
  }
};

initializeApp();

module.exports = {
  getClientInstance: () => clientInstance,
};
