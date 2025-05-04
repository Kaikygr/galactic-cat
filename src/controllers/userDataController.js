const { runQuery } = require('../database/processDatabase');
const logger = require('../utils/logger');
const moment = require('moment-timezone');
const crypto = require('crypto');
const path = require('path');
const baileys = require('baileys');

const sharedConfigPath = path.join(__dirname, '../config/options.json');
const sharedConfig = require(sharedConfigPath);
logger.info('[ userDataController ] ⚙️ Configuração carregada.');

if (!sharedConfig?.database?.tables) {
  throw new Error("Configuração inválida: 'database.tables' não encontrado em options.json");
}
if (!sharedConfig?.defaults?.userData) {
  throw new Error("Configuração inválida: 'defaults.userData' não encontrado em options.json");
}
if (!sharedConfig?.defaults?.groupData) {
  logger.warn("[ userDataController ] ⚠️ Aviso: 'defaults.groupData' não encontrado em options.json. Fallbacks podem usar valores codificados.");
}
if (sharedConfig?.cache?.groupMetadataExpiryMs === undefined) {
  logger.warn("[ userDataController ] ⚠️ Aviso: 'cache.groupMetadataExpiryMs' não encontrado em options.json. Usando fallback de 5 minutos.");
}

const DB_TABLES = sharedConfig.database.tables;
const DEFAULT_USER_PUSHNAME = sharedConfig.defaults.userData.pushName || 'Desconhecido';
const DEFAULT_GROUP_DATA = sharedConfig.defaults.groupData || {
  subject: 'Grupo Desconhecido',
  owner: null,
  desc: null,
  descId: null,
  subjectOwner: null,
  isWelcome: 0,
  welcomeMessage: 'Bem-vindo(a) ao {groupName}, {user}! 🎉',
  welcomeMedia: null,
  exitMessage: 'Até mais, {user}! Sentiremos sua falta. 👋',
  exitMedia: null,
};
const GROUP_CACHE_EXPIRY_MS = sharedConfig.cache.groupMetadataExpiryMs ?? 5 * 60 * 1000;

class GroupMetadataCache {
  constructor(expiryMs = GROUP_CACHE_EXPIRY_MS, customLogger = logger) {
    this.cache = new Map();
    this.expiryMs = expiryMs;
    this.logger = customLogger;
    this.cleanupInterval = null;

    this.logger.info(`[ GroupMetadataCache ] 🕒 Inicializado com expiração: ${expiryMs}ms`);
  }

  set(key, data) {
    if (typeof key !== 'string' || data === undefined) {
      this.logger.warn(`[ GroupMetadataCache ] ❌ Tentativa de set inválida. Key: ${key}, Data: ${data}`);
      return;
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.expiryMs) {
      this.logger.debug(`[ GroupMetadataCache ] ⏳ Cache expirado para ${key}. Removendo.`);
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.logger.info('[ GroupMetadataCache ] 📤 Cache limpo.');
  }

  get size() {
    return this.cache.size;
  }

  startAutoCleanup(intervalMs = 60000) {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (now - entry.timestamp > this.expiryMs) {
          this.cache.delete(key);
          this.logger.debug(`[ GroupMetadataCache ] ♻️ Expirado no sweep: ${key}`);
        }
      }
    }, intervalMs);

    this.logger.info(`[ GroupMetadataCache ] 🔄 Auto-cleanup iniciado a cada ${intervalMs}ms.`);
  }

  stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.info('[ GroupMetadataCache ] 🛑 Auto-cleanup parado.');
    }
  }
}

const groupMetadataCache = new GroupMetadataCache();

const sanitizeData = (value, defaultValue = null) => (value == null ? defaultValue : value);

const formatTimestampForDB = (timestamp) => {
  if (timestamp == null) return null;

  let momentObj = null;

  if (typeof timestamp === 'number' && timestamp > 0) {
    momentObj = moment.unix(timestamp);
  } else if (timestamp instanceof Date && !isNaN(timestamp)) {
    momentObj = moment(timestamp);
  } else if (typeof timestamp === 'string' || moment.isMoment(timestamp)) {
    momentObj = moment(timestamp);
  } else {
    return null;
  }

  return momentObj.isValid() ? momentObj.utc().format('YYYY-MM-DD HH:mm:ss') : null;
};

