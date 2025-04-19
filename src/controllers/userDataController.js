const { runQuery } = require("../database/processDatabase");
const logger = require("../utils/logger");
const moment = require("moment-timezone");
const crypto = require("crypto");

const DEFAULT_WELCOME_MESSAGE = "Bem-vindo(a) ao {groupName}, {user}! 🎉";
const DEFAULT_EXIT_MESSAGE = "Até mais, {user}! Sentiremos sua falta. 👋";

const config = {
  database: {
    tables: {
      groups: "groups",
      users: "users",
      messages: "messages",
      participants: "group_participants",
      commandUsage: "command_usage",
    },
  },
  defaults: {
    pushName: "Desconhecido",
    groupSubject: "Grupo Desconhecido",
    groupOwner: "Desconhecido",
    groupDesc: null,
    descId: null,
    subjectOwner: null,
    isWelcome: 0,
    welcomeMessage: DEFAULT_WELCOME_MESSAGE,
    welcomeMedia: null,
    exitMessage: DEFAULT_EXIT_MESSAGE,
    exitMedia: null,
  },
  cache: {
    groupMetadataExpiryMs: 5 * 60 * 1000,
  },
};

class GroupMetadataCache {
  constructor(expiryMs = config.cache.groupMetadataExpiryMs) {
    this.cache = new Map();
    this.expiryMs = expiryMs;
    logger.info(`[ GroupMetadataCache ] 🕒 Inicializado com expiração: ${expiryMs}ms`);
  }
  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.expiryMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }
  delete(key) {
    this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
    logger.info("[ GroupMetadataCache ] 📤 Cache limpo.");
  }
}

const groupMetadataCache = new GroupMetadataCache();

const sanitizeData = (value, defaultValue = null) => (value == null ? defaultValue : value);

const formatTimestampForDB = timestamp => {
  if (timestamp == null) return null;
  let m = null;
  if (typeof timestamp === "number" && timestamp > 0) m = moment.unix(timestamp);
  else if (timestamp instanceof Date) m = moment(timestamp);
  else m = moment(timestamp);
  return m.isValid() ? m.format("YYYY-MM-DD HH:mm:ss") : null;
};

const validateIncomingInfo = info => {
  if (!info?.key || info.key.fromMe) throw new Error("Dados inválidos ou mensagem própria.");
  const from = info.key.remoteJid;
  if (!from || (!from.endsWith("@g.us") && !from.endsWith("@s.whatsapp.net"))) throw new Error(`RemoteJid inválido: ${from}`);
  const isGroup = from.endsWith("@g.us");
  const userId = isGroup ? sanitizeData(info.key.participant) : from;
  if (!userId) throw new Error("ID do remetente não determinado.");
  const messageId = info.key.id || crypto.randomUUID();
  if (!info.key.id) logger.warn(`[validateIncomingInfo] Mensagem sem ID original. Gerado UUID: ${messageId}`);
  return { from, userId, isGroup, messageId };
};

