/**
 * @file Gerencia a conexão com o WhatsApp, o tratamento de eventos e a lógica de reconexão usando Baileys.
 * Este módulo é responsável por inicializar o cliente WhatsApp, lidar com diversos
 * eventos como atualizações de conexão, recebimento de mensagens, atualizações de grupos e garantir
 * que as credenciais sejam salvas. Ele também implementa uma estratégia de backoff exponencial para reconexões.
 */

const { default: makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason } = require('baileys');
const pino = require('pino');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { cleanEnv, str, num, bool } = require('envalid');

require('dotenv').config();

// Validação de variáveis de ambiente
const env = cleanEnv(process.env, {
  DEFAULT_INITIAL_RECONNECT_DELAY: num({ default: 1000, desc: 'Atraso inicial padrão para reconexão em ms.' }),
  INITIAL_CONNECT_FAIL_DELAY: num({ default: 1500, desc: 'Atraso para reconexão em caso de falha na conexão inicial em ms.' }),
  DEFAULT_MAX_RECONNECT_DELAY: num({ default: 60000, desc: 'Atraso máximo padrão para reconexão em ms.' }),
  DEFAULT_RECONNECT_MAX_EXPONENT: num({ default: 10, desc: 'Expoente máximo padrão para o cálculo do backoff de reconexão.' }),
  SYNC_FULL_HISTORY: bool({ default: false, desc: 'Sincronizar histórico completo de mensagens.' }),
  DEBUG_BAILEYS: bool({ default: false, desc: 'Habilitar logs de debug do Baileys.' }),
});

const logger = require('../utils/logger');
const { initDatabase, closePool } = require('./../database/processDatabase');
const { createTables, processUserData } = require('./../controllers/userDataController');
const { processParticipantUpdate } = require('../controllers/groupEventsController');
const botController = require('../controllers/botController');
/**
 * @constant {string} AUTH_STATE_PATH
 * @description O caminho no sistema de arquivos onde o estado de autenticação (arquivos de sessão) será armazenado.
 */
const AUTH_STATE_PATH = path.join(__dirname, 'temp', 'auth_state');

// Constantes para configuração da lógica de reconexão
const DEFAULT_INITIAL_RECONNECT_DELAY = env.DEFAULT_INITIAL_RECONNECT_DELAY;
const INITIAL_CONNECT_FAIL_DELAY = env.INITIAL_CONNECT_FAIL_DELAY;
const DEFAULT_MAX_RECONNECT_DELAY = env.DEFAULT_MAX_RECONNECT_DELAY;
const DEFAULT_RECONNECT_MAX_EXPONENT = env.DEFAULT_RECONNECT_MAX_EXPONENT;

class ConnectionManager {
  /**
   * @param {object} options - Opções para o ConnectionManager.
   * @param {string} options.authStatePath - Caminho para armazenar o estado de autenticação.
   * @param {object} options.dbFunctions - Funções relacionadas ao banco de dados.
   * @param {() => Promise<void>} options.dbFunctions.initDatabase - Função para inicializar o DB.
   * @param {() => Promise<void>} options.dbFunctions.closePool - Função para fechar o pool do DB.
   * @param {object} options.controllerFunctions - Funções de controller.
   * @param {() => Promise<void>} options.controllerFunctions.createTables - Função para criar tabelas.
   * @param {(data: any, client: any) => Promise<void>} options.controllerFunctions.processUserData - Função para processar dados do usuário.
   * @param {(event: any, client: any) => Promise<void>} options.controllerFunctions.processParticipantUpdate - Função para processar atualização de participantes.
   * @param {(data: any, client: any) => Promise<void>} options.controllerFunctions.botController - Função principal do controller do bot.
   * @param {import('pino').Logger} options.loggerInstance - Instância do logger.
   */
  constructor(options) {
    this.AUTH_STATE_PATH = options.authStatePath;
    this.db = options.dbFunctions;
    this.controllers = options.controllerFunctions;
    this.logger = options.loggerInstance;

    this.clientInstance = null;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.handleConnectionUpdate = this.handleConnectionUpdate.bind(this);
    this.handleMessagesUpsert = this.handleMessagesUpsert.bind(this);
    this.handleGroupsUpdate = this.handleGroupsUpdate.bind(this);
    this.handleGroupParticipantsUpdate = this.handleGroupParticipantsUpdate.bind(this);
    this.connectToWhatsApp = this.connectToWhatsApp.bind(this);
  }

