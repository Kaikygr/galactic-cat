/**
 * @fileoverview Controller for managing user and group data persistence in the database.
 * Handles saving/updating user info, group metadata, participants, and messages.
 * Includes logic for ensuring data integrity (e.g., foreign keys), caching group metadata,
 * and tracking user interactions (first/last timestamps and history).
 */

// --- Dependencies ---
const { runQuery } = require("../database/processDatabase");
const logger = require("../utils/logger");
const moment = require("moment-timezone"); // Use moment-timezone for consistent time handling
const crypto = require("crypto");

// --- Configuration (Assuming this structure, ensure interactionHistory is defined) ---
// It's better to import this from options.json if possible: const config = require('../config/options.json');
const config = {
  database: {
    tables: {
      groups: "groups",
      users: "users",
      messages: "messages",
      participants: "group_participants",
      commandUsage: "command_usage",
      analytics: "command_analytics",
      interactionHistory: "interaction_history", // Ensure this table name is in your options.json
    },
  },
  defaults: {
    pushName: "Desconhecido",
    groupSubject: "Grupo Desconhecido",
    groupOwner: null,
    groupDesc: null,
    descId: null,
    subjectOwner: null,
    isWelcome: 0,
    welcomeMessage: "Bem-vindo(a) ao {groupName}, {user}! 🎉", // Default welcome
    welcomeMedia: null,
    exitMessage: "Até mais, {user}! Sentiremos sua falta. 👋", // Default exit
    exitMedia: null,
  },
  cache: {
    groupMetadataExpiryMs: 5 * 60 * 1000, // 5 minutes cache expiry
  },
};

// --- Constants ---
const DEFAULT_WELCOME_MESSAGE = config.defaults.welcomeMessage;
const DEFAULT_EXIT_MESSAGE = config.defaults.exitMessage;

// --- Cache ---
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
      logger.debug(`[ GroupMetadataCache ] ⏳ Cache expirado para ${key}. Removendo.`);
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

// --- Utility Functions ---
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
  if (!info?.key || info.key.fromMe) {
    throw new Error("Dados inválidos ou mensagem própria.");
  }
  const from = info.key.remoteJid;
  if (!from || (!from.endsWith("@g.us") && !from.endsWith("@s.whatsapp.net"))) {
    throw new Error(`RemoteJid inválido: ${from}`);
  }
  const isGroup = from.endsWith("@g.us");
  const userId = isGroup ? sanitizeData(info.key.participant) : from;
  if (!userId) {
    throw new Error("ID do remetente não determinado.");
  }
  const messageId = info.key.id || crypto.randomUUID();
  if (!info.key.id) {
    logger.warn(`[validateIncomingInfo] Mensagem sem ID original (from: ${from}, sender: ${userId}). Gerado UUID: ${messageId}`);
  }
  return { from, userId, isGroup, messageId };
};

// --- Database Schema Management ---

/**
 * Creates or verifies necessary database tables including interaction tracking.
 */
