/* eslint-disable no-undef */
/**
 * @file Gerencia a conexão com o WhatsApp, o tratamento de eventos e a lógica de reconexão usando Baileys.
 * Este módulo é responsável por inicializar o cliente WhatsApp, lidar com diversos
 * eventos (atualizações de conexão, recebimento de mensagens, atualizações de grupos, etc.),
 * e garantir que as credenciais de autenticação sejam salvas de forma persistente.
 * Implementa uma estratégia de backoff exponencial para tentativas de reconexão automática.
 * @see {@link https://github.com/WhiskeySockets/Baileys |Baileys WASocket} para detalhes da API do cliente.
 */

const {
  default: makeWASocket,
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
} = require('baileys');
const pino = require('pino');
const path = require('path');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { cleanEnv, num, bool } = require('envalid');

require('dotenv').config();

/**
 * Objeto contendo as variáveis de ambiente validadas e tipadas, prontas para uso.
 * Utiliza `envalid` para garantir que as configurações essenciais estejam presentes e corretas.
 * @property {number} DEFAULT_INITIAL_RECONNECT_DELAY - Atraso inicial padrão para reconexão em ms.
 * @property {number} INITIAL_CONNECT_FAIL_DELAY - Atraso para reconexão em caso de falha na conexão inicial em ms.
 * @property {number} DEFAULT_MAX_RECONNECT_DELAY - Atraso máximo padrão para reconexão em ms.
 * @property {number} DEFAULT_RECONNECT_MAX_EXPONENT - Expoente máximo padrão para o cálculo do backoff de reconexão.
 * @property {boolean} SYNC_FULL_HISTORY - Define se o histórico completo de mensagens deve ser sincronizado ao conectar.
 * @property {boolean} DEBUG_BAILEYS - Habilita logs de debug detalhados da biblioteca Baileys.
 * @see {@link https://github.com/af/envalid|envalid} para mais informações sobre validação de variáveis de ambiente.
 */