const validateIncomingInfo = (info) => {
  const key = info?.key;

  if (!key) {
    throw new Error('Mensagem sem chave (`key`) fornecida.');
  }

  if (key.fromMe) {
    throw new Error('Mensagem enviada por você mesmo foi ignorada.');
  }

  const from = key.remoteJid;
  if (typeof from !== 'string' || (!from.endsWith('@g.us') && !from.endsWith('@s.whatsapp.net'))) {
    throw new Error(`RemoteJid inválido ou ausente: ${from}`);
  }

  const isGroup = from.endsWith('@g.us');
  const participant = isGroup ? key.participant : from;
  const userId = sanitizeData(participant);

  if (!userId) {
    throw new Error(`Remetente não identificado (participant: ${participant}).`);
  }

  const messageId = key.id || crypto.randomUUID();

  if (!key.id) {
    logger.warn(`[validateIncomingInfo] ⚠️ Mensagem sem ID original (from: ${from}, sender: ${userId}). Gerado UUID: ${messageId}`);
  }

  return {
    from,
    userId,
    isGroup,
    messageId,
  };
};

/**
 * Verifica se uma tabela existe no banco de dados e a cria, se necessário.
 *
 * @param {string} tableName - Nome da tabela a ser criada ou verificada.
 * @param {string} createStatement - Instrução SQL `CREATE TABLE IF NOT EXISTS`.
 * @throws {Error} Lança erro se os parâmetros forem inválidos ou se a execução da query falhar.
 */
async function createTableIfNotExists(tableName, createStatement) {
  /* Verifica se os parâmetros são válidos */
  if (typeof tableName !== 'string' || !tableName.trim()) {
    throw new Error(`[ createTableIfNotExists ] Nome da tabela inválido.`);
  }
  /* Verifica se a instrução SQL é válida */
  if (typeof createStatement !== 'string' || !createStatement.trim().toUpperCase().startsWith('CREATE TABLE')) {
    throw new Error(`[ createTableIfNotExists ] SQL inválido para criação da tabela '${tableName}'.`);
  }

  try {
    /* Executa a instrução SQL para criar a tabela, se não existir */
    logger.debug(`[ createTableIfNotExists ] Executando: ${createStatement}`);
    await runQuery(createStatement);
    logger.info(`[ createTableIfNotExists ] ✅ Tabela '${tableName}' verificada com sucesso.`);
  } catch (error) {
    logger.error(`[ createTableIfNotExists ] ❌ Erro ao criar/verificar tabela '${tableName}': ${error.message}`, {
      stack: error.stack,
      tableName,
      createStatement,
    });
    throw error;
  }
}

/**
 * Cria todas as tabelas necessárias no banco de dados, caso ainda não existam.
 * Utiliza instruções SQL específicas para garantir estrutura e integridade referencial.
 *
 * @throws {Error} Caso ocorra falha crítica na criação de qualquer tabela.
 */