  /**
   * Agenda uma tentativa de reconexão com uma estratégia de backoff exponencial.
   * @param {() => Promise<void> | void} connectFn - A função a ser chamada para tentar a reconexão.
   * @param {object} [options] - Opções para agendar a reconexão.
   * @param {number} [options.initialDelay=1000] - Atraso inicial em milissegundos.
   * @param {number} [options.maxDelay=60000] - Atraso máximo em milissegundos.
   * @param {number} [options.maxExponent=6] - Expoente máximo para o cálculo do backoff.
   * @param {string} [options.label='scheduleReconnect'] - Um rótulo para fins de log.
   */
  scheduleReconnect(
    connectFn,
    options = {
      initialDelay: 1000,
      maxDelay: 60000,
      maxExponent: 6,
      label: 'scheduleReconnect',
    },
  ) {
    this.logger.debug(`[ ${options.label} ] Iniciando scheduleReconnect. Tentativas atuais: ${this.reconnectAttempts}. Timeout existente: ${!!this.reconnectTimeout}`);
    if (this.reconnectTimeout) return;

    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, options.maxExponent + 10);
    const exponent = Math.min(this.reconnectAttempts, options.maxExponent);
    const delay = Math.min(options.initialDelay * 2 ** exponent, options.maxDelay);