async function createTables() {
  logger.info("[ createTables ] 📦 Verificando e criando tabelas...");
  const { groups, users, messages, participants, commandUsage } = config.database.tables;
  const analyticsTable = "command_analytics";
  try {
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${groups}\` (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        owner VARCHAR(255),
        created_at DATETIME,
        description TEXT,
        description_id VARCHAR(255),
        subject_owner VARCHAR(255),
        subject_time DATETIME,
        size INT,
        \`restrict\` TINYINT(1) DEFAULT 0,
        announce TINYINT(1) DEFAULT 0,
        is_community TINYINT(1) DEFAULT 0,
        is_community_announce TINYINT(1) DEFAULT 0,
        join_approval_mode TINYINT(1) DEFAULT 0,
        member_add_mode TINYINT(1) DEFAULT 0,
        isPremium TINYINT(1) DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL,
        is_welcome TINYINT(1) DEFAULT 1,
        welcome_message TEXT DEFAULT NULL,
        welcome_media TEXT DEFAULT NULL,
        exit_message TEXT DEFAULT NULL,
        exit_media TEXT DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${groups}' verificada/criada.`);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${users}\` (
        sender VARCHAR(255) PRIMARY KEY,
        pushName VARCHAR(255),
        isPremium TINYINT(1) DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${users}' verificada/criada.`);
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${messages}\` (
        message_id VARCHAR(255) NOT NULL,
        sender_id VARCHAR(255) NOT NULL,
        group_id VARCHAR(255),
        messageType VARCHAR(255),
        messageContent MEDIUMTEXT,
        timestamp DATETIME NOT NULL,
        PRIMARY KEY (sender_id, timestamp, message_id),
        INDEX idx_message_id (message_id),
        INDEX idx_group_id (group_id),
        CONSTRAINT fk_sender_id FOREIGN KEY (sender_id) REFERENCES \`${users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_group_id FOREIGN KEY (group_id) REFERENCES \`${groups}\`(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${messages}' verificada/criada.`);
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${participants}\` (
        group_id VARCHAR(255) NOT NULL,
        participant VARCHAR(255) NOT NULL,
        isAdmin TINYINT(1) DEFAULT 0,
        PRIMARY KEY (group_id, participant),
        CONSTRAINT fk_group_participants_group FOREIGN KEY (group_id) REFERENCES \`${groups}\`(id) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_participant (participant)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${participants}' verificada/criada.`);
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${commandUsage}\` (
        user_id VARCHAR(255) NOT NULL,
        command_name VARCHAR(50) NOT NULL,
        usage_count_window INT DEFAULT 0,
        window_start_timestamp DATETIME NULL,
        last_used_timestamp DATETIME NULL,
        PRIMARY KEY (user_id, command_name),
        CONSTRAINT fk_user_usage FOREIGN KEY (user_id) REFERENCES \`${users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    // --- *** NEW: Create command_analytics table *** ---
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${analyticsTable}\` (
        \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` VARCHAR(255) NOT NULL,
        \`command_name\` VARCHAR(50) NOT NULL,
        \`group_id\` VARCHAR(255) NULL,
        \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`is_premium_at_execution\` TINYINT(1) NOT NULL COMMENT '0 = Non-Premium, 1 = Premium at the time of execution',
        \`execution_status\` ENUM('allowed', 'rate_limited', 'disabled', 'error') NOT NULL COMMENT 'Status based on rate limit check or internal error during check',
        \`rate_limit_count_before\` INT NULL COMMENT 'Usage count within the window *before* this execution attempt',
        \`rate_limit_limit_at_execution\` INT NULL COMMENT 'The rate limit applied at the time of execution',

        INDEX \`idx_analytics_user_id\` (\`user_id\`),
        INDEX \`idx_analytics_command_name\` (\`command_name\`),
        INDEX \`idx_analytics_group_id\` (\`group_id\`),
        INDEX \`idx_analytics_timestamp\` (\`timestamp\`),
        INDEX \`idx_analytics_is_premium\` (\`is_premium_at_execution\`),
        INDEX \`idx_analytics_status\` (\`execution_status\`),

        CONSTRAINT \`fk_analytics_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`${users}\`(\`sender\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_analytics_group_id\` FOREIGN KEY (\`group_id\`) REFERENCES \`${groups}\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${analyticsTable}' verificada/criada.`);
    // --- *** END NEW TABLE *** ---

    logger.info(`[ createTables ] ✅ Tabela '${commandUsage}' verificada/criada.`);

    logger.info("[ createTables ] ✅ Verificação/criação de todas as tabelas concluída.");
  } catch (error) {
    logger.error(`[ createTables ] ❌ Erro crítico ao criar/verificar tabelas: ${error.message}`, {
      stack: error.stack,
    });
    throw new Error(`Falha ao inicializar tabelas do banco de dados: ${error.message}`);
  }
}