async function createTables() {
  logger.info("[ createTables ] 📦 Verificando e criando tabelas...");
  // Correctly destructure all needed table names from config
  const { groups, users, messages, participants, commandUsage, analytics, interactionHistory } = config.database.tables;

  // Check if interactionHistory table name is defined
  if (!interactionHistory) {
    logger.error("[ createTables ] ❌ Nome da tabela 'interactionHistory' não definido em config.database.tables!");
    throw new Error("Tabela 'interactionHistory' não configurada.");
  }

  try {
    // Groups Table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${groups}\` (
        id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), owner VARCHAR(255), created_at DATETIME,
        description TEXT, description_id VARCHAR(255), subject_owner VARCHAR(255), subject_time DATETIME,
        size INT, \`restrict\` TINYINT(1) DEFAULT 0, announce TINYINT(1) DEFAULT 0, is_community TINYINT(1) DEFAULT 0,
        is_community_announce TINYINT(1) DEFAULT 0, join_approval_mode TINYINT(1) DEFAULT 0, member_add_mode TINYINT(1) DEFAULT 0,
        isPremium TINYINT(1) DEFAULT 0, premiumTemp DATETIME DEFAULT NULL,
        is_welcome TINYINT(1) DEFAULT ${config.defaults.isWelcome}, welcome_message TEXT, welcome_media TEXT DEFAULT NULL,
        exit_message TEXT, exit_media TEXT DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${groups}' verificada/criada.`);

    // Users Table (with interaction timestamps)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${users}\` (
        sender VARCHAR(255) PRIMARY KEY, pushName VARCHAR(255), isPremium TINYINT(1) DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL, has_interacted TINYINT(1) DEFAULT 0 COMMENT 'Flag set on first eligible interaction',
        first_interaction_at DATETIME NULL DEFAULT NULL COMMENT 'Timestamp of the first eligible interaction',
        last_interaction_at DATETIME NULL DEFAULT NULL COMMENT 'Timestamp of the last interaction of any type'
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${users}' verificada/criada (com colunas de interação).`);

    // Messages Table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${messages}\` (
        message_id VARCHAR(255) NOT NULL, sender_id VARCHAR(255) NOT NULL, group_id VARCHAR(255),
        messageType VARCHAR(255), messageContent MEDIUMTEXT, timestamp DATETIME NOT NULL,
        PRIMARY KEY (sender_id, timestamp, message_id), INDEX idx_message_id (message_id), INDEX idx_group_id (group_id),
        CONSTRAINT fk_sender_id FOREIGN KEY (sender_id) REFERENCES \`${users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_group_id FOREIGN KEY (group_id) REFERENCES \`${groups}\`(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${messages}' verificada/criada.`);

    // Group Participants Table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${participants}\` (
        group_id VARCHAR(255) NOT NULL, participant VARCHAR(255) NOT NULL, isAdmin TINYINT(1) DEFAULT 0,
        PRIMARY KEY (group_id, participant),
        CONSTRAINT fk_group_participants_group FOREIGN KEY (group_id) REFERENCES \`${groups}\`(id) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_participant (participant)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${participants}' verificada/criada.`);

    // Command Usage Table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${commandUsage}\` (
        user_id VARCHAR(255) NOT NULL, command_name VARCHAR(50) NOT NULL, usage_count_window INT DEFAULT 0,
        window_start_timestamp DATETIME NULL, last_used_timestamp DATETIME NULL,
        PRIMARY KEY (user_id, command_name),
        CONSTRAINT fk_user_usage FOREIGN KEY (user_id) REFERENCES \`${users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${commandUsage}' verificada/criada.`);

    // Command Analytics Table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${analytics}\` (
        \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY, \`user_id\` VARCHAR(255) NOT NULL, \`command_name\` VARCHAR(50) NOT NULL,
        \`group_id\` VARCHAR(255) NULL, \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`is_premium_at_execution\` TINYINT(1) NOT NULL, \`execution_status\` ENUM('allowed', 'rate_limited', 'disabled', 'error') NOT NULL,
        \`rate_limit_count_before\` INT NULL, \`rate_limit_limit_at_execution\` INT NULL,
        INDEX \`idx_analytics_user_id\` (\`user_id\`), INDEX \`idx_analytics_command_name\` (\`command_name\`),
        INDEX \`idx_analytics_group_id\` (\`group_id\`), INDEX \`idx_analytics_timestamp\` (\`timestamp\`),
        INDEX \`idx_analytics_is_premium\` (\`is_premium_at_execution\`), INDEX \`idx_analytics_status\` (\`execution_status\`),
        CONSTRAINT \`fk_analytics_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`${users}\`(\`sender\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_analytics_group_id\` FOREIGN KEY (\`group_id\`) REFERENCES \`${groups}\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${analytics}' verificada/criada.`);

    // Interaction History Table (Using the destructured variable)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${interactionHistory}\` (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        interaction_type ENUM('private_message', 'private_command', 'group_command', 'group_message') NOT NULL,
        group_id VARCHAR(255) NULL DEFAULT NULL, command_name VARCHAR(50) NULL DEFAULT NULL,
        CONSTRAINT fk_interaction_user FOREIGN KEY (user_id) REFERENCES \`${users}\`(sender) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_interaction_user (user_id), INDEX idx_interaction_timestamp (timestamp), INDEX idx_interaction_group (group_id)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${interactionHistory}' verificada/criada.`);

    logger.info("[ createTables ] ✅ Verificação/criação de todas as tabelas concluída.");
  } catch (error) {
    logger.error(`[ createTables ] ❌ Erro crítico ao criar/verificar tabelas: ${error.message}`, { stack: error.stack });
    throw new Error(`Falha ao inicializar tabelas do banco de dados: ${error.message}`);
  }
}

/**
 * Ensures the interaction-related columns exist in the users table.
 */