async function createTables() {
  logger.info('[ createTables ] 📦 Verificando e criando tabelas...');

  try {
    /* faz a criação das tabela de groups */
    await createTableIfNotExists(
      DB_TABLES.groups,
      `
      CREATE TABLE IF NOT EXISTS \`${DB_TABLES.groups}\` (
        id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), owner VARCHAR(255), created_at DATETIME,
        description TEXT, description_id VARCHAR(255), subject_owner VARCHAR(255), subject_time DATETIME,
        size INT, \`restrict\` TINYINT(1) DEFAULT 0, announce TINYINT(1) DEFAULT 0, is_community TINYINT(1) DEFAULT 0,
        is_community_announce TINYINT(1) DEFAULT 0, join_approval_mode TINYINT(1) DEFAULT 0, member_add_mode TINYINT(1) DEFAULT 0,
        isPremium TINYINT(1) DEFAULT 0, premiumTemp DATETIME DEFAULT NULL,
        is_welcome TINYINT(1) DEFAULT ${DEFAULT_GROUP_DATA.isWelcome}, welcome_message TEXT, welcome_media TEXT DEFAULT NULL,
        exit_message TEXT, exit_media TEXT DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    );
    logger.debug(`[ createTables ] 🔧 Tabela '${DB_TABLES.groups}' pronta.`);

    /*faz a criação da tabela de users */
    await createTableIfNotExists(
      DB_TABLES.users,
      `
      CREATE TABLE IF NOT EXISTS \`${DB_TABLES.users}\` (
        sender VARCHAR(255) PRIMARY KEY, pushName VARCHAR(255), isPremium TINYINT(1) DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL, has_interacted TINYINT(1) DEFAULT 0,
        first_interaction_at DATETIME NULL DEFAULT NULL, last_interaction_at DATETIME NULL DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    );
    logger.debug(`[ createTables ] 🔧 Tabela '${DB_TABLES.users}' pronta.`);

    /* faz a criação da tabela de mensagens */
    await createTableIfNotExists(
      DB_TABLES.messages,
      `
      CREATE TABLE IF NOT EXISTS \`${DB_TABLES.messages}\` (
        message_id VARCHAR(255) NOT NULL, sender_id VARCHAR(255) NOT NULL, group_id VARCHAR(255),
        messageType VARCHAR(255), messageContent MEDIUMTEXT, timestamp DATETIME NOT NULL,
        PRIMARY KEY (sender_id, timestamp, message_id),
        INDEX idx_message_id (message_id), INDEX idx_group_id (group_id),
        CONSTRAINT fk_sender_id FOREIGN KEY (sender_id) REFERENCES \`${DB_TABLES.users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_group_id FOREIGN KEY (group_id) REFERENCES \`${DB_TABLES.groups}\`(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    );
    logger.debug(`[ createTables ] 🔧 Tabela '${DB_TABLES.messages}' pronta.`);

    /* faz a criação da tabela de participantes */
    await createTableIfNotExists(
      DB_TABLES.participants,
      `
      CREATE TABLE IF NOT EXISTS \`${DB_TABLES.participants}\` (
        group_id VARCHAR(255) NOT NULL, participant VARCHAR(255) NOT NULL, isAdmin TINYINT(1) DEFAULT 0,
        PRIMARY KEY (group_id, participant),
        CONSTRAINT fk_group_participants_group FOREIGN KEY (group_id) REFERENCES \`${DB_TABLES.groups}\`(id) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_participant (participant)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    );
    logger.debug(`[ createTables ] 🔧 Tabela '${DB_TABLES.participants}' pronta.`);

    /* faz a criação da tabela de uso de comandos */
    await createTableIfNotExists(
      DB_TABLES.commandUsage,
      `
      CREATE TABLE IF NOT EXISTS \`${DB_TABLES.commandUsage}\` (
        user_id VARCHAR(255) NOT NULL, command_name VARCHAR(50) NOT NULL, usage_count_window INT DEFAULT 0,
        window_start_timestamp DATETIME NULL, last_used_timestamp DATETIME NULL,
        PRIMARY KEY (user_id, command_name),
        CONSTRAINT fk_user_usage FOREIGN KEY (user_id) REFERENCES \`${DB_TABLES.users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    );
    logger.debug(`[ createTables ] 🔧 Tabela '${DB_TABLES.commandUsage}' pronta.`);

    /* faz a criação da tabela de analytics */
    await createTableIfNotExists(
      DB_TABLES.analytics,
      `
      CREATE TABLE IF NOT EXISTS \`${DB_TABLES.analytics}\` (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL, command_name VARCHAR(50) NOT NULL,
        group_id VARCHAR(255) NULL, timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_premium_at_execution TINYINT(1) NOT NULL, execution_status ENUM('allowed', 'rate_limited', 'disabled', 'error') NOT NULL,
        rate_limit_count_before INT NULL, rate_limit_limit_at_execution INT NULL,
        INDEX idx_analytics_user_id (user_id), INDEX idx_analytics_command_name (command_name),
        INDEX idx_analytics_group_id (group_id), INDEX idx_analytics_timestamp (timestamp),
        INDEX idx_analytics_is_premium (is_premium_at_execution), INDEX idx_analytics_status (execution_status),
        CONSTRAINT fk_analytics_user_id FOREIGN KEY (user_id) REFERENCES \`${DB_TABLES.users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_analytics_group_id FOREIGN KEY (group_id) REFERENCES \`${DB_TABLES.groups}\`(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    );
    logger.debug(`[ createTables ] 🔧 Tabela '${DB_TABLES.analytics}' pronta.`);

    /* faz a criação da tabela de histórico de interações */
    await createTableIfNotExists(
      DB_TABLES.interactionHistory,
      `
      CREATE TABLE IF NOT EXISTS \`${DB_TABLES.interactionHistory}\` (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        interaction_type ENUM('private_message', 'private_command', 'group_command', 'group_message') NOT NULL,
        group_id VARCHAR(255) NULL DEFAULT NULL, command_name VARCHAR(50) NULL DEFAULT NULL,
        CONSTRAINT fk_interaction_user FOREIGN KEY (user_id) REFERENCES \`${DB_TABLES.users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_interaction_user (user_id), INDEX idx_interaction_timestamp (timestamp), INDEX idx_interaction_group (group_id)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    );
    logger.debug(`[ createTables ] 🔧 Tabela '${DB_TABLES.interactionHistory}' pronta.`);

    logger.info('[ createTables ] ✅ Verificação de todas as tabelas concluída.');
  } catch (error) {
    logger.error('[ createTables ] ❌ Falha crítica durante a inicialização das tabelas.', {
      message: error.message,
      stack: error.stack,
    });
    throw new Error(`Falha ao inicializar tabelas: ${error.message}`);
  }
}

/**
 * Garante que as colunas de interação existem na tabela `users`.
 * Adiciona dinamicamente as colunas ausentes com os tipos definidos.
 *
 * @returns {Promise<boolean>} `true` se todas as colunas foram verificadas ou criadas com sucesso, `false` se alguma falhou.
 */
async function ensureUserInteractionColumns() {
  logger.info('[ ensureUserInteractionColumns ] Verificando colunas de interação na tabela users...');
  /* lista de colunas que devem existir */
  const columnsToAdd = [
    { name: 'first_interaction_at', definition: 'DATETIME NULL DEFAULT NULL' },
    { name: 'last_interaction_at', definition: 'DATETIME NULL DEFAULT NULL' },
    { name: 'has_interacted', definition: 'TINYINT(1) DEFAULT 0' },
  ];

  const usersTable = DB_TABLES.users;
  const failedColumns = [];

  for (const column of columnsToAdd) {
    try {
      /* faz a verificação se a coluna existe */
      const checkQuery = `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?;
      `;

      const checkResult = await runQuery(checkQuery, [usersTable, column.name]);

      if (checkResult.length === 0) {
        logger.warn(`[ ensureUserInteractionColumns ] ⚠️ Coluna '${column.name}' não encontrada. Adicionando...`);

        const alterQuery = `ALTER TABLE \`${usersTable}\` ADD COLUMN \`${column.name}\` ${column.definition};`;

        try {
          /* faz a adição da coluna */
          await runQuery(alterQuery);
          logger.info(`[ ensureUserInteractionColumns ] ✅ Coluna '${column.name}' adicionada.`);
        } catch (alterError) {
          if (alterError.code === 'ER_DUP_FIELDNAME') {
            logger.warn(`[ ensureUserInteractionColumns ] 🔄 Coluna '${column.name}' já existe (detectado durante ALTER).`);
          } else {
            logger.error(`[ ensureUserInteractionColumns ] ❌ Erro ao adicionar '${column.name}': ${alterError.message}`, {
              stack: alterError.stack,
              column: column.name,
            });
            failedColumns.push(column.name);
          }
        }
      } else {
        /* se a coluna já existe, apenas loga */
        logger.debug(`[ ensureUserInteractionColumns ] Coluna '${column.name}' já existe.`);
      }
    } catch (error) {
      logger.error(`[ ensureUserInteractionColumns ] ❌ Erro ao verificar '${column.name}': ${error.message}`, {
        stack: error.stack,
        column: column.name,
      });
      /* se a verificação falhar, adiciona a coluna à lista de falhas */
      failedColumns.push(column.name);
    }
  }

  if (failedColumns.length === 0) {
    logger.info('[ ensureUserInteractionColumns ] ✅ Verificação das colunas de interação concluída com sucesso.');
    return true;
  } else {
    logger.error(`[ ensureUserInteractionColumns ] ❌ Falha ao garantir as colunas: ${failedColumns.join(', ')}`);
    return false;
  }
}