const env = cleanEnv(process.env, {
  DEFAULT_INITIAL_RECONNECT_DELAY: num({
    default: 1000,
    desc: 'Atraso inicial padrão para reconexão em ms.',
  }),
  INITIAL_CONNECT_FAIL_DELAY: num({
    default: 1500,
    desc: 'Atraso para reconexão em caso de falha na conexão inicial em ms.',
  }),
  DEFAULT_MAX_RECONNECT_DELAY: num({
    default: 60000,
    desc: 'Atraso máximo padrão para reconexão em ms.',
  }),
  DEFAULT_RECONNECT_MAX_EXPONENT: num({
    default: 10,
    desc: 'Expoente máximo padrão para o cálculo do backoff de reconexão.',
  }),
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
/** @constant {number} Atraso inicial padrão para reconexão em milissegundos. */
const DEFAULT_INITIAL_RECONNECT_DELAY = env.DEFAULT_INITIAL_RECONNECT_DELAY;
/** @constant {number} Atraso para reconexão em caso de falha na conexão inicial em milissegundos. */
const INITIAL_CONNECT_FAIL_DELAY = env.INITIAL_CONNECT_FAIL_DELAY;
/** @constant {number} Atraso máximo padrão para reconexão em milissegundos. */
const DEFAULT_MAX_RECONNECT_DELAY = env.DEFAULT_MAX_RECONNECT_DELAY;
/** @constant {number} Expoente máximo padrão para o cálculo do backoff de reconexão. */
const DEFAULT_RECONNECT_MAX_EXPONENT = env.DEFAULT_RECONNECT_MAX_EXPONENT;

/**
 * @class ConnectionManager
 * @description Gerencia a conexão com o WhatsApp, incluindo autenticação,
 * tratamento de eventos de conexão, mensagens, grupos e lógica de reconexão.
 * Orquestra a inicialização de dependências como banco de dados e tabelas.
 */
class ConnectionManager {
  /**
   * Cria uma instância de ConnectionManager.
   * @param {object} options - Opções de configuração para o ConnectionManager.
   * @param {string} options.authStatePath - Caminho no sistema de arquivos para armazenar o estado de autenticação (sessão).
   * @param {object} options.dbFunctions - Objeto contendo funções para interagir com o banco de dados.
   * @param {() => Promise<void>} options.dbFunctions.initDatabase - Função assíncrona para inicializar a conexão com o banco de dados.
   * @param {() => Promise<void>} options.dbFunctions.closePool - Função assíncrona para fechar o pool de conexões do banco de dados.
   * @param {object} options.controllerFunctions - Objeto contendo funções de lógica de negócio (controllers).
   * @param {() => Promise<void>} options.controllerFunctions.createTables - Função assíncrona para criar/verificar as tabelas necessárias no banco de dados.
   * @param {(data: import('baileys').BaileysEventMap['messages.upsert'], client: import('baileys').WASocket) => Promise<void>} options.controllerFunctions.processUserData - Função para processar dados de mensagens recebidas e informações de usuários/grupos.
   * @param {(event: import('baileys').GroupParticipantsUpdate, client: import('baileys').WASocket) => Promise<void>} options.controllerFunctions.processParticipantUpdate - Função para processar eventos de atualização de participantes em grupos.
   * @param {(data: import('baileys').BaileysEventMap['messages.upsert'], client: import('baileys').WASocket) => Promise<void>} options.controllerFunctions.botController - Função principal do controller do bot, responsável por interpretar comandos e interações.
   * @param {import('pino').Logger} options.loggerInstance - Instância do logger (Pino) para registrar eventos e depuração.
   */
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError(
        'Opções de configuração para ConnectionManager são obrigatórias e devem ser um objeto.',
      );
    }

    if (
      !options.loggerInstance ||
      typeof options.loggerInstance.info !== 'function' ||
      typeof options.loggerInstance.error !== 'function' ||
      typeof options.loggerInstance.debug !== 'function'
    ) {
      console.error(
        '[ConnectionManager.constructor] loggerInstance inválida ou não fornecida. Deve ser uma instância de logger compatível (ex: Pino).',
      );
      throw new TypeError('loggerInstance inválida ou não fornecida.');
    }
    /** @type {import('pino').Logger} Instância do logger. */
    this.logger = options.loggerInstance;

    if (!options.authStatePath || typeof options.authStatePath !== 'string') {
      this.logger.error(
        '[ConnectionManager.constructor] authStatePath é obrigatório e deve ser uma string.',
      );
      throw new TypeError('authStatePath é obrigatório e deve ser uma string.');
    }

    const requiredDbFunctions = ['initDatabase', 'closePool'];
    if (
      !options.dbFunctions ||
      typeof options.dbFunctions !== 'object' ||
      !requiredDbFunctions.every((fnName) => typeof options.dbFunctions[fnName] === 'function')
    ) {
      this.logger.error(
        `[ConnectionManager.constructor] dbFunctions inválido ou funções obrigatórias (${requiredDbFunctions.join(
          ', ',
        )}) ausentes/não são funções.`,
      );
      throw new TypeError(
        `dbFunctions inválido ou funções obrigatórias (${requiredDbFunctions.join(
          ', ',
        )}) ausentes/não são funções.`,
      );
    }

    const requiredControllerFunctions = [
      'createTables',
      'processUserData',
      'processParticipantUpdate',
      'botController',
    ];
    if (
      !options.controllerFunctions ||
      typeof options.controllerFunctions !== 'object' ||
      !requiredControllerFunctions.every(
        (fnName) => typeof options.controllerFunctions[fnName] === 'function',
      )
    ) {
      this.logger.error(
        `[ConnectionManager.constructor] controllerFunctions inválido ou funções obrigatórias (${requiredControllerFunctions.join(
          ', ',
        )}) ausentes/não são funções.`,
      );
      throw new TypeError(
        `controllerFunctions inválido ou funções obrigatórias (${requiredControllerFunctions.join(
          ', ',
        )}) ausentes/não são funções.`,
      );
    }

    this.logger.debug(
      '[ConnectionManager.constructor] Opções e dependências validadas com sucesso.',
    );

    /** @type {string} Caminho para armazenar o estado de autenticação. */
    this.AUTH_STATE_PATH = options.authStatePath;
    /** @type {object} Funções relacionadas ao banco de dados. */
    this.db = options.dbFunctions;
    /** @type {object} Funções de controller. */
    this.controllers = options.controllerFunctions;
    /** @type {import('pino').Logger} Instância do logger. */
    /** @type {import('baileys').WASocket | null} Instância do cliente WhatsApp (Baileys). */
    this.clientInstance = null;
    /** @type {number} Contador de tentativas de reconexão. */
    this.reconnectAttempts = 0;
    /** @type {NodeJS.Timeout | null} Identificador do timeout para a próxima tentativa de reconexão. */
    this.reconnectTimeout = null;

    // Bind dos métodos para garantir o 'this' correto quando usados como event handlers.
    this.handleConnectionUpdate = this.handleConnectionUpdate.bind(this);
    this.handleMessagesUpsert = this.handleMessagesUpsert.bind(this);
    this.handleGroupsUpdate = this.handleGroupsUpdate.bind(this);
    this.handleGroupParticipantsUpdate = this.handleGroupParticipantsUpdate.bind(this);
    this.connectToWhatsApp = this.connectToWhatsApp.bind(this);
  }

  /**
   * Agenda uma tentativa de reconexão com uma estratégia de backoff exponencial.
   * Se já houver uma reconexão agendada, esta chamada é ignorada.
   * @param {() => Promise<void> | void} connectFn - A função a ser chamada para tentar a reconexão.
   * @param {object} [options] - Opções para agendar a reconexão.
   * @param {number} [options.initialDelay=DEFAULT_INITIAL_RECONNECT_DELAY] - Atraso inicial em milissegundos.
   * @param {number} [options.maxDelay=DEFAULT_MAX_RECONNECT_DELAY] - Atraso máximo em milissegundos.
   * @param {number} [options.maxExponent=DEFAULT_RECONNECT_MAX_EXPONENT] - Expoente máximo para o cálculo do backoff (limita o crescimento do delay).
   * @param {string} [options.label='scheduleReconnect'] - Um rótulo para fins de log.
   */
  scheduleReconnect(
    connectFn,
    options = {
      initialDelay: 1000,
      maxDelay: 60000,
      maxExponent: DEFAULT_RECONNECT_MAX_EXPONENT,
      label: 'scheduleReconnect',
    },
  ) {
    this.logger.debug(
      `[ ${options.label} ] Iniciando scheduleReconnect. Tentativas atuais: ${
        this.reconnectAttempts
      }. Timeout existente: ${!!this.reconnectTimeout}`,
    );
    if (this.reconnectTimeout) return;

    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, options.maxExponent + 10);
    const exponent = Math.min(this.reconnectAttempts, options.maxExponent);
    const delay = Math.min(options.initialDelay * 2 ** exponent, options.maxDelay);

    this.logger.debug(
      `[ ${options.label} ] Calculado delay: ${delay}ms. Expoente: ${exponent}. Tentativa: ${this.reconnectAttempts}`,
    );
    this.logger.warn(
      `[ ${options.label} ] Conexão perdida. Tentando reconectar em ${
        delay / 1000
      }s... Tentativa: ${this.reconnectAttempts}`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      connectFn();
    }, delay);
  }

  /**
   * Reseta o contador de tentativas de reconexão e limpa qualquer timeout de reconexão pendente.
   * Chamado quando a conexão é bem-sucedida ou quando um QR code é recebido.
   * @param {string} [label='ConnectionLogic'] - Um rótulo para fins de log, indicando o contexto do reset.
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

  /**
   * Manipula a exibição do QR code para autenticação.
   * @private
   * @param {string} qr - A string do QR code recebida do Baileys.
   * @returns {void}
   */
  _handleQRCode(qr) {
    this.logger.info('[ _handleQRCode ] QR Code recebido, escaneie por favor.');
    qrcode.generate(qr, { small: true });
    this.resetReconnectAttempts('handleConnectionUpdate-QR');
  }

  /**
   * Loga o status da conexão ('connecting', 'open').
   * @private
   * @param {import('baileys').ConnectionState['connection']} connection - O estado atual da conexão.
   */
  _logConnectionStatus(connection) {
    if (connection === 'connecting') {
      this.logger.info('[ _logConnectionStatus ] Conectando ao WhatsApp...');
    } else if (connection === 'open') {
      this.logger.info('[ _logConnectionStatus ] Conexão aberta com sucesso. Bot disponível.');
      this.resetReconnectAttempts('handleConnectionUpdate-Open');
    }
  }

  /**
   * Manipula eventos de desconexão, decidindo se deve tentar reconectar.
   * @private
   * @param {Error | import('baileys').Boom} lastDisconnect - O objeto de erro da última desconexão.
   * @returns {void}
   */
  _handleDisconnection(lastDisconnect) {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    this.logger.debug('[ _handleDisconnection ] Detalhes da desconexão:', {
      error: lastDisconnect?.error,
      statusCode,
      shouldReconnect,
    });
    this.logger.error(
      `[ _handleDisconnection ] Conexão fechada. Razão: ${
        DisconnectReason[statusCode] || 'Desconhecida'
      } Código: ${statusCode}`,
    );

    if (shouldReconnect) {
      this.logger.info('[ _handleDisconnection ] Tentando reconectar...');
      this.scheduleReconnect(this.connectToWhatsApp, {
        initialDelay: DEFAULT_INITIAL_RECONNECT_DELAY,
        maxDelay: DEFAULT_MAX_RECONNECT_DELAY,
        maxExponent: DEFAULT_RECONNECT_MAX_EXPONENT,
        label: 'WhatsAppConnection',
      });
    } else {
      this.logger.warn(
        '[ _handleDisconnection ] Reconexão não será tentada devido ao DisconnectReason.loggedOut.',
      );
      this.logger.error(
        "[ _handleDisconnection ]  Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code.",
      );
    }
  }

  /**
   * Manipulador principal para o evento 'connection.update' do Baileys.
   * Delega para métodos auxiliares com base no estado da conexão.
   * @param {Partial<import('baileys').ConnectionState>} update - O objeto de atualização do estado da conexão.
   *   Contém `connection` (o novo estado), `lastDisconnect` (informações sobre a última desconexão)
   *   e `qr` (o QR code, se aplicável).
   * @returns {Promise<void>}
   */
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

  /**
   * Manipula o evento 'creds.update' do Baileys, salvando as credenciais de autenticação.
   * @param {() => Promise<void>} saveCreds - A função fornecida por `useMultiFileAuthState` para salvar as credenciais.
   * @returns {Promise<void>}
   */
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

  /**
   * Manipula o evento 'messages.upsert' do Baileys, que ocorre ao receber novas mensagens.
   * Filtra mensagens inválidas e agenda o processamento assíncrono da mensagem.
   * @param {import('baileys').BaileysEventMap['messages.upsert']} data - Dados do evento, contendo as mensagens e o tipo de notificação.
   * @returns {Promise<void>}
   */
  async handleMessagesUpsert(data) {
    this.logger.debug('[ handleMessagesUpsert ] Recebido evento messages.upsert:', {
      messageCount: data.messages?.length,
      type: data.type,
    });
    if (!this.clientInstance) {
      this.logger.error('[ handleMessagesUpsert ] Instância do cliente inválida.');
      return;
    }

    const msg = data.messages?.[0];
    if (!msg?.key?.remoteJid || !msg.message) {
      this.logger.debug(
        '[ handleMessagesUpsert ] Mensagem ignorada: sem remoteJid ou conteúdo da mensagem.',
        { key: msg?.key, message: msg?.message },
      );
      return;
    }

    this.logger.debug(
      `[ handleMessagesUpsert ] Agendando processamento para mensagem ID: ${msg.key.id} de ${msg.key.remoteJid}`,
    );
    setImmediate(async () => {
      try {
        await this.processMessage(data, msg);
      } catch (error) {
        this.logger.error(
          `[ handleMessagesUpsert.setImmediate ] Erro não capturado ao processar mensagem ID: ${msg?.key?.id} de ${msg?.key?.remoteJid}. Isso indica um erro inesperado dentro de processMessage não tratado pelos try/catch internos.`,
          {
            message: error.message,
            stack: error.stack,
            originalData: data,
          },
        );
      }
    });
  }

  /**
   * Processa uma mensagem individual recebida.
   * Chama os controllers para processar dados do usuário/grupo e a lógica do bot.
   * @private
   * @param {import('baileys').BaileysEventMap['messages.upsert']} data - O objeto completo do evento 'messages.upsert'.
   * @param {import('baileys').WAMessage} msg - A mensagem específica a ser processada.
   * @returns {Promise<void>}
   */
  async processMessage(data, msg) {
    const messageId = msg.key.id;
    const remoteJid = msg.key.remoteJid;
    this.logger.debug(
      `[ processMessage ] Iniciando processamento da mensagem ID: ${messageId} de ${remoteJid}`,
    );

    try {
      await this.controllers.processUserData(data, this.clientInstance);
    } catch (err) {
      this.logger.debug('[ processMessage ] Erro detalhado em processUserData:', err);
      this.logger.error(
        `[ processMessage ] ID:${messageId} Erro em processUserData para ${remoteJid}: ${err.message}`,
        {
          stack: err.stack,
        },
      );
      return;
    }

    try {
      await this.controllers.botController(data, this.clientInstance);
    } catch (err) {
      this.logger.debug('[ processMessage ] Erro detalhado em botController:', err);
      const messageType = Object.keys(msg.message || {})[0] || 'tipo desconhecido';
      this.logger.error(
        `[ processMessage ] ID:${messageId} Erro em botController com tipo '${messageType}' no JID ${remoteJid}: ${err.message}`,
        {
          stack: err.stack,
        },
      );
      return;
    }
  }

  /**
   * Manipula o evento 'groups.update' do Baileys, que ocorre quando há atualizações nos metadados de grupos.
   * (Ex: mudança de nome, descrição, etc.)
   * @param {Array<Partial<import('baileys').GroupMetadata>>} updates - Um array de objetos contendo as atualizações dos grupos.
   * @returns {Promise<void>}
   */
  async handleGroupsUpdate(updates) {
    this.logger.debug('[ handleGroupsUpdate ] Recebido evento groups.update:', updates);
    if (!this.clientInstance) {
      this.logger.error('[ handleGroupsUpdate ] Instância do cliente inválida.');
      return;
    }

    if (!Array.isArray(updates)) {
      this.logger.warn(
        '[ handleGroupsUpdate ] Atualizações de grupo recebidas não são um array. Recebido:',
        typeof updates,
        updates,
      );
      return;
    }

    this.logger.info(
      `[ handleGroupsUpdate ]  Recebido ${updates.length} evento(s) de atualização de grupo.`,
    );
    updates.forEach((groupUpdate) => {
      const groupId = groupUpdate.id;
      if (groupId) {
        this.logger.debug(
          `[ handleGroupsUpdate ] Evento de atualização para o grupo ${groupId}:`,
          groupUpdate,
        );
      } else {
        this.logger.warn('[ handleGroupsUpdate ] Evento de atualização de grupo sem JID.');
      }
    });
  }

  /**
   * Manipula o evento 'group-participants.update' do Baileys.
   * Ocorre quando participantes entram, saem, são promovidos ou rebaixados em um grupo.
   * @param {import('baileys').GroupParticipantsUpdate} event - O objeto do evento de atualização de participantes.
   * @returns {Promise<void>}
   */
  async handleGroupParticipantsUpdate(event) {
    this.logger.debug(
      '[ handleGroupParticipantsUpdate ] Recebido evento group-participants.update:',
      event,
    );
    if (!this.clientInstance) {
      this.logger.error('[ handleGroupParticipantsUpdate ] Instância do cliente inválida.');
      return;
    }

    if (!event || typeof event !== 'object' || !event.id || !Array.isArray(event.participants)) {
      this.logger.warn(
        '[ handleGroupParticipantsUpdate ] Evento de participantes inválido ou malformado. Recebido:',
        event,
      );
      return;
    }

    const groupId = event.id;
    const action = event.action || 'ação desconhecida';
    const participants = event.participants.join(', ');

    this.logger.info(
      `[ handleGroupParticipantsUpdate ] Evento recebido para grupo ${groupId}. Ação: ${action}. Participantes: ${participants}`,
    );

    try {
      await this.controllers.processParticipantUpdate(event, this.clientInstance);
      this.logger.debug(
        `[ handleGroupParticipantsUpdate ] Evento para grupo ${groupId} processado com sucesso.`,
      );
    } catch (error) {
      this.logger.error(
        `[ handleGroupParticipantsUpdate ] Erro ao processar evento para ${groupId}: ${error.message}`,
        {
          eventDetails: event,
          stack: error.stack,
        },
      );
    }
  }

  /**
   * Registra todos os manipuladores de eventos necessários na instância do cliente Baileys.
   * @private
   * @param {() => Promise<void>} saveCreds - A função para salvar credenciais, passada para `handleCredsUpdate`.
   * @returns {void}
   */
  registerAllEventHandlers(saveCreds) {
    this.logger.debug('[ registerAllEventHandlers ] Registrando manipuladores de eventos Baileys.');
    if (!this.clientInstance) {
      this.logger.error(
        '[ registerAllEventHandlers ] Tentativa de registrar handlers sem instância de cliente.',
      );
      return;
    }
    this.clientInstance.ev.on('connection.update', this.handleConnectionUpdate);
    this.clientInstance.ev.on('creds.update', () => this.handleCredsUpdate(saveCreds));
    this.clientInstance.ev.on('messages.upsert', this.handleMessagesUpsert);
    this.clientInstance.ev.on('groups.update', this.handleGroupsUpdate);
    this.clientInstance.ev.on('group-participants.update', this.handleGroupParticipantsUpdate);
  }

  /**
   * Estabelece a conexão com o WhatsApp usando Baileys.
   * Configura o socket, carrega/salva o estado de autenticação e registra os manipuladores de eventos.
   * @returns {Promise<import('baileys').WASocket | null>} A instância do cliente Baileys conectada, ou `null` se a conexão falhar e uma reconexão for agendada.
   * @throws {Error} Lança um erro se ocorrer uma falha crítica irrecuperável durante a conexão (ex: problema no `authStatePath`).
   */
  async connectToWhatsApp() {
    this.logger.info('[ connectToWhatsApp ] Tentando conectar ao WhatsApp...');
    try {
      if (!fs.existsSync(this.AUTH_STATE_PATH)) {
        this.logger.info(
          `[ connectToWhatsApp ] Diretório de estado de autenticação não encontrado em ${this.AUTH_STATE_PATH}. Criando...`,
        );
        try {
          fs.mkdirSync(this.AUTH_STATE_PATH, { recursive: true });
          this.logger.info(
            `[ connectToWhatsApp ] Diretório ${this.AUTH_STATE_PATH} criado com sucesso.`,
          );
        } catch (mkdirError) {
          this.logger.error(
            `[ connectToWhatsApp ] Falha ao criar o diretório ${this.AUTH_STATE_PATH}: ${mkdirError.message}`,
            { stack: mkdirError.stack },
          );
          throw mkdirError;
        }
      }

      this.logger.info(
        `[ connectToWhatsApp ] Usando diretório de estado de autenticação: ${this.AUTH_STATE_PATH}`,
      );
      const { state, saveCreds } = await useMultiFileAuthState(this.AUTH_STATE_PATH);
      this.logger.debug('[ connectToWhatsApp ] Estado de autenticação carregado/criado.');
      this.logger.debug(
        `[ connectToWhatsApp ] Configurações de ambiente relevantes: SYNC_FULL_HISTORY=${env.SYNC_FULL_HISTORY}, DEBUG_BAILEYS=${env.DEBUG_BAILEYS}`,
      );

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
      this.logger.error(
        `[ connectToWhatsApp ] Erro ao iniciar a conexão com o WhatsApp: ${error.message}`,
        {
          code: error.code,
          stack: error.stack,
        },
      );

      const isLikelyAuthStateError =
        (error.message &&
          (error.message.includes(this.AUTH_STATE_PATH) ||
            error.message.toLowerCase().includes('auth') ||
            error.message.toLowerCase().includes('creds'))) ||
        (error.code &&
          ['ENOENT', 'EACCES', 'EBADF', 'EPERM', 'EISDIR', 'ENOTDIR'].includes(error.code));

      if (isLikelyAuthStateError) {
        const fatalMessage = `[ connectToWhatsApp ] Erro crítico e possivelmente irrecuperável relacionado ao estado de autenticação em ${this.AUTH_STATE_PATH}. Verifique as permissões, a integridade da pasta ou se o caminho é válido. Não será tentada a reconexão automática. Detalhes: ${error.message}`;
        this.logger.fatal(fatalMessage);
        throw new Error(fatalMessage, { cause: error });
      } else {
        this.logger.warn(
          `[ connectToWhatsApp ] Agendando reconexão devido a erro não relacionado ao estado de autenticação: ${error.message}`,
        );
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

  /**
   * Inicializa o ConnectionManager e, por extensão, a aplicação.
   * Este método orquestra a inicialização do banco de dados, a criação de tabelas
   * e o início da conexão com o WhatsApp.
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('[ ConnectionManager.initialize ] Iniciando a aplicação...');
      this.logger.debug('[ ConnectionManager.initialize ] Fase 1: Inicializando banco de dados.');

      await this.db.initDatabase();
      this.logger.info(
        '[ ConnectionManager.initialize ] Pool de conexões do banco de dados inicializado.',
      );
      this.logger.debug('[ ConnectionManager.initialize ] Fase 2: Criando/Verificando tabelas.');

      await this.controllers.createTables();
      this.logger.info(
        '[ ConnectionManager.initialize ] Tabelas do banco de dados verificadas/criadas.',
      );
      this.logger.debug('[ ConnectionManager.initialize ] Fase 3: Conectando ao WhatsApp.');

      await this.connectToWhatsApp();
      this.logger.debug(
        '[ ConnectionManager.initialize ] Conexão com WhatsApp iniciada (ou agendada para reconexão).',
      );
    } catch (error) {
      this.logger.error(
        `[ ConnectionManager.initialize ] Falha crítica durante a inicialização da aplicação: ${error.message}`,
        {
          stack: error.cause?.stack || error.stack,
        },
      );
      process.exit(1);
    }
  }

  /**
   * Retorna a instância atual do cliente Baileys (WASocket).
   * @public
   * @returns {import('baileys').WASocket | null} A instância do cliente, ou `null` se não estiver inicializada/conectada.
   */
  getClient() {
    return this.clientInstance;
  }
}

/**
 * Instância singleton do ConnectionManager.
 * Configurada com os caminhos, funções de banco de dados, controllers e logger necessários.
 * @type {ConnectionManager}
 */
const connectionManager = new ConnectionManager({
  authStatePath: AUTH_STATE_PATH,
  dbFunctions: { initDatabase, closePool },
  controllerFunctions: { createTables, processUserData, processParticipantUpdate, botController },
  loggerInstance: logger,
});

/**
 * @module ConnectionService
 * @description Ponto de entrada para interagir com o serviço de conexão do WhatsApp.
 * Expõe uma forma de obter a instância do cliente Baileys.
 */
module.exports = {
  /**
   * @function getClientInstance
   * @description Retorna a instância ativa do cliente WhatsApp (Baileys).
   * @returns {import('baileys').WASocket | null} A instância do cliente Baileys, ou `null` se não estiver conectado/inicializado.
   * @example
   * const client = getClientInstance();
   * if (client) {
   *   client.sendMessage(...);
   * }
   */
  getClientInstance: () => connectionManager.getClient(),
};

connectionManager.initialize();
