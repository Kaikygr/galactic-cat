const {
  default: makeWASocket,
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  GroupMetadata,
} = require('baileys');
const pino = require('pino');
const path = require('path');
const NodeCache = require('node-cache');

require('dotenv').config();

const logger = require('../utils/logger');
const { initDatabase } = require('./../database/processDatabase');
const { createTables, processUserData } = require('./../controllers/userDataController');
const { processParticipantUpdate } = require('../controllers/groupEventsController');
const botController = require('../controllers/botController');

const AUTH_STATE_PATH = path.join(__dirname, 'temp', 'auth_state');
const GROUP_CACHE_TTL_SECONDS = 5 * 60;

const RECONNECT_INITIAL_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 60000;
const MAX_RECONNECT_EXPONENT = 10;

// Estado interno
let reconnectAttempts = 0;
let reconnectTimeout = null;

const groupMetadataCache = new NodeCache({
  stdTTL: GROUP_CACHE_TTL_SECONDS,
  useClones: false,
  checkperiod: 60,
});

const pendingMetadataRequests = new Map();
let clientInstance = null;

//----- manipulando o cache de metadados de grupos -----//
const getGroupMetadata = async (jid, client) => {
  if (!jid || !client) {
    logger.warn(`[ getGroupMetadata ] JID ou cliente inválido fornecido.`, { jid, client });
    return null;
  }

  if (pendingMetadataRequests.has(jid)) {
    logger.debug(
      `[ getGroupMetadata ] Busca pendente encontrada para ${jid}. Aguardando resultado...`,
    );
    return pendingMetadataRequests.get(jid);
  }

  const cachedData = groupMetadataCache.get(jid);
  if (cachedData) {
    logger.debug(` [ getGroupMetadata ] Cache hit para ${jid}. Retornando dados do cache.`);
    return cachedData;
  }

  logger.debug(
    `[ getGroupMetadata ] Cache miss para ${jid}. Iniciando busca e marcando como pendente...`,
  );
  const fetchPromise = (async () => {
    try {
      const metadata = await client.groupMetadata(jid);

      if (metadata && typeof metadata === 'object' && metadata.id) {
        groupMetadataCache.set(jid, metadata);
        logger.debug(` [ getGroupMetadata ] Metadados buscados e cacheados para ${jid}`);
        return metadata;
      } else {
        logger.warn(
          `[ getGroupMetadata ] client.groupMetadata retornou valor inválido ou sem ID para ${jid}. Retorno:`,
          { clientGroupMetadata: metadata },
        );
        return null;
      }
    } catch (error) {
      const statusCode = error.output?.statusCode;
      if (statusCode === 404 || statusCode === 401 || statusCode === 403) {
        logger.warn(
          `[ getGroupMetadata ] Não foi possível buscar metadados para ${jid}. Grupo não encontrado, bot não é participante ou acesso proibido (Status: ${statusCode}).`,
        );
      } else {
        logger.error(
          `[ getGroupMetadata ] Erro inesperado ao buscar metadados para ${jid}: ${error.message}`,
          { stack: error.stack },
        );
      }
      return null;
    } finally {
      pendingMetadataRequests.delete(jid);
      logger.debug(`[ getGroupMetadata ] Busca para ${jid} concluída. Removido das pendências.`);
    }
  })();

  pendingMetadataRequests.set(jid, fetchPromise);

  return fetchPromise;
};
//---- fim do manipulando o cache de metadados de grupos ----//

const scheduleReconnect = () => {
  if (reconnectTimeout) return; // Já há um reconect agendado, evita duplicidade

  reconnectAttempts++;
  const exponent = Math.min(reconnectAttempts, MAX_RECONNECT_EXPONENT);
  const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * 2 ** exponent, RECONNECT_MAX_DELAY_MS);

  logger.warn(
    `[ scheduleReconnect ] 🔌 Conexão perdida. Tentando reconectar em ${
      delay / 1000
    } segundos... (Tentativa ${reconnectAttempts})`,
  );

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectToWhatsApp();
  }, delay);
};