/**
 * Registra uma interação do usuário no banco de dados, atualizando seu registro e salvando no histórico.
 * Define a primeira interação elegível quando aplicável.
 *
 * @param {string} userId - ID do remetente (usuário).
 * @param {string} pushName - Nome visível do usuário.
 * @param {boolean} isGroup - Indica se foi em grupo.
 * @param {boolean} isCommand - Indica se foi uma interação via comando.
 * @param {string|null} commandName - Nome do comando executado (se aplicável).
 * @param {string|null} groupId - ID do grupo (se aplicável).
 * @returns {Promise<boolean>} - `true` se foi a primeira interação elegível, `false` caso contrário ou em erro.
 */
async function logInteraction(userId, pushName, isGroup, isCommand, commandName = null, groupId = null) {
  const now = moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss');
  const usersTable = DB_TABLES.users;
  const historyTable = DB_TABLES.interactionHistory;

  if (!userId || !usersTable || !historyTable) {
    /* verifica se os parâmetros são válidos */
    logger.error('[ logInteraction ] ❌ Parâmetros ou tabelas inválidas.');
    return false;
  }

  const interactionType = isGroup ? (isCommand ? 'group_command' : 'group_message') : isCommand ? 'private_command' : 'private_message';

  const isEligibleForFirst = !isGroup || isCommand;
  let wasFirstEligibleInteraction = false;

  try {
    /* Verifica se as colunas de interação existem e cria se necessário */
    const upsertUserQuery = `
      INSERT INTO \`${usersTable}\` (sender, pushName, first_interaction_at, last_interaction_at, has_interacted)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
          last_interaction_at = VALUES(last_interaction_at),
          first_interaction_at = IF(first_interaction_at IS NULL AND ?, VALUES(first_interaction_at), first_interaction_at),
          has_interacted = IF(has_interacted = 0 AND ?, 1, has_interacted),
          pushName = VALUES(pushName);
    `;

    const userParams = [userId, sanitizeData(pushName, DEFAULT_USER_PUSHNAME), now, now, isEligibleForFirst ? 1 : 0, isEligibleForFirst, isEligibleForFirst];

    await runQuery(upsertUserQuery, userParams);

    /*Checa se foi a primeira interação apenas se necessário*/
    if (isEligibleForFirst) {
      const checkQuery = `SELECT 1 FROM \`${usersTable}\` WHERE sender = ? AND first_interaction_at = ? LIMIT 1`;
      const checkResult = await runQuery(checkQuery, [userId, now]);
      if (checkResult.length > 0) {
        wasFirstEligibleInteraction = true;
        logger.info(`[ logInteraction ] 🎉 Primeira interação elegível registrada para ${userId} às ${now}.`);
      }
    }

    /* Registra a interação no histórico */
    const historyQuery = `
      INSERT INTO \`${historyTable}\` (user_id, timestamp, interaction_type, group_id, command_name)
      VALUES (?, ?, ?, ?, ?);
    `;
    await runQuery(historyQuery, [userId, now, interactionType, groupId, commandName]);

    logger.debug(`[ logInteraction ] Interação registrada para ${userId}. Tipo: ${interactionType}. Primeira elegível: ${wasFirstEligibleInteraction}`);
    return wasFirstEligibleInteraction;
  } catch (error) {
    /* Se falhar, loga o erro e retorna false */
    logger.error(`[ logInteraction]  ❌ Erro ao registrar interação para ${userId}: ${error.message}`, {
      stack: error.stack,
    });
    return false;
  }
}