async function saveUserToDatabase(userId, pushName) {
  const finalPushName = sanitizeData(pushName, config.defaults.pushName);
  const query = `
    INSERT INTO ${config.database.tables.users} (sender, pushName)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE pushName = VALUES(pushName);
  `;
  try {
    await runQuery(query, [userId, finalPushName]);
  } catch (error) {
    logger.error(`[ saveUserToDatabase ] ❌ Erro ao salvar usuário ${userId}: ${error.message}`, {
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Salva ou atualiza os metadados do grupo no banco de dados.
 * Inclui todas as colunas de welcome/exit.
 * @param {object} groupMeta - O objeto de metadados do grupo.
 * @param {string} [groupMeta.welcome_media] - URL da mídia de boas-vindas.
 * @param {string} [groupMeta.exit_message] - Mensagem de saída.
 * @param {string} [groupMeta.exit_media] - URL da mídia de saída.
 * @throws {Error} Se o ID do grupo estiver ausente ou a consulta ao banco de dados falhar.
 */
async function saveGroupToDatabase(groupMeta) {
  const groupId = groupMeta?.id;
  if (!groupId) {
    logger.error("[ saveGroupToDatabase ] ❌ Erro: ID do grupo ausente.", { groupMeta });
    throw new Error("ID do grupo ausente nos metadados fornecidos.");
  }

  try {
    // --- Array de valores atualizado ---
    const values = [
      groupId,
      sanitizeData(groupMeta.subject, config.defaults.groupSubject),
      sanitizeData(groupMeta.owner, config.defaults.groupOwner),
      formatTimestampForDB(groupMeta.creation),
      sanitizeData(groupMeta.desc, config.defaults.groupDesc),
      sanitizeData(groupMeta.descId, config.defaults.descId),
      sanitizeData(groupMeta.subjectOwner, config.defaults.subjectOwner),
      formatTimestampForDB(groupMeta.subjectTime),
      groupMeta.size || 0,
      groupMeta.restrict ? 1 : 0,
      groupMeta.announce ? 1 : 0,
      groupMeta.isCommunity ? 1 : 0,
      groupMeta.isCommunityAnnounce ? 1 : 0,
      groupMeta.joinApprovalMode ? 1 : 0,
      groupMeta.memberAddMode ? 1 : 0,
      groupMeta.isPremium ? 1 : 0,
      formatTimestampForDB(groupMeta.premiumTemp),
      sanitizeData(groupMeta.is_welcome, config.defaults.isWelcome),
      sanitizeData(groupMeta.welcome_message, config.defaults.welcomeMessage),
      sanitizeData(groupMeta.welcome_media, config.defaults.welcomeMedia),
      sanitizeData(groupMeta.exit_message, config.defaults.exitMessage),
      sanitizeData(groupMeta.exit_media, config.defaults.exitMedia),
    ];

    const query = `
      INSERT INTO \`${config.database.tables.groups}\` (
        id, name, owner, created_at, description, description_id, subject_owner, subject_time, size,
        \`restrict\`, announce, is_community, is_community_announce, join_approval_mode, member_add_mode, isPremium, premiumTemp,
        is_welcome, welcome_message, welcome_media,
        exit_message, exit_media
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name), owner = VALUES(owner), created_at = VALUES(created_at), description = VALUES(description),
        description_id = VALUES(description_id), subject_owner = VALUES(subject_owner), subject_time = VALUES(subject_time),
        size = VALUES(size), \`restrict\` = VALUES(\`restrict\`), announce = VALUES(announce), is_community = VALUES(is_community),
        is_community_announce = VALUES(is_community_announce), join_approval_mode = VALUES(join_approval_mode),
        member_add_mode = VALUES(member_add_mode), isPremium = VALUES(isPremium), premiumTemp = VALUES(premiumTemp),
        is_welcome = VALUES(is_welcome),
        welcome_message = VALUES(welcome_message),
        welcome_media = VALUES(welcome_media),
        exit_message = VALUES(exit_message),
        exit_media = VALUES(exit_media);
    `;

    await runQuery(query, values);
  } catch (error) {
    logger.error(`[ saveGroupToDatabase ] ❌ Erro ao salvar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

async function saveGroupParticipantsToDatabase(groupId, participants) {
  if (!Array.isArray(participants) || participants.length === 0) return;
  const values = participants.map(p => [groupId, p.id, p.admin === "admin" || p.admin === "superadmin" ? 1 : 0]);
  if (values.length === 0) return;
  const placeholders = values.map(() => "(?, ?, ?)").join(", ");
  const bulkQuery = `INSERT IGNORE INTO ${config.database.tables.participants} (group_id, participant, isAdmin) VALUES ${placeholders};`;
  const flatValues = values.flat();
  try {
    await runQuery(bulkQuery, flatValues);
  } catch (error) {
    logger.warn(`[ saveGroupParticipantsToDatabase ] Inserção em massa falhou para ${groupId}, tentando individualmente: ${error.message}`);
    const individualQuery = `INSERT IGNORE INTO ${config.database.tables.participants} (group_id, participant, isAdmin) VALUES (?, ?, ?);`;
    let successCount = 0,
      failCount = 0;
    for (const participantData of values) {
      try {
        await runQuery(individualQuery, participantData);
        successCount++;
      } catch (individualError) {
        failCount++;
        logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Erro ao salvar participante ${participantData[1]} para ${groupId}: ${individualError.message}`);
      }
    }
    if (failCount > 0 && successCount === 0) logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Falha crítica: Todas inserções falharam para ${groupId}.`);
  }
}

/**
 * Garante que um grupo exista na tabela 'groups'. Se não, insere uma entrada mínima.
 * @param {string} groupId - O JID do grupo.
 * @returns {Promise<string>} O groupId.
 * @throws {Error} Se a verificação ou inserção do grupo falhar.
 */
async function ensureGroupExists(groupId) {
  try {
    const checkQuery = `SELECT id FROM \`${config.database.tables.groups}\` WHERE id = ? LIMIT 1;`;
    const results = await runQuery(checkQuery, [groupId]);

    if (results.length === 0) {
      logger.warn(`[ ensureGroupExists ] Grupo ${groupId} não encontrado. Criando entrada mínima.`);
      const insertQuery = `
        INSERT IGNORE INTO \`${config.database.tables.groups}\`
          (id, name, owner, created_at, is_welcome, welcome_message, welcome_media, exit_message, exit_media)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      await runQuery(insertQuery, [groupId, config.defaults.groupSubject, config.defaults.groupOwner, moment().format("YYYY-MM-DD HH:mm:ss"), config.defaults.isWelcome, DEFAULT_WELCOME_MESSAGE, config.defaults.welcomeMedia, config.defaults.exitMessage, config.defaults.exitMedia]);
      logger.info(`[ ensureGroupExists ] ✅ Entrada mínima criada para o grupo ${groupId}.`);
    }
    return groupId;
  } catch (error) {
    logger.error(`[ ensureGroupExists ] ❌ Erro ao verificar/criar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

async function saveMessageToDatabase(messageData) {
  const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;
  if (!messageId || !userId || !messageType || !timestamp) {
    logger.error("[ saveMessageToDatabase ] ❌ Dados da mensagem incompletos.", messageData);
    throw new Error("Dados da mensagem incompletos para salvar.");
  }
  const query = `
    INSERT INTO ${config.database.tables.messages} (message_id, sender_id, group_id, messageType, messageContent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE messageType = VALUES(messageType), messageContent = VALUES(messageContent);
  `;
  try {
    await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      if (error.message.includes("fk_sender_id")) logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Usuário ${userId} não encontrado. Msg ${messageId} não salva.`);
      else if (error.message.includes("fk_group_id")) logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Grupo ${groupId} não encontrado. Msg ${messageId} não salva.`);
      else logger.error(`[ saveMessageToDatabase ] ❌ Erro FK desconhecido msg ${messageId}: ${error.message}`, { stack: error.stack });
    } else logger.error(`[ saveMessageToDatabase ] ❌ Erro ao salvar msg ${messageId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

async function processIncomingMessageData(info) {
  let validatedData;
  try {
    validatedData = validateIncomingInfo(info);
  } catch (validationError) {
    if (validationError.message !== "Dados inválidos ou mensagem própria.") logger.warn(`[ processIncomingMessageData ] ⚠️ Validação falhou: ${validationError.message}`, { key: info?.key });
    throw validationError;
  }

  const { from, userId, isGroup, messageId } = validatedData;
  const pushName = info.pushName;

  try {
    await saveUserToDatabase(userId, pushName);
  } catch (userSaveError) {
    logger.error(`[ processIncomingMessageData ] ❌ Falha ao salvar usuário ${userId}: ${userSaveError.message}`);
  }

  let groupId = null;
  if (isGroup) {
    try {
      groupId = await ensureGroupExists(from);
    } catch (groupEnsureError) {
      logger.error(`[ processIncomingMessageData ] ❌ Falha crítica ao garantir grupo ${from}: ${groupEnsureError.message}`);
      throw groupEnsureError;
    }
  }

  try {
    const messageType = Object.keys(info.message || {})[0] || "unknown";
    let messageContent = null;
    if (info.message && info.message[messageType]) {
      try {
        const contentString = JSON.stringify(info.message[messageType]);
        const MAX_CONTENT_LENGTH = 16 * 1024 * 1024; // MEDIUMTEXT limit
        if (Buffer.byteLength(contentString, "utf8") > MAX_CONTENT_LENGTH * 0.9) {
          logger.warn(`[ processIncomingMessageData ] ⚠️ Conteúdo msg ${messageType} (ID: ${messageId}) muito longo. Salvando placeholder.`);
          messageContent = `{"error": "Conteúdo muito longo para salvar."}`;
        } else messageContent = contentString;
      } catch (stringifyError) {
        logger.warn(`[ processIncomingMessageData ] ⚠️ Falha ao stringificar msg ${messageType} (ID: ${messageId}): ${stringifyError.message}`);
        messageContent = `{"error": "Falha ao stringificar: ${stringifyError.message}"}`;
      }
    }
    const timestamp = moment().tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");
    await saveMessageToDatabase({
      messageId,
      userId,
      groupId,
      messageType,
      messageContent,
      timestamp,
    });
    return { userId, groupId, messageId };
  } catch (messageSaveError) {
    logger.error(`[ processIncomingMessageData ] ❌ Erro final ao salvar msg ${messageId}: ${messageSaveError.message}`);
    throw messageSaveError;
  }
}

async function handleGroupMetadataUpdate(groupId, client) {
  if (!client || typeof client.groupMetadata !== "function") {
    logger.error(`[ handleGroupMetadataUpdate ] ❌ Cliente inválido para ${groupId}.`);
    return;
  }
  const cachedData = groupMetadataCache.get(groupId);
  if (cachedData) return;

  logger.info(`[ handleGroupMetadataUpdate ] 🔄 Buscando metadados para ${groupId}`);
  try {
    const groupMeta = await client.groupMetadata(groupId);
    if (!groupMeta || !groupMeta.id) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Metadados inválidos para ${groupId}. Removendo do cache.`);
      groupMetadataCache.delete(groupId);
      return;
    }
    groupMetadataCache.set(groupId, groupMeta);
    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados de ${groupId} cacheados.`);
    await saveGroupToDatabase(groupMeta);
    if (Array.isArray(groupMeta.participants)) await saveGroupParticipantsToDatabase(groupId, groupMeta.participants);
    else logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ ${groupId} sem array de participantes válido.`);
    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados e participantes de ${groupId} salvos.`);
  } catch (fetchSaveError) {
    if (fetchSaveError.message?.includes("group not found") || fetchSaveError.output?.statusCode === 404) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Grupo ${groupId} não encontrado (bot saiu?). Removendo do cache.`);
      groupMetadataCache.delete(groupId);
    } else logger.error(`[ handleGroupMetadataUpdate ] ❌ Erro ao buscar/salvar metadados de ${groupId}: ${fetchSaveError.message}`, { stack: fetchSaveError.stack });
  }
}

async function processUserData(data, client) {
  if (!data?.messages || !Array.isArray(data.messages) || data.messages.length === 0) return;
  for (const info of data.messages) {
    let messageId = info?.key?.id || "N/A";
    try {
      const { groupId } = await processIncomingMessageData(info);
      messageId = info.key?.id || messageId;
      if (groupId) await handleGroupMetadataUpdate(groupId, client);
    } catch (error) {
      if (error.message !== "Dados inválidos ou mensagem própria.") logger.error(`[ processUserData ] ❌ Erro ao processar msg ${messageId}: ${error.message}`, { stack: error.stack, messageKey: info?.key });
    }
  }
}

module.exports = {
  createTables,
  processUserData,
  groupMetadataCache,
};