    this.logger.debug(`[ ${options.label} ] Calculado delay: ${delay}ms. Expoente: ${exponent}. Tentativa: ${this.reconnectAttempts}`);
    this.logger.warn(`[ ${options.label} ] Conexão perdida. Tentando reconectar em ${delay / 1000}s... Tentativa: ${this.reconnectAttempts}`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      connectFn();
    }, delay);
  }

  /**
   * Reseta o contador de tentativas de reconexão e limpa qualquer timeout de reconexão pendente.
   * @param {string} [label='ConnectionLogic'] - Um rótulo para fins de log.
   */
  resetReconnectAttempts(label = 'ConnectionLogic') {
    this.logger.debug(`[ ${label} ] Chamada para resetar tentativas de reconexão.`);
    this.logger.info(`[ ${label} ] Resetando tentativas de reconexão.`);
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  _handleQRCode(qr) {
    this.logger.info('[ _handleQRCode ] QR Code recebido, escaneie por favor.');
    qrcode.generate(qr, { small: true });
    this.resetReconnectAttempts('handleConnectionUpdate-QR');
  }

  _logConnectionStatus(connection) {
    if (connection === 'connecting') {
      this.logger.info('[ _logConnectionStatus ] Conectando ao WhatsApp...');
    } else if (connection === 'open') {
      this.logger.info('[ _logConnectionStatus ] Conexão aberta com sucesso. Bot disponível.');
      this.resetReconnectAttempts('handleConnectionUpdate-Open');
    }
  }

  _handleDisconnection(lastDisconnect) {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    this.logger.debug('[ _handleDisconnection ] Detalhes da desconexão:', { error: lastDisconnect?.error, statusCode, shouldReconnect });
    this.logger.error(`[ _handleDisconnection ] Conexão fechada. Razão: ${DisconnectReason[statusCode] || 'Desconhecida'} Código: ${statusCode}`);

    if (shouldReconnect) {
      this.logger.info('[ _handleDisconnection ] Tentando reconectar...');
      this.scheduleReconnect(this.connectToWhatsApp, {
        initialDelay: DEFAULT_INITIAL_RECONNECT_DELAY,
        maxDelay: DEFAULT_MAX_RECONNECT_DELAY,
        maxExponent: DEFAULT_RECONNECT_MAX_EXPONENT,
        label: 'WhatsAppConnection',
      });
    } else {
      this.logger.warn('[ _handleDisconnection ] Reconexão não será tentada devido ao DisconnectReason.loggedOut.');
      this.logger.error("[ _handleDisconnection ]  Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code.");
    }
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    this.logger.debug('[ handleConnectionUpdate ] Recebida atualização de conexão:', update);

    if (qr) {
      this._handleQRCode(qr);
    }

    if (connection === 'connecting' || connection === 'open') {
      this._logConnectionStatus(connection);
    }

    if (connection === 'close') {
      this._handleDisconnection(lastDisconnect);
    }
  }

  async handleCredsUpdate(saveCreds) {
    this.logger.debug('[ handleCredsUpdate ] Chamada para atualizar credenciais.');
    if (typeof saveCreds !== 'function') {
      this.logger.error('[ handleCredsUpdate ] saveCreds não é uma função válida.');
      return;
    }
    try {
      await saveCreds();
      this.logger.info('[ handleCredsUpdate ] Credenciais salvas com sucesso.');
    } catch (error) {
      this.logger.error('[ handleCredsUpdate ] Erro ao salvar credenciais:', {
        message: error.message,
        stack: error.stack,
      });
    }
  }

  async handleMessagesUpsert(data) {
    this.logger.debug('[ handleMessagesUpsert ] Recebido evento messages.upsert:', { messageCount: data.messages?.length, type: data.type });
    if (!this.clientInstance) {
      this.logger.error('[ handleMessagesUpsert ] Instância do cliente inválida.');
      return;
    }

    const msg = data.messages?.[0];
    if (!msg?.key?.remoteJid || !msg.message) {
      this.logger.debug('[ handleMessagesUpsert ] Mensagem ignorada: sem remoteJid ou conteúdo da mensagem.', { key: msg?.key, message: msg?.message });
      return;
    }

    this.logger.debug(`[ handleMessagesUpsert ] Agendando processamento para mensagem ID: ${msg.key.id} de ${msg.key.remoteJid}`);
    setImmediate(() => this.processMessage(data, msg));
  }

  async processMessage(data, msg) {
    const messageId = msg.key.id;
    const remoteJid = msg.key.remoteJid;
    this.logger.debug(`[ processMessage ] Iniciando processamento da mensagem ID: ${messageId} de ${remoteJid}`);

    try {
      await this.controllers.processUserData(data, this.clientInstance);
    } catch (err) {
      this.logger.debug('[ processMessage ] Erro detalhado em processUserData:', err);
      this.logger.error(`[ processMessage ] ID:${messageId} Erro em processUserData para ${remoteJid}: ${err.message}`, {
        stack: err.stack,
      });
      return;
    }

    try {
      await this.controllers.botController(data, this.clientInstance);
    } catch (err) {
      this.logger.debug('[ processMessage ] Erro detalhado em botController:', err);
      const messageType = Object.keys(msg.message || {})[0] || 'tipo desconhecido';
      this.logger.error(`[ processMessage ] ID:${messageId} Erro em botController com tipo '${messageType}' no JID ${remoteJid}: ${err.message}`, {
        stack: err.stack,
      });
      return;
    }
  }

  async handleGroupsUpdate(updates) {
    this.logger.debug('[ handleGroupsUpdate ] Recebido evento groups.update:', updates);
    if (!this.clientInstance) {
      this.logger.error('[ handleGroupsUpdate ] Instância do cliente inválida.');
      return;
    }

    if (!Array.isArray(updates)) {
      this.logger.warn('[ handleGroupsUpdate ] Atualizações de grupo recebidas não são um array. Recebido:', typeof updates, updates);
      return;
    }

    this.logger.info(`[ handleGroupsUpdate ]  Recebido ${updates.length} evento(s) de atualização de grupo.`);
    updates.forEach((groupUpdate) => {
      const groupId = groupUpdate.id;
      if (groupId) {
        this.logger.debug(`[ handleGroupsUpdate ] Evento de atualização para o grupo ${groupId}:`, groupUpdate);
      } else {
        this.logger.warn('[ handleGroupsUpdate ] Evento de atualização de grupo sem JID.');
      }
    });
  }

  async handleGroupParticipantsUpdate(event) {
    this.logger.debug('[ handleGroupParticipantsUpdate ] Recebido evento group-participants.update:', event);
    if (!this.clientInstance) {
      this.logger.error('[ handleGroupParticipantsUpdate ] Instância do cliente inválida.');
      return;
    }

    if (!event || typeof event !== 'object' || !event.id || !Array.isArray(event.participants)) {
      this.logger.warn('[ handleGroupParticipantsUpdate ] Evento de participantes inválido ou malformado. Recebido:', event);
      return;
    }

    const groupId = event.id;
    const action = event.action || 'ação desconhecida';
    const participants = event.participants.join(', ');

    this.logger.info(`[ handleGroupParticipantsUpdate ] Evento recebido para grupo ${groupId}. Ação: ${action}. Participantes: ${participants}`);

    try {
      await this.controllers.processParticipantUpdate(event, this.clientInstance);
      this.logger.debug(`[ handleGroupParticipantsUpdate ] Evento para grupo ${groupId} processado com sucesso.`);
    } catch (error) {
      this.logger.error(`[ handleGroupParticipantsUpdate ] Erro ao processar evento para ${groupId}: ${error.message}`, {
        eventDetails: event,
        stack: error.stack,
      });
    }
  }

  registerAllEventHandlers(saveCreds) {
    this.logger.debug('[ registerAllEventHandlers ] Registrando manipuladores de eventos Baileys.');
    if (!this.clientInstance) {
      this.logger.error('[ registerAllEventHandlers ] Tentativa de registrar handlers sem instância de cliente.');
      return;
    }
    this.clientInstance.ev.on('connection.update', this.handleConnectionUpdate);
    this.clientInstance.ev.on('creds.update', () => this.handleCredsUpdate(saveCreds));
    this.clientInstance.ev.on('messages.upsert', this.handleMessagesUpsert);
    this.clientInstance.ev.on('groups.update', this.handleGroupsUpdate);
    this.clientInstance.ev.on('group-participants.update', this.handleGroupParticipantsUpdate);
  }

  async connectToWhatsApp() {
    try {
      this.logger.info(`[ connectToWhatsApp ] Usando diretório de estado de autenticação: ${this.AUTH_STATE_PATH}`);
      const { state, saveCreds } = await useMultiFileAuthState(this.AUTH_STATE_PATH);
      this.logger.debug('[ connectToWhatsApp ] Estado de autenticação carregado/criado.');
      this.logger.debug(`[ connectToWhatsApp ] Configurações de ambiente relevantes: SYNC_FULL_HISTORY=${env.SYNC_FULL_HISTORY}, DEBUG_BAILEYS=${env.DEBUG_BAILEYS}`);

      this.logger.info('[ connectToWhatsApp ] Iniciando a conexão com o WhatsApp...');

      const socketConfig = {
        auth: state,
        logger: pino({ level: env.DEBUG_BAILEYS ? 'debug' : 'silent' }),
        mobile: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: env.SYNC_FULL_HISTORY,
        msgRetryCounterMap: {},
      };
      this.logger.debug('[ connectToWhatsApp ] Configurações do socket:', socketConfig);

      this.clientInstance = makeWASocket(socketConfig);
      this.logger.debug('[ connectToWhatsApp ] Instância do Baileys criada.');

      this.registerAllEventHandlers(saveCreds);

      return this.clientInstance;
    } catch (error) {
      this.logger.error(`[ connectToWhatsApp ] Erro ao iniciar a conexão com o WhatsApp: ${error.message}`, {
        code: error.code,
        stack: error.stack,
      });

      const isLikelyAuthStateError = (error.message && (error.message.includes(this.AUTH_STATE_PATH) || error.message.toLowerCase().includes('auth') || error.message.toLowerCase().includes('creds'))) || (error.code && ['ENOENT', 'EACCES', 'EBADF', 'EPERM', 'EISDIR', 'ENOTDIR'].includes(error.code));

      if (isLikelyAuthStateError) {
        const fatalMessage = `[ connectToWhatsApp ] Erro crítico e possivelmente irrecuperável relacionado ao estado de autenticação em ${this.AUTH_STATE_PATH}. Verifique as permissões, a integridade da pasta ou se o caminho é válido. Não será tentada a reconexão automática. Detalhes: ${error.message}`;
        this.logger.fatal(fatalMessage);
        throw new Error(fatalMessage, { cause: error });
      } else {
        this.logger.warn(`[ connectToWhatsApp ] Agendando reconexão devido a erro não relacionado ao estado de autenticação: ${error.message}`);
        this.scheduleReconnect(this.connectToWhatsApp, {
          initialDelay: INITIAL_CONNECT_FAIL_DELAY,
          maxDelay: DEFAULT_MAX_RECONNECT_DELAY,
          maxExponent: DEFAULT_RECONNECT_MAX_EXPONENT,
          label: 'WhatsAppConnectFail_Retry',
        });
        return null;
      }
    }
  }

  async initialize() {
    try {
      this.logger.info('[ ConnectionManager.initialize ] Iniciando a aplicação...');
      this.logger.debug('[ ConnectionManager.initialize ] Fase 1: Inicializando banco de dados.');

      await this.db.initDatabase();
      this.logger.info('[ ConnectionManager.initialize ] Pool de conexões do banco de dados inicializado.');
      this.logger.debug('[ ConnectionManager.initialize ] Fase 2: Criando/Verificando tabelas.');

      await this.controllers.createTables();
      this.logger.info('[ ConnectionManager.initialize ] Tabelas do banco de dados verificadas/criadas.');
      this.logger.debug('[ ConnectionManager.initialize ] Fase 3: Conectando ao WhatsApp.');

      await this.connectToWhatsApp();
      this.logger.debug('[ ConnectionManager.initialize ] Conexão com WhatsApp iniciada (ou agendada para reconexão).');
    } catch (error) {
      this.logger.error(`[ ConnectionManager.initialize ] Falha crítica durante a inicialização da aplicação: ${error.message}`, {
        stack: error.cause?.stack || error.stack,
      });
      process.exit(1);
    }
  }

  /**
   * @returns {import('baileys').WASocket | null} A instância atual do cliente Baileys.
   */
  getClient() {
    return this.clientInstance;
  }
}

/**
 * @module connection
 * @description Fornece acesso à instância do cliente WhatsApp Baileys.
 */

const connectionManager = new ConnectionManager({
  authStatePath: AUTH_STATE_PATH,
  dbFunctions: { initDatabase, closePool },
  controllerFunctions: { createTables, processUserData, processParticipantUpdate, botController },
  loggerInstance: logger,
});

module.exports = {
  /** @returns {import('baileys').WASocket | null} A instância atual do cliente Baileys, ou nulo se não estiver conectado. */
  getClientInstance: () => connectionManager.getClient(),
};

// Inicia a aplicação
connectionManager.initialize();