const handleConnectionUpdate = async (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info('[ handleConnectionUpdate ] 📱 QR Code recebido, escaneie por favor.');
    reconnectAttempts = 0;
    logger.info(
      '[ handleConnectionUpdate ] 🔄 Contador de tentativas de reconexão resetado devido a novo QR.',
    );
  }

  if (connection === 'connecting') {
    logger.info('[ handleConnectionUpdate ] ⏳ Conectando ao WhatsApp...');
  } else if (connection === 'open') {
    logger.info('[ handleConnectionUpdate ] ✅ Conexão aberta com sucesso. Bot disponível.');
    reconnectAttempts = 0;
  } else if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.error(
      `[ handleConnectionUpdate ] ❌ Conexão fechada. Razão: ${
        DisconnectReason[statusCode] || 'Desconhecida'
      } (Código: ${statusCode})`,
    );

    if (shouldReconnect) {
      logger.info('[ handleConnectionUpdate ] 🔄 Tentando reconectar...');
      scheduleReconnect();
    } else {
      logger.error(
        "[ handleConnectionUpdate ] 🚫 Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code.",
      );
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
    logger.error(
      '[ handleMessagesUpsert ] ❌ Erro interno: Instância do cliente inválida em handleMessagesUpsert.',
    );
    return;
  }

  const msg = data.messages?.[0];

  if (!msg || !msg.key || !msg.message) {
    return;
  }
  setImmediate(
    async (deferredData, deferredClient, deferredMsg, groupMetaGetter) => {
      const messageIdForLog = deferredMsg.key.id;
      const remoteJidForLog = deferredMsg.key.remoteJid;
      try {
        try {
          await processUserData(deferredData, deferredClient, groupMetaGetter);
        } catch (error) {
          logger.error(
            `[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) ❌ Erro ao processar dados do usuário/mensagem (processUserData) para ${remoteJidForLog}: ${error.message}`,
            { stack: error.stack },
          );
          return;
        }

        if (remoteJidForLog?.endsWith('@g.us')) {
        }

        try {
          await botController(deferredData, deferredClient);
        } catch (error) {
          const messageType = Object.keys(deferredMsg.message || {})[0] || 'tipo desconhecido';
          logger.error(
            `[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) ❌ Erro em botController ao lidar com mensagem tipo '${messageType}' no JID ${remoteJidForLog}: ${error.message}`,
            {
              stack: error.stack,
            },
          );
        }
      } catch (outerError) {
        logger.error(
          `[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) 💥 Erro crítico inesperado no processamento agendado para ${remoteJidForLog}: ${outerError.message}`,
          { stack: outerError.stack },
        );
      } finally {
      }
    },
    data,
    client,
    msg,
    getGroupMetadata,
  );
};

const handleGroupsUpdate = async (updates, client) => {
  if (!client) {
    logger.error(
      '[ handleGroupsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupsUpdate.',
    );
    return;
  }
  logger.info(
    `[ handleGroupsUpdate ] 🔄 Recebido ${updates.length} evento(s) de atualização de grupo.`,
  );

  for (const event of updates) {
    const groupId = event.id;
    if (groupId) {
      try {
        const metadata = await client.groupMetadata(groupId);

        if (metadata && typeof metadata === 'object' && metadata.id) {
          groupMetadataCache.set(groupId, metadata);
        } else {
          groupMetadataCache.del(groupId);
          logger.warn(
            `[ handleGroupsUpdate ] ⚠️ Metadados inválidos ou não encontrados para ${groupId} após atualização. Removido do cache. Retorno:`,
            metadata,
          );
        }
      } catch (error) {
        groupMetadataCache.del(groupId);
        const statusCode = error.output?.statusCode;
        if (statusCode === 404 || statusCode === 401 || statusCode === 403) {
          logger.warn(
            `[ handleGroupsUpdate ] Não foi possível buscar metadados para ${groupId} (Status: ${statusCode}). Removido do cache.`,
          );
        } else {
          logger.error(
            `[ handleGroupsUpdate ] ❌ Erro ao buscar/cachear metadados do grupo ${groupId} em 'groups.update': ${error.message}`,
          );
        }
      }
    } else {
      logger.warn('[ handleGroupsUpdate ] Recebido evento de atualização de grupo sem JID.');
    }
  }
};