async function ensureUserInteractionColumns() {
  logger.info("[ensureUserInteractionColumns] Verificando colunas de interação na tabela users...");
  const columnsToAdd = [
    { name: "first_interaction_at", definition: "DATETIME NULL DEFAULT NULL" },
    { name: "last_interaction_at", definition: "DATETIME NULL DEFAULT NULL" },
    { name: "has_interacted", definition: "TINYINT(1) DEFAULT 0" },
  ];
  const usersTable = config.database.tables.users;
  let allOk = true;

  for (const column of columnsToAdd) {
    try {
      const checkQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?;`;
      const checkResult = await runQuery(checkQuery, [usersTable, column.name]);

      if (checkResult.length === 0) {
        logger.warn(`[ensureUserInteractionColumns] ⚠️ Coluna '${column.name}' não encontrada. Adicionando...`);
        const alterQuery = `ALTER TABLE \`${usersTable}\` ADD COLUMN \`${column.name}\` ${column.definition};`;
        try {
          await runQuery(alterQuery, []);
          logger.info(`[ensureUserInteractionColumns] ✅ Coluna '${column.name}' adicionada.`);
        } catch (alterError) {
          if (alterError.code === "ER_DUP_FIELDNAME") {
            logger.warn(`[ensureUserInteractionColumns] 🔄 Coluna '${column.name}' já existe (detectado durante ALTER).`);
          } else {
            logger.error(`[ensureUserInteractionColumns] ❌ Erro ao adicionar '${column.name}': ${alterError.message}`, { stack: alterError.stack });
            allOk = false;
          }
        }
      } else {
        logger.debug(`[ensureUserInteractionColumns] Coluna '${column.name}' já existe.`);
      }
    } catch (error) {
      logger.error(`[ensureUserInteractionColumns] ❌ Erro ao verificar/adicionar '${column.name}': ${error.message}`, { stack: error.stack });
      allOk = false;
    }
  }

  if (allOk) {
    logger.info("[ensureUserInteractionColumns] Verificação das colunas de interação concluída.");
  } else {
    logger.error("[ensureUserInteractionColumns] Falha ao garantir todas as colunas de interação.");
  }
  return allOk;
}

// --- Interaction Logging ---

/**
 * Logs an interaction event, updating user timestamps and adding to history.
 * Determines if this is the user's first *eligible* interaction.
 * @returns {Promise<boolean>} True if this was the user's first eligible interaction, false otherwise.
 */
async function logInteraction(userId, pushName, isGroup, isCommand, commandName = null, groupId = null) {
  const now = moment().tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");
  const usersTable = config.database.tables.users;
  const historyTable = config.database.tables.interactionHistory; // Use configured table name
  let wasFirstEligibleInteraction = false;

  if (!historyTable) {
    logger.error("[logInteraction] ❌ Nome da tabela 'interactionHistory' não definido em config.database.tables!");
    return false; // Cannot log history
  }

  let interactionType;
  if (isGroup) {
    interactionType = isCommand ? "group_command" : "group_message";
  } else {
    interactionType = isCommand ? "private_command" : "private_message";
  }

  const isEligibleForFirst = !isGroup || (isGroup && isCommand);

  try {
    // Upsert user data
    const upsertQuery = `
      INSERT INTO \`${usersTable}\` (sender, pushName, first_interaction_at, last_interaction_at, has_interacted)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
          last_interaction_at = VALUES(last_interaction_at),
          first_interaction_at = IF(first_interaction_at IS NULL AND ?, VALUES(first_interaction_at), first_interaction_at),
          has_interacted = IF(has_interacted = 0 AND ?, 1, has_interacted),
          pushName = VALUES(pushName);
    `;
    const params = [
      userId,
      sanitizeData(pushName, config.defaults.pushName),
      now,
      now,
      isEligibleForFirst ? 1 : 0, // Value for has_interacted if set
      isEligibleForFirst ? 1 : 0, // Condition for setting first_interaction_at
      isEligibleForFirst ? 1 : 0, // Condition for setting has_interacted
    ];
    await runQuery(upsertQuery, params); // Changed from result = await... as result wasn't reliably used

    // Re-query to confirm if first_interaction_at was just set
    if (isEligibleForFirst) {
      const checkQuery = `SELECT 1 FROM \`${usersTable}\` WHERE sender = ? AND first_interaction_at = ? LIMIT 1`;
      const checkResult = await runQuery(checkQuery, [userId, now]);
      if (checkResult.length > 0) {
        // This confirms 'now' is the value, implying it was likely just set
        wasFirstEligibleInteraction = true;
        logger.info(`[logInteraction] 🎉 Primeira interação elegível registrada para ${userId} às ${now}.`);
      }
    }

    // Insert into interaction history
    const historyQuery = `
      INSERT INTO \`${historyTable}\` (user_id, timestamp, interaction_type, group_id, command_name)
      VALUES (?, ?, ?, ?, ?);
    `;
    await runQuery(historyQuery, [userId, now, interactionType, groupId, commandName]);

    logger.debug(`[logInteraction] Interação registrada para ${userId}. Tipo: ${interactionType}. Foi a primeira elegível: ${wasFirstEligibleInteraction}`);
  } catch (error) {
    logger.error(`[logInteraction] ❌ Erro ao registrar interação para ${userId}: ${error.message}`, { stack: error.stack });
    return false; // Return false on error
  }

  return wasFirstEligibleInteraction;
}

