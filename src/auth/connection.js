/**
 * @file Gerencia a conexão com o WhatsApp, o tratamento de eventos e a lógica de reconexão usando Baileys.
 * Este módulo é responsável por inicializar o cliente WhatsApp, lidar com diversos
 * eventos como atualizações de conexão, recebimento de mensagens, atualizações de grupos e garantir
 * que as credenciais sejam salvas. Ele também implementa uma estratégia de backoff exponencial para reconexões.
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
 * @description O caminho no sistema de arquivos onde o estado de autenticação (arquivos de sessão) será armazenado.
 */
const AUTH_STATE_PATH = path.join(__dirname, 'temp', 'auth_state');

/**
 * @type {number}
 * @description Contador para as tentativas de reconexão atuais.
 */
let reconnectAttempts = 0;
/**
 * @type {NodeJS.Timeout | null}
 * @description ID do timeout para a reconexão agendada. Nulo se nenhuma reconexão estiver agendada.
 */
let reconnectTimeout = null;

/**
 * @type {import('baileys').WASocket | null}
 * @description Armazena a instância singleton do cliente WhatsApp Baileys.
 */
let clientInstance = null;

/**
 * Agenda uma tentativa de reconexão com uma estratégia de backoff exponencial.
 * @param {() => Promise<void> | void} connectFn - A função a ser chamada para tentar a reconexão.
 * @param {object} [options] - Opções para agendar a reconexão.
 * @param {number} [options.initialDelay=1000] - Atraso inicial em milissegundos.
 * @param {number} [options.maxDelay=60000] - Atraso máximo em milissegundos.
 * @param {number} [options.maxExponent=6] - Expoente máximo para o cálculo do backoff.
 * @param {string} [options.label='scheduleReconnect'] - Um rótulo para fins de log.
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
 * Reseta o contador de tentativas de reconexão e limpa qualquer timeout de reconexão pendente.
 * @param {string} [label='ConnectionLogic'] - Um rótulo para fins de log, indicando
 *                                             o que acionou o reset.
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
 * Lida com as atualizações de conexão do cliente Baileys.
 * Isso inclui geração de código QR, mudanças no status da conexão (conectando, aberta, fechada)
 * e gerenciamento da lógica de reconexão com base nos motivos da desconexão.
 * @param {Partial<import('baileys').ConnectionState>} update - O objeto de atualização da conexão do Baileys.
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
 * Lida com as atualizações de credenciais do Baileys.
 * Salva as credenciais atualizadas usando a função `saveCreds` fornecida por `useMultiFileAuthState`.
 * @param {() => Promise<void>} saveCreds - A função para salvar as credenciais.
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
 * Lida com mensagens recebidas ou atualizadas (evento 'messages.upsert').
 * Garante uma instância de cliente e estrutura de mensagem válidas antes de delegar
 * o processamento para `processMessage` usando `setImmediate` para evitar o bloqueio do loop de eventos.
 * @param {import('baileys').BaileysEventMap['messages.upsert']} data - Os dados de upsert da mensagem do Baileys.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys.
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
 * Processa uma única mensagem.
 * Esta função é responsável por chamar `processUserData` para lidar com dados relacionados ao usuário
 * e, em seguida, `botController` para executar a lógica específica do bot para a mensagem.
 * @param {import('baileys').BaileysEventMap['messages.upsert']} data - Os dados brutos de upsert da mensagem.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys.
 * @param {import('baileys').WAMessage} msg - O objeto de mensagem específico a ser processado.
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
 * Lida com atualizações de metadados de grupo (evento 'groups.update').
 * @param {import('baileys').GroupMetadata[]} updates - Um array de objetos de atualização de grupo do Baileys.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys.
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
 * Lida com atualizações de participantes de grupo (evento 'group-participants.update').
 * Isso inclui eventos como entrada, saída, promoção ou rebaixamento de usuários em um grupo.
 * @param {import('baileys').GroupParticipantsUpdateData} event - Os dados do evento de atualização de participantes do grupo.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys.
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
 * Registra todos os manipuladores de eventos Baileys em suas respectivas funções de tratamento.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys.
 * @param {() => Promise<void>} saveCreds - The function to save credentials,
 *                                         passada para `handleCredsUpdate`.
 */
const registerAllEventHandlers = (client, saveCreds) => {
  client.ev.on('connection.update', (update) => handleConnectionUpdate(update));
  client.ev.on('creds.update', () => handleCredsUpdate(saveCreds));
  client.ev.on('messages.upsert', (data) => handleMessagesUpsert(data, client));
  client.ev.on('groups.update', (updates) => handleGroupsUpdate(updates, client));
  client.ev.on('group-participants.update', (event) => handleGroupParticipantsUpdate(event, client));
};

/**
 * Inicializa e conecta o cliente WhatsApp Baileys.
 * Configura a autenticação multi-arquivo, configura o socket com as opções apropriadas,
 * registra os manipuladores de eventos e lida com erros de conexão inicial agendando reconexões.
 * @async
 * @returns {Promise<import('baileys').WASocket | null>} Uma promessa que resolve para a instância do cliente Baileys, ou nulo se ocorrer um erro crítico durante a configuração inicial.
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
 * Inicializa a aplicação.
 * Esta função orquestra a configuração do banco de dados, criação/verificação de tabelas
 * e, em seguida, inicia a conexão com o WhatsApp.
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
 * @description Fornece acesso à instância do cliente WhatsApp Baileys.
 */
module.exports = {
  /** @returns {import('baileys').WASocket | null} A instância atual do cliente Baileys, ou nulo se não estiver conectado. */
  getClientInstance: () => clientInstance,
};