const handleGroupParticipantsUpdate = async (event, client) => {
  if (!client) {
    logger.error(
      '[ handleGroupParticipantsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupParticipantsUpdate.',
    );
    return;
  }
  const groupId = event.id;
  logger.info(
    `[ handleGroupParticipantsUpdate ] 👥 Evento recebido para grupo ${groupId}. Ação: ${
      event.action
    }. Participantes: ${event.participants.join(', ')}`,
  );

  let metadata = null;

  try {
    metadata = await client.groupMetadata(groupId);

    if (metadata && typeof metadata === 'object' && metadata.id) {
      groupMetadataCache.set(groupId, metadata);
    } else {
      groupMetadataCache.del(groupId);
      logger.warn(
        `[ handleGroupParticipantsUpdate ] Metadados inválidos ou não encontrados para ${groupId} para atualizar o cache. Removido do cache. Retorno:`,
        metadata,
      );
      metadata = null;
    }
  } catch (error) {
    groupMetadataCache.del(groupId);
    const statusCode = error.output?.statusCode;
    if (statusCode === 404 || statusCode === 401 || statusCode === 403) {
      logger.warn(
        `[ handleGroupParticipantsUpdate ] Não foi possível buscar metadados para ${groupId} (Status: ${statusCode}). Removido do cache.`,
      );
    } else {
      logger.error(
        `[ handleGroupParticipantsUpdate ] ❌ Erro ao buscar/cachear metadados após 'group-participants.update' para ${groupId}: ${error.message}`,
      );
    }
    metadata = null;
  }
  try {
    await processParticipantUpdate(event, client, metadata);
  } catch (error) {
    logger.error(
      `[ handleGroupParticipantsUpdate ] ❌ Erro retornado pelo processador de evento (processParticipantUpdate) para ${groupId}: ${error.message}`,
      { stack: error.stack },
    );
  }
};

const registerAllEventHandlers = (client, saveCreds) => {
  // Evento de atualização do estado da conexão
  client.ev.on('connection.update', (update) => handleConnectionUpdate(update));
  // Evento de atualização das credenciais de autenticação
  client.ev.on('creds.update', () => handleCredsUpdate(saveCreds)); // Passa saveCreds diretamente
  // Evento de recebimento/atualização de mensagens
  client.ev.on('messages.upsert', (data) => handleMessagesUpsert(data, client));
  // Evento de atualização de metadados de grupos (nome, descrição, etc.)
  client.ev.on('groups.update', (updates) => handleGroupsUpdate(updates, client));
  // Evento de atualização de participantes em grupos (entrada, saída, promoção, etc.)
  client.ev.on('group-participants.update', (event) =>
    handleGroupParticipantsUpdate(event, client),
  );
};

const connectToWhatsApp = async () => {
  try {
    logger.info(
      `[ connectToWhatsApp ] 🔒 Usando diretório de estado de autenticação: ${AUTH_STATE_PATH}`,
    );
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
      cachedGroupMetadata: async (jid) => {
        const cached = groupMetadataCache.get(jid);
        return cached;
      },
    });

    registerAllEventHandlers(clientInstance, saveCreds);

    return clientInstance;
  } catch (error) {
    logger.error(
      `[ connectToWhatsApp ] 🔴 Erro crítico ao iniciar a conexão com o WhatsApp: ${error.message}`,
      {
        stack: error.stack,
      },
    );
    scheduleReconnect();
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
    logger.error(
      `[ initializeApp ] 💥 Falha crítica durante a inicialização da aplicação: ${error.message}`,
      {
        stack: error.stack,
      },
    );
    process.exit(1);
  }
};

initializeApp();

module.exports = {
  getClientInstance: () => clientInstance,

  getGroupMetadata,
};