// --- User and Group Data Management ---

/**
 * Saves or updates user's pushName. Less critical if logInteraction handles upsert.
 * Kept for compatibility with existing calls.
 */
async function saveUserToDatabase(userId, pushName) {
  const finalPushName = sanitizeData(pushName, config.defaults.pushName);
  // This function now primarily ensures the user exists and updates pushName.
  // Interaction flags/timestamps are handled by logInteraction.
  const insertQuery = `INSERT IGNORE INTO ${config.database.tables.users} (sender, pushName) VALUES (?, ?);`;
  const updateQuery = `UPDATE ${config.database.tables.users} SET pushName = ? WHERE sender = ?;`;
  try {
    await runQuery(insertQuery, [userId, finalPushName]);
    await runQuery(updateQuery, [finalPushName, userId]);
    // logger.debug(`[ saveUserToDatabase ] ✅ Usuário ${userId} verificado/atualizado (pushName: ${finalPushName}).`);
  } catch (error) {
    logger.error(`[ saveUserToDatabase ] ❌ Erro ao salvar/atualizar usuário ${userId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

/**
 * Saves or updates group metadata in the database.
 */
async function saveGroupToDatabase(groupMeta) {
  const groupId = groupMeta?.id;
  if (!groupId) {
    logger.error("[ saveGroupToDatabase ] ❌ Erro: ID do grupo ausente.", { groupMeta });
    throw new Error("ID do grupo ausente nos metadados para salvar.");
  }
  try {
    const values = [
      groupId,
      sanitizeData(groupMeta.name, config.defaults.groupSubject),
      sanitizeData(groupMeta.owner, config.defaults.groupOwner),
      formatTimestampForDB(groupMeta.creation),
      sanitizeData(groupMeta.description, config.defaults.groupDesc),
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
    await runQuery(query, values);
  } catch (error) {
    logger.error(`[ saveGroupToDatabase ] ❌ Erro ao salvar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

/**
 * Saves group participants to the database.
 */
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
    logger.warn(`[ saveGroupParticipantsToDatabase ] ⚠️ Inserção em massa falhou para ${groupId}, tentando individualmente: ${error.message}`);
    const individualQuery = `INSERT IGNORE INTO ${config.database.tables.participants} (group_id, participant, isAdmin) VALUES (?, ?, ?);`;
    let successCount = 0,
      failCount = 0;
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

/**
 * Fetches custom group settings from the database.
 */
async function getGroupSettingsFromDB(groupId) {
  const query = `
    SELECT isPremium, premiumTemp, is_welcome, welcome_message, welcome_media, exit_message, exit_media
    FROM \`${config.database.tables.groups}\` WHERE id = ? LIMIT 1;
  `;
  try {
    const results = await runQuery(query, [groupId]);
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error(`[getGroupSettingsFromDB] ❌ Erro ao buscar config customizada para ${groupId}: ${error.message}`);
    return null;
  }
}

/**
 * Ensures a group exists in the 'groups' table, inserting a minimal entry if needed.
 */
async function ensureGroupExists(groupId) {
  try {
    const checkQuery = `SELECT id FROM \`${config.database.tables.groups}\` WHERE id = ? LIMIT 1;`;
    const results = await runQuery(checkQuery, [groupId]);
    if (results.length === 0) {
      logger.warn(`[ ensureGroupExists ] Grupo ${groupId} não no DB. Criando entrada mínima.`);
      const insertQuery = `
        INSERT IGNORE INTO \`${config.database.tables.groups}\`
          (id, name, owner, created_at, is_welcome, welcome_message, welcome_media, exit_message, exit_media)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      await runQuery(insertQuery, [groupId, config.defaults.groupSubject, config.defaults.groupOwner, moment().format("YYYY-MM-DD HH:mm:ss"), config.defaults.isWelcome, config.defaults.welcomeMessage, config.defaults.welcomeMedia, config.defaults.exitMessage, config.defaults.exitMedia]);
      logger.info(`[ ensureGroupExists ] ✅ Entrada mínima criada para ${groupId}.`);
    }
    return groupId;
  } catch (error) {
    logger.error(`[ ensureGroupExists ] ❌ Erro crítico ao verificar/criar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

/**
 * Saves message details to the database.
 */
async function saveMessageToDatabase(messageData) {
  const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;
  if (!messageId || !userId || !messageType || !timestamp) {
    logger.error("[ saveMessageToDatabase ] ❌ Dados da mensagem incompletos.", messageData);
    throw new Error("Dados da mensagem incompletos para salvar.");
  }
  const query = `
    INSERT INTO ${config.database.tables.messages} (message_id, sender_id, group_id, messageType, messageContent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE messageType = VALUES(messageType), messageContent = VALUES(messageContent);
  `;
  try {
    await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW" || error.code === "ER_NO_REFERENCED_ROW_2") {
      if (error.message.includes("fk_sender_id")) logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Usuário ${userId} não encontrado. Msg ${messageId} não salva.`);
      else if (error.message.includes("fk_group_id")) logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Grupo ${groupId} não encontrado. Msg ${messageId} não salva.`);
      else logger.error(`[ saveMessageToDatabase ] ❌ Erro FK desconhecido ${messageId}: ${error.message}`, { stack: error.stack });
    } else {
      logger.error(`[ saveMessageToDatabase ] ❌ Erro ao salvar msg ${messageId}: ${error.message}`, { stack: error.stack });
    }
    throw error;
  }
}

// --- Message Processing Flow ---

/**
 * Processes incoming message data: validates, saves user, ensures group, saves message.
 */
async function processIncomingMessageData(info) {
  let validatedData;
  try {
    validatedData = validateIncomingInfo(info);
  } catch (validationError) {
    if (validationError.message !== "Dados inválidos ou mensagem própria.") {
      logger.warn(`[ processIncomingMessageData ] ⚠️ Validação falhou: ${validationError.message}`, { key: info?.key });
    }
    throw validationError;
  }

  const { from, userId, isGroup, messageId } = validatedData;
  const pushName = info.pushName;

  try {
    // Ensure user exists and pushName is updated (using the existing function)
    await saveUserToDatabase(userId, pushName);
  } catch (userSaveError) {
    // Log error but continue if possible (logInteraction might still work if user exists)
    logger.error(`[ processIncomingMessageData ] ⚠️ Falha ao salvar/garantir usuário ${userId}: ${userSaveError.message}`);
    // Depending on severity, you might want to throw here if user saving is critical before message saving
  }

  let groupId = null;
  if (isGroup) {
    try {
      groupId = await ensureGroupExists(from);
    } catch (groupEnsureError) {
      logger.error(`[ processIncomingMessageData ] ❌ Falha crítica ao garantir grupo ${from}. Msg ${messageId} não será salva. Erro: ${groupEnsureError.message}`);
      throw groupEnsureError;
    }
  }

  try {
    const messageType = Object.keys(info.message || {})[0] || "unknown";
    let messageContent = null;
    if (info.message && info.message[messageType]) {
      try {
        messageContent = JSON.stringify(info.message[messageType]);
        // Add length check if needed
      } catch (stringifyError) {
        logger.warn(`[ processIncomingMessageData ] ⚠️ Falha ao stringificar conteúdo ${messageType} (ID: ${messageId}): ${stringifyError.message}`);
        messageContent = JSON.stringify({ error: `Falha ao stringificar: ${stringifyError.message}` });
      }
    }
    const timestamp = moment().tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");
    await saveMessageToDatabase({ messageId, userId, groupId, messageType, messageContent, timestamp });
    return { userId, groupId, messageId }; // Return identifiers
  } catch (messageSaveError) {
    logger.error(`[ processIncomingMessageData ] ❌ Erro final ao salvar msg ${messageId}.`);
    throw messageSaveError;
  }
}

/**
 * Handles updates to group metadata, merging with DB settings.
 */
async function handleGroupMetadataUpdate(groupId, client) {
  if (!client || typeof client.groupMetadata !== "function") {
    logger.error(`[ handleGroupMetadataUpdate ] ❌ Cliente inválido para buscar metadados de ${groupId}.`);
    return;
  }
  const cachedData = groupMetadataCache.get(groupId);
  if (cachedData) return; // Use cache

  logger.info(`[ handleGroupMetadataUpdate ] 🔄 Buscando metadados E config DB para ${groupId}`);
  try {
    const fetchedMeta = await client.groupMetadata(groupId);
    if (!fetchedMeta || !fetchedMeta.id) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Metadados inválidos via cliente para ${groupId}.`);
      groupMetadataCache.delete(groupId);
      return;
    }
    const existingDbSettings = await getGroupSettingsFromDB(groupId);

    const mergedMeta = {
      ...fetchedMeta,
      id: groupId,
      name: sanitizeData(fetchedMeta.subject, config.defaults.groupSubject),
      owner: sanitizeData(fetchedMeta.owner, config.defaults.groupOwner),
      creation: fetchedMeta.creation,
      description: sanitizeData(fetchedMeta.desc, config.defaults.groupDesc),
      descId: sanitizeData(fetchedMeta.descId, config.defaults.descId),
      subjectOwner: sanitizeData(fetchedMeta.subjectOwner, config.defaults.subjectOwner),
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
      is_welcome: existingDbSettings?.is_welcome ?? config.defaults.isWelcome,
      welcome_message: existingDbSettings?.welcome_message ?? config.defaults.welcomeMessage,
      welcome_media: existingDbSettings?.welcome_media ?? config.defaults.welcomeMedia,
      exit_message: existingDbSettings?.exit_message ?? config.defaults.exitMessage,
      exit_media: existingDbSettings?.exit_media ?? config.defaults.exitMedia,
    };
    const participantsToSave = fetchedMeta.participants;
    delete mergedMeta.participants;

    groupMetadataCache.set(groupId, fetchedMeta); // Cache raw fetched data
    await saveGroupToDatabase(mergedMeta); // Save merged data
    if (Array.isArray(participantsToSave)) {
      await saveGroupParticipantsToDatabase(groupId, participantsToSave);
    }
    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados (mesclados) e participantes de ${groupId} salvos.`);
  } catch (fetchSaveError) {
    if (fetchSaveError.message?.includes("group not found") || fetchSaveError.output?.statusCode === 404) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Grupo ${groupId} não encontrado pelo cliente.`);
      groupMetadataCache.delete(groupId);
    } else {
      logger.error(`[ handleGroupMetadataUpdate ] ❌ Erro ao processar metadados de ${groupId}: ${fetchSaveError.message}`, { stack: fetchSaveError.stack });
    }
  }
}

/**
 * Main function to process user data from incoming message events.
 */
async function processUserData(data, client) {
  if (!data?.messages || !Array.isArray(data.messages) || data.messages.length === 0) return;

  for (const info of data.messages) {
    let messageId = info?.key?.id || "ID_DESCONHECIDO";
    try {
      // Process message: validate, save user, ensure group, save message
      const { groupId } = await processIncomingMessageData(info); // Ensure this returns groupId
      messageId = info.key?.id || messageId;

      // Trigger metadata update for groups (runs in background)
      if (groupId) {
        handleGroupMetadataUpdate(groupId, client);
      }
    } catch (error) {
      if (error.message !== "Dados inválidos ou mensagem própria.") {
        logger.error(`[ processUserData ] ❌ Erro ao processar msg ${messageId}: ${error.message}`, { stack: error.stack, messageKey: info?.key });
      }
    }
  }
}

// --- Exports ---
module.exports = {
  createTables,
  ensureUserInteractionColumns, // Export schema checker
  logInteraction, // Export interaction logger
  // ensureUserExists,          // Export if needed, otherwise keep internal
  processUserData, // Main entry point for message processing
  groupMetadataCache, // Export cache instance
  handleGroupMetadataUpdate, // Export if needed externally
  saveGroupToDatabase, // Export if needed externally
  saveGroupParticipantsToDatabase, // Export if needed externally
  ensureGroupExists, // Export if needed externally
  getGroupSettingsFromDB, // Export for commands needing group settings
  saveUserToDatabase, // Keep exporting if other parts rely on it
};