async function saveUserToDatabase(userId, pushName) {
  const finalPushName = sanitizeData(pushName, DEFAULT_USER_PUSHNAME);
  const query = `
    INSERT INTO ${DB_TABLES.users} (sender, pushName)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE pushName = VALUES(pushName);
  `;
  try {
    await runQuery(query, [userId, finalPushName]);
    logger.debug(`[ saveUserToDatabase ] Usuário ${userId} salvo/atualizado.`);
  } catch (error) {
    logger.error(`[ saveUserToDatabase ] ❌ Erro ao salvar/atualizar usuário ${userId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

async function saveGroupToDatabase(mergedGroupMeta) {
  const groupId = mergedGroupMeta?.id;
  if (!groupId) {
    logger.error('[ saveGroupToDatabase ] ❌ Erro: ID do grupo ausente nos metadados mesclados.', { mergedGroupMeta });
    throw new Error('ID do grupo ausente nos metadados para salvar.');
  }

  const values = [
    groupId,
    sanitizeData(mergedGroupMeta.name, DEFAULT_GROUP_DATA.subject),
    sanitizeData(mergedGroupMeta.owner, DEFAULT_GROUP_DATA.owner),
    formatTimestampForDB(mergedGroupMeta.creation),
    sanitizeData(mergedGroupMeta.description, DEFAULT_GROUP_DATA.desc),
    sanitizeData(mergedGroupMeta.descId, DEFAULT_GROUP_DATA.descId),
    sanitizeData(mergedGroupMeta.subjectOwner, DEFAULT_GROUP_DATA.subjectOwner),
    formatTimestampForDB(mergedGroupMeta.subjectTime),
    mergedGroupMeta.size || 0,
    mergedGroupMeta.restrict ? 1 : 0,
    mergedGroupMeta.announce ? 1 : 0,
    mergedGroupMeta.isCommunity ? 1 : 0,
    mergedGroupMeta.isCommunityAnnounce ? 1 : 0,
    mergedGroupMeta.joinApprovalMode ? 1 : 0,
    mergedGroupMeta.memberAddMode ? 1 : 0,
    mergedGroupMeta.isPremium ? 1 : 0,
    formatTimestampForDB(mergedGroupMeta.premiumTemp),
    sanitizeData(mergedGroupMeta.is_welcome, DEFAULT_GROUP_DATA.isWelcome),
    sanitizeData(mergedGroupMeta.welcome_message, DEFAULT_GROUP_DATA.welcomeMessage),
    sanitizeData(mergedGroupMeta.welcome_media, DEFAULT_GROUP_DATA.welcomeMedia),
    sanitizeData(mergedGroupMeta.exit_message, DEFAULT_GROUP_DATA.exitMessage),
    sanitizeData(mergedGroupMeta.exit_media, DEFAULT_GROUP_DATA.exitMedia),
  ];

  const query = `
    INSERT INTO \`${DB_TABLES.groups}\` (
      id, name, owner, created_at, description, description_id, subject_owner, subject_time, size,
      \`restrict\`, announce, is_community, is_community_announce, join_approval_mode, member_add_mode,
      isPremium, premiumTemp, is_welcome, welcome_message, welcome_media, exit_message, exit_media
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name), owner = VALUES(owner), created_at = VALUES(created_at), description = VALUES(description),
      description_id = VALUES(description_id), subject_owner = VALUES(subject_owner), subject_time = VALUES(subject_time),
      size = VALUES(size), \`restrict\` = VALUES(\`restrict\`), announce = VALUES(announce), is_community = VALUES(is_community),
      is_community_announce = VALUES(is_community_announce), join_approval_mode = VALUES(join_approval_mode),
      member_add_mode = VALUES(member_add_mode), isPremium = VALUES(isPremium), premiumTemp = VALUES(premiumTemp),
      is_welcome = VALUES(is_welcome), welcome_message = VALUES(welcome_message), welcome_media = VALUES(welcome_media),
      exit_message = VALUES(exit_message), exit_media = VALUES(exit_media);
  `;

  try {
    await runQuery(query, values);
    logger.debug(`[ saveGroupToDatabase ] Grupo ${groupId} salvo/atualizado.`);
  } catch (error) {
    logger.error(`[ saveGroupToDatabase ] ❌ Erro ao salvar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

async function saveGroupParticipantsToDatabase(groupId, participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    logger.debug(`[ saveGroupParticipantsToDatabase ] Sem participantes para salvar para ${groupId}.`);
    return;
  }

  const values = participants.map((p) => [groupId, p.id, p.admin === 'admin' || p.admin === 'superadmin' ? 1 : 0]);

  if (values.length === 0) return;
  const placeholders = values.map(() => '(?, ?, ?)').join(', ');
  const bulkQuery = `INSERT IGNORE INTO ${DB_TABLES.participants} (group_id, participant, isAdmin) VALUES ${placeholders};`;
  const flatValues = values.flat();
  try {
    await runQuery(bulkQuery, flatValues);
    logger.debug(`[ saveGroupParticipantsToDatabase ] Participantes (bulk) salvos para ${groupId}.`);
  } catch (error) {
    logger.warn(`[ saveGroupParticipantsToDatabase ] ⚠️ Inserção em massa falhou para ${groupId}, tentando individualmente: ${error.message}`);
    const individualQuery = `INSERT IGNORE INTO ${DB_TABLES.participants} (group_id, participant, isAdmin) VALUES (?, ?, ?);`;
    let successCount = 0;
    let failCount = 0;
    for (const participantData of values) {
      try {
        await runQuery(individualQuery, participantData);
        successCount++;
      } catch (individualError) {
        failCount++;
        logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Erro individual ${participantData[1]} para ${groupId}: ${individualError.message}`);
      }
    }
    logger.warn(`[ saveGroupParticipantsToDatabase ] ⚠️ Fallback concluído para ${groupId}: ${successCount} sucessos, ${failCount} falhas.`);

    if (failCount > 0 && successCount === 0) {
      logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Falha crítica: Todas as inserções individuais falharam para ${groupId}.`);
    }
  }
}

async function getGroupSettingsFromDB(groupId) {
  const query = `
    SELECT isPremium, premiumTemp, is_welcome, welcome_message, welcome_media, exit_message, exit_media
    FROM \`${DB_TABLES.groups}\` WHERE id = ? LIMIT 1;
  `;
  try {
    const results = await runQuery(query, [groupId]);
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error(`[getGroupSettingsFromDB] ❌ Erro ao buscar config customizada para ${groupId}: ${error.message}`);
    return null;
  }
}

async function ensureGroupExists(groupId) {
  try {
    const checkQuery = `SELECT id FROM \`${DB_TABLES.groups}\` WHERE id = ? LIMIT 1;`;
    const results = await runQuery(checkQuery, [groupId]);

    if (results.length === 0) {
      logger.warn(`[ ensureGroupExists ] Grupo ${groupId} não encontrado no DB. Criando entrada mínima com defaults.`);
      const insertQuery = `
        INSERT IGNORE INTO \`${DB_TABLES.groups}\`
          (id, name, owner, created_at, is_welcome, welcome_message, welcome_media, exit_message, exit_media)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      await runQuery(insertQuery, [groupId, DEFAULT_GROUP_DATA.subject, DEFAULT_GROUP_DATA.owner, moment().utc().format('YYYY-MM-DD HH:mm:ss'), DEFAULT_GROUP_DATA.isWelcome, DEFAULT_GROUP_DATA.welcomeMessage, DEFAULT_GROUP_DATA.welcomeMedia, DEFAULT_GROUP_DATA.exitMessage, DEFAULT_GROUP_DATA.exitMedia]);
      logger.info(`[ ensureGroupExists ] ✅ Entrada mínima criada para ${groupId}.`);
    }
    return groupId;
  } catch (error) {
    logger.error(`[ ensureGroupExists ] ❌ Erro crítico ao verificar/criar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

async function saveMessageToDatabase(messageData) {
  const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;

  if (!messageId || !userId || !messageType || !timestamp) {
    logger.error('[ saveMessageToDatabase ] ❌ Dados da mensagem incompletos.', messageData);
    throw new Error('Dados da mensagem incompletos para salvar.');
  }

  const query = `
    INSERT INTO ${DB_TABLES.messages} (message_id, sender_id, group_id, messageType, messageContent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE # Avoid errors if message is processed twice, update content just in case
        messageType = VALUES(messageType),
        messageContent = VALUES(messageContent);
  `;
  try {
    await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
    logger.debug(`[ saveMessageToDatabase ] Mensagem ${messageId} salva.`);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW' || error.code === 'ER_NO_REFERENCED_ROW_2') {
      if (error.message.includes('fk_sender_id')) {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Usuário ${userId} não encontrado no DB. Mensagem ${messageId} não salva.`);
      } else if (error.message.includes('fk_group_id') && groupId) {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Grupo ${groupId} não encontrado no DB. Mensagem ${messageId} não salva.`);
      } else {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK desconhecido para msg ${messageId}: ${error.message}`, { stack: error.stack });
      }
      throw new Error(`Falha de chave estrangeira ao salvar mensagem ${messageId}: ${error.message}`);
    } else {
      logger.error(`[ saveMessageToDatabase ] ❌ Erro ao salvar msg ${messageId}: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }
}

async function processIncomingMessageData(info) {
  let validatedData;
  try {
    validatedData = validateIncomingInfo(info);
  } catch (validationError) {
    if (validationError.message !== 'Dados inválidos ou mensagem própria.') {
      logger.warn(`[ processIncomingMessageData ] ⚠️ Validação falhou: ${validationError.message}`, { key: info?.key });
    }
    throw validationError;
  }

  const { from, userId, isGroup, messageId } = validatedData;
  const pushName = info.pushName;
  try {
    await saveUserToDatabase(userId, pushName);
  } catch (userSaveError) {
    logger.error(`[ processIncomingMessageData ] ⚠️ Falha ao salvar/garantir usuário ${userId}. Mensagem ${messageId} pode não ser salva corretamente devido a FK. Erro: ${userSaveError.message}`);
  }

  let groupId = null;
  if (isGroup) {
    try {
      groupId = await ensureGroupExists(from);
    } catch (groupEnsureError) {
      logger.error(`[ processIncomingMessageData ] ❌ Falha crítica ao garantir grupo ${from}. Mensagem ${messageId} não será salva. Erro: ${groupEnsureError.message}`);
      throw groupEnsureError;
    }
  }

  try {
    const messageType = baileys.getContentType(info.message) || 'unknown';
    let messageContent = null;
    if (info.message) {
      try {
        const content = info.message[messageType];
        if (content) {
          messageContent = JSON.stringify(content);
        } else {
          messageContent = JSON.stringify(info.message);
          logger.debug(`[ processIncomingMessageData ] Conteúdo direto para tipo ${messageType} não encontrado, stringificando info.message completo (ID: ${messageId})`);
        }
      } catch (stringifyError) {
        logger.warn(`[ processIncomingMessageData ] ⚠️ Falha ao stringificar conteúdo ${messageType} (ID: ${messageId}): ${stringifyError.message}. Usando fallback.`);
        messageContent = JSON.stringify({ error: `Falha ao stringificar: ${stringifyError.message}` });
      }
    }

    const timestamp = moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss');

    await saveMessageToDatabase({ messageId, userId, groupId, messageType, messageContent, timestamp });

    return { userId, groupId, messageId };
  } catch (messageSaveError) {
    logger.error(`[ processIncomingMessageData ] ❌ Erro final ao salvar dados da mensagem ${messageId}.`);
    throw messageSaveError;
  }
}

async function handleGroupMetadataUpdate(groupId, client) {
  if (!client || typeof client.groupMetadata !== 'function') {
    logger.error(`[ handleGroupMetadataUpdate ] ❌ Cliente inválido ou sem função groupMetadata para buscar metadados de ${groupId}.`);
    return;
  }

  const cachedData = groupMetadataCache.get(groupId);
  if (cachedData) {
    logger.debug(`[ handleGroupMetadataUpdate ] ⚡ Usando cache para metadados de ${groupId}.`);

    return;
  }

  logger.info(`[ handleGroupMetadataUpdate ] 🔄 Buscando metadados (API) E config (DB) para ${groupId} (sem cache válido).`);
  try {
    const fetchedMeta = await client.groupMetadata(groupId);
    if (!fetchedMeta || !fetchedMeta.id) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Metadados inválidos ou não encontrados via cliente para ${groupId}. Grupo pode não existir mais.`);
      groupMetadataCache.delete(groupId);
      return;
    }

    const existingDbSettings = await getGroupSettingsFromDB(groupId);

    const mergedMeta = {
      id: groupId,
      name: sanitizeData(fetchedMeta.subject, DEFAULT_GROUP_DATA.subject),
      owner: sanitizeData(fetchedMeta.owner, DEFAULT_GROUP_DATA.owner),
      creation: fetchedMeta.creation,
      description: sanitizeData(fetchedMeta.desc, DEFAULT_GROUP_DATA.desc),
      descId: sanitizeData(fetchedMeta.descId, DEFAULT_GROUP_DATA.descId),
      subjectOwner: sanitizeData(fetchedMeta.subjectOwner, DEFAULT_GROUP_DATA.subjectOwner),
      subjectTime: fetchedMeta.subjectTime,
      size: fetchedMeta.size || 0,
      restrict: fetchedMeta.restrict ? 1 : 0,
      announce: fetchedMeta.announce ? 1 : 0,
      isCommunity: fetchedMeta.isCommunity ? 1 : 0,
      isCommunityAnnounce: fetchedMeta.isCommunityAnnounce ? 1 : 0,
      joinApprovalMode: fetchedMeta.joinApprovalMode ? 1 : 0,
      memberAddMode: fetchedMeta.memberAddMode ? 1 : 0,
      isPremium: existingDbSettings?.isPremium ?? 0,
      premiumTemp: existingDbSettings?.premiumTemp ?? null,
      is_welcome: existingDbSettings?.is_welcome ?? DEFAULT_GROUP_DATA.isWelcome,
      welcome_message: existingDbSettings?.welcome_message ?? DEFAULT_GROUP_DATA.welcomeMessage,
      welcome_media: existingDbSettings?.welcome_media ?? DEFAULT_GROUP_DATA.welcomeMedia,
      exit_message: existingDbSettings?.exit_message ?? DEFAULT_GROUP_DATA.exitMessage,
      exit_media: existingDbSettings?.exit_media ?? DEFAULT_GROUP_DATA.exitMedia,
    };

    const participantsToSave = fetchedMeta.participants;

    await saveGroupToDatabase(mergedMeta);

    if (Array.isArray(participantsToSave)) {
      await saveGroupParticipantsToDatabase(groupId, participantsToSave);
    } else {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Lista de participantes ausente ou inválida nos metadados buscados para ${groupId}.`);
    }

    groupMetadataCache.set(groupId, fetchedMeta);

    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados (mesclados com DB) e participantes de ${groupId} salvos. Cache atualizado.`);
  } catch (fetchSaveError) {
    if (fetchSaveError.message?.includes('group not found') || fetchSaveError.output?.statusCode === 404) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Grupo ${groupId} não encontrado pelo cliente durante busca/processamento.`);
      groupMetadataCache.delete(groupId);
    } else {
      logger.error(`[ handleGroupMetadataUpdate ] ❌ Erro ao buscar/processar metadados de ${groupId}: ${fetchSaveError.message}`, { stack: fetchSaveError.stack });
    }
  }
}

async function processUserData(data, client) {
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  if (messages.length === 0) {
    return;
  }

  const validMessages = messages.filter(({ key }) => {
    const jid = key?.remoteJid;
    const isValid = typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us'));
    if (!isValid && jid) {
      logger.warn(`[ processUserData ] ⚠️ Ignorando mensagem com JID inválido: ${jid}`);
    }
    return isValid;
  });

  if (validMessages.length === 0) {
    logger.debug('[ processUserData ] Nenhuma mensagem com JID válido encontrada no lote.');
    return;
  }

  logger.info(`[ processUserData ] Processando ${validMessages.length} mensagens válidas...`);

  for (const info of validMessages) {
    const messageId = info?.key?.id || 'ID_DESCONHECIDO_' + crypto.randomUUID();

    try {
      const { groupId } = await processIncomingMessageData(info);

      if (typeof groupId === 'string' && groupId.endsWith('@g.us')) {
        await handleGroupMetadataUpdate(groupId, client);
      }
    } catch (error) {
      if (error.message !== 'Dados inválidos ou mensagem própria.') {
        logger.error(`[ processUserData ] ❌ Erro ao processar msg ${messageId} User: ${info?.key?.participant || info?.key?.remoteJid}, Group: ${info?.key?.remoteJid} : ${error.message}`, {
          messageKey: info?.key,
        });
      }
    }
  }
  logger.info(`[ processUserData ] Processamento de ${validMessages.length} mensagens concluído.`);
}

module.exports = {
  createTables,
  ensureUserInteractionColumns,
  logInteraction,
  processUserData,
  groupMetadataCache,
  handleGroupMetadataUpdate,
  saveGroupToDatabase,
  saveGroupParticipantsToDatabase,
  ensureGroupExists,
  getGroupSettingsFromDB,
  saveUserToDatabase,
  saveMessageToDatabase,
};
