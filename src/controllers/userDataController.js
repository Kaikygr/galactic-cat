/**
 * @fileoverview Controller for managing user and group data persistence in the database.
 * Handles saving/updating user info, group metadata, participants, and messages.
 * Includes logic for ensuring data integrity (e.g., foreign keys) and caching group metadata.
 * Crucially, implements a merge strategy when updating group metadata to preserve custom settings
 * (like welcome/exit messages) stored in the database.
 */

const { runQuery } = require("../database/processDatabase");
const logger = require("../utils/logger");
const moment = require("moment-timezone");
const crypto = require("crypto");

// Default messages (can be overridden by DB values)
const DEFAULT_WELCOME_MESSAGE = "Bem-vindo(a) ao {groupName}, {user}! 🎉";
const DEFAULT_EXIT_MESSAGE = "Até mais, {user}! Sentiremos sua falta. 👋";

// Configuration object (replace with actual import if needed)
const config = {
  database: {
    tables: {
      groups: "groups",
      users: "users",
      messages: "messages",
      participants: "group_participants",
      commandUsage: "command_usage",
      analytics: "command_analytics", // Added analytics table
    },
  },
  defaults: {
    pushName: "Desconhecido",
    groupSubject: "Grupo Desconhecido",
    groupOwner: null, // Default owner JID
    groupDesc: null, // Default description
    descId: null, // Default description ID
    subjectOwner: null, // Default subject owner JID
    isWelcome: 0, // Default: welcome messages disabled
    welcomeMessage: DEFAULT_WELCOME_MESSAGE,
    welcomeMedia: null, // Default: no welcome media URL
    exitMessage: DEFAULT_EXIT_MESSAGE,
    exitMedia: null, // Default: no exit media URL
    // Add other defaults as needed
  },
  cache: {
    groupMetadataExpiryMs: 5 * 60 * 1000, // 5 minutes cache expiry
  },
};

/**
 * Simple in-memory cache with time-based expiration for group metadata.
 */
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

/**
 * Sanitizes data by returning a default value if the input is null or undefined.
 * @param {*} value - The value to sanitize.
 * @param {*} [defaultValue=null] - The default value to return.
 * @returns {*} The original value or the default value.
 */
const sanitizeData = (value, defaultValue = null) => (value == null ? defaultValue : value);

/**
 * Formats a timestamp (number, Date object, or string) into a MySQL DATETIME format.
 * @param {number|Date|string|null|undefined} timestamp - The timestamp to format.
 * @returns {string|null} The formatted timestamp string or null if invalid.
 */
const formatTimestampForDB = timestamp => {
  if (timestamp == null) return null;
  let m = null;
  // Handle Unix timestamps (seconds)
  if (typeof timestamp === "number" && timestamp > 0) m = moment.unix(timestamp);
  // Handle Date objects
  else if (timestamp instanceof Date) m = moment(timestamp);
  // Handle string timestamps (attempt to parse)
  else m = moment(timestamp);
  // Return formatted string if valid, otherwise null
  return m.isValid() ? m.format("YYYY-MM-DD HH:mm:ss") : null;
};

/**
 * Validates incoming message info object to extract key identifiers.
 * @param {object} info - The Baileys message info object.
 * @returns {object} Contains from, userId, isGroup, messageId.
 * @throws {Error} If data is invalid, from self, JID is invalid, or sender cannot be determined.
 */
const validateIncomingInfo = info => {
  // Basic checks for essential properties and ignore self messages
  if (!info?.key || info.key.fromMe) {
    throw new Error("Dados inválidos ou mensagem própria.");
  }

  const from = info.key.remoteJid;
  // Validate JID format
  if (!from || (!from.endsWith("@g.us") && !from.endsWith("@s.whatsapp.net"))) {
    throw new Error(`RemoteJid inválido: ${from}`);
  }

  const isGroup = from.endsWith("@g.us");
  // Determine sender ID based on whether it's a group or private chat
  const userId = isGroup ? sanitizeData(info.key.participant) : from;
  if (!userId) {
    throw new Error("ID do remetente não determinado.");
  }

  // Generate a UUID if the original message ID is missing (should be rare)
  const messageId = info.key.id || crypto.randomUUID();
  if (!info.key.id) {
    logger.warn(`[validateIncomingInfo] Mensagem sem ID original (from: ${from}, sender: ${userId}). Gerado UUID: ${messageId}`);
  }

  return { from, userId, isGroup, messageId };
};

/**
 * Creates necessary database tables if they don't exist.
 * Includes tables for groups, users, messages, participants, command usage, and command analytics.
 * @throws {Error} If table creation fails critically.
 */
async function createTables() {
  logger.info("[ createTables ] 📦 Verificando e criando tabelas...");
  const { groups, users, messages, participants, commandUsage, analytics } = config.database.tables;

  try {
    // Groups Table
    // --- FIX: Removed DEFAULT clauses from TEXT columns ---
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
        is_welcome TINYINT(1) DEFAULT ${config.defaults.isWelcome},
        welcome_message TEXT,                      -- REMOVED DEFAULT '...'
        welcome_media TEXT DEFAULT NULL,           -- DEFAULT NULL is OK
        exit_message TEXT,                         -- REMOVED DEFAULT '...'
        exit_media TEXT DEFAULT NULL               -- DEFAULT NULL is OK
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    // --- END FIX ---
    logger.info(`[ createTables ] ✅ Tabela '${groups}' verificada/criada.`);

    // Users Table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${users}\` (
        sender VARCHAR(255) PRIMARY KEY,
        pushName VARCHAR(255),
        isPremium TINYINT(1) DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info(`[ createTables ] ✅ Tabela '${users}' verificada/criada.`);

    // Messages Table
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

    // Group Participants Table
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

    // Command Usage Table (for rate limiting)
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
    logger.info(`[ createTables ] ✅ Tabela '${commandUsage}' verificada/criada.`);

    // Command Analytics Table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`${analytics}\` (
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
    logger.info(`[ createTables ] ✅ Tabela '${analytics}' verificada/criada.`);

    logger.info("[ createTables ] ✅ Verificação/criação de todas as tabelas concluída.");
  } catch (error) {
    logger.error(`[ createTables ] ❌ Erro crítico ao criar/verificar tabelas: ${error.message}`, {
      stack: error.stack,
    });
    throw new Error(`Falha ao inicializar tabelas do banco de dados: ${error.message}`);
  }
}

/**
 * Saves or updates a user's information (primarily pushName) in the database.
 * @param {string} userId - The user's JID.
 * @param {string} pushName - The user's push name.
 * @throws {Error} If the database query fails.
 */
async function saveUserToDatabase(userId, pushName) {
  const finalPushName = sanitizeData(pushName, config.defaults.pushName);
  const query = `
    INSERT INTO ${config.database.tables.users} (sender, pushName)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE pushName = VALUES(pushName);
  `;
  try {
    await runQuery(query, [userId, finalPushName]);
    // logger.debug(`[ saveUserToDatabase ] ✅ Usuário ${userId} salvo/atualizado.`);
  } catch (error) {
    logger.error(`[ saveUserToDatabase ] ❌ Erro ao salvar usuário ${userId}: ${error.message}`, {
      stack: error.stack,
    });
    throw error; // Re-throw to allow higher-level handling
  }
}

/**
 * Saves or updates group metadata in the database using INSERT ... ON DUPLICATE KEY UPDATE.
 * Ensures all relevant fields, including custom welcome/exit settings, are included.
 * Uses sanitizeData to provide defaults for welcome/exit messages if not present in groupMeta.
 * @param {object} groupMeta - The merged group metadata object containing both standard and custom fields.
 * @throws {Error} If the group ID is missing or the database query fails.
 */
async function saveGroupToDatabase(groupMeta) {
  const groupId = groupMeta?.id;
  if (!groupId) {
    logger.error("[ saveGroupToDatabase ] ❌ Erro: ID do grupo ausente nos metadados para salvar.", { groupMeta });
    throw new Error("ID do grupo ausente nos metadados fornecidos para salvar.");
  }

  try {
    // Prepare values array matching the order of columns in the INSERT statement
    const values = [
      groupId,
      sanitizeData(groupMeta.name, config.defaults.groupSubject), // Use 'name' from mergedMeta if available, else default
      sanitizeData(groupMeta.owner, config.defaults.groupOwner),
      formatTimestampForDB(groupMeta.creation),
      sanitizeData(groupMeta.description, config.defaults.groupDesc), // Use 'description' from mergedMeta
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
      // Custom fields (should be present in mergedMeta from handleGroupMetadataUpdate)
      groupMeta.isPremium ? 1 : 0,
      formatTimestampForDB(groupMeta.premiumTemp),
      sanitizeData(groupMeta.is_welcome, config.defaults.isWelcome),
      // Use sanitizeData to provide default messages if they are null/undefined in groupMeta
      sanitizeData(groupMeta.welcome_message, config.defaults.welcomeMessage),
      sanitizeData(groupMeta.welcome_media, config.defaults.welcomeMedia),
      sanitizeData(groupMeta.exit_message, config.defaults.exitMessage),
      sanitizeData(groupMeta.exit_media, config.defaults.exitMedia),
    ];

    // SQL query using INSERT ... ON DUPLICATE KEY UPDATE
    const query = `
      INSERT INTO \`${config.database.tables.groups}\` (
        id, name, owner, created_at, description, description_id, subject_owner, subject_time, size,
        \`restrict\`, announce, is_community, is_community_announce, join_approval_mode, member_add_mode,
        isPremium, premiumTemp,
        is_welcome, welcome_message, welcome_media, exit_message, exit_media
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name), owner = VALUES(owner), created_at = VALUES(created_at), description = VALUES(description),
        description_id = VALUES(description_id), subject_owner = VALUES(subject_owner), subject_time = VALUES(subject_time),
        size = VALUES(size), \`restrict\` = VALUES(\`restrict\`), announce = VALUES(announce), is_community = VALUES(is_community),
        is_community_announce = VALUES(is_community_announce), join_approval_mode = VALUES(join_approval_mode),
        member_add_mode = VALUES(member_add_mode),
        isPremium = VALUES(isPremium), premiumTemp = VALUES(premiumTemp),
        is_welcome = VALUES(is_welcome), welcome_message = VALUES(welcome_message), welcome_media = VALUES(welcome_media),
        exit_message = VALUES(exit_message), exit_media = VALUES(exit_media);
    `;

    await runQuery(query, values);
    // logger.debug(`[ saveGroupToDatabase ] ✅ Metadados do grupo ${groupId} salvos/atualizados.`);
  } catch (error) {
    logger.error(`[ saveGroupToDatabase ] ❌ Erro ao salvar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error; // Re-throw for higher-level handling
  }
}

/**
 * Saves group participants to the database, ignoring duplicates.
 * Attempts bulk insert first, falls back to individual inserts on failure.
 * @param {string} groupId - The JID of the group.
 * @param {Array<object>} participants - Array of participant objects from Baileys metadata.
 */
async function saveGroupParticipantsToDatabase(groupId, participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    // logger.debug(`[ saveGroupParticipantsToDatabase ] Sem participantes para salvar para ${groupId}.`);
    return;
  }

  // Prepare data for bulk insert: [groupId, participantId, isAdmin (0 or 1)]
  const values = participants.map(p => [groupId, p.id, p.admin === "admin" || p.admin === "superadmin" ? 1 : 0]);

  if (values.length === 0) return; // Should not happen if participants array is not empty, but safe check

  const placeholders = values.map(() => "(?, ?, ?)").join(", ");
  const bulkQuery = `INSERT IGNORE INTO ${config.database.tables.participants} (group_id, participant, isAdmin) VALUES ${placeholders};`;
  const flatValues = values.flat(); // Flatten the array for query parameters

  try {
    const result = await runQuery(bulkQuery, flatValues);
    // logger.debug(`[ saveGroupParticipantsToDatabase ] ✅ Participantes de ${groupId} salvos (Bulk Insert: ${result.affectedRows} afetadas).`);
  } catch (error) {
    // Fallback to individual inserts if bulk insert fails (e.g., due to packet size limits or specific errors)
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
        logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Erro ao salvar participante individual ${participantData[1]} para ${groupId}: ${individualError.message}`);
      }
    }
    logger.warn(`[ saveGroupParticipantsToDatabase ] ⚠️ Fallback concluído para ${groupId}: ${successCount} sucessos, ${failCount} falhas.`);
    if (failCount > 0 && successCount === 0) {
      logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Falha crítica: Todas as inserções individuais falharam para ${groupId}.`);
    }
  }
}

/**
 * Fetches specific custom group settings from the database.
 * Used to preserve settings during metadata updates.
 * @param {string} groupId - The JID of the group.
 * @returns {Promise<object|null>} An object with custom settings or null if not found/error.
 */
async function getGroupSettingsFromDB(groupId) {
  const query = `
    SELECT
      isPremium, premiumTemp, is_welcome, welcome_message, welcome_media, exit_message, exit_media
    FROM \`${config.database.tables.groups}\`
    WHERE id = ?
    LIMIT 1;
  `;
  try {
    const results = await runQuery(query, [groupId]);
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error(`[getGroupSettingsFromDB] ❌ Erro ao buscar configurações customizadas para ${groupId}: ${error.message}`);
    return null; // Return null on error to allow fallback to defaults
  }
}

/**
 * Ensures a group exists in the 'groups' table. If not, inserts a minimal entry with defaults.
 * This prevents foreign key constraint errors when saving messages or participants.
 * Includes default welcome/exit messages during insertion.
 * @param {string} groupId - The JID of the group.
 * @returns {Promise<string>} The groupId.
 * @throws {Error} If the database check or insert fails.
 */
async function ensureGroupExists(groupId) {
  try {
    // Check if the group already exists
    const checkQuery = `SELECT id FROM \`${config.database.tables.groups}\` WHERE id = ? LIMIT 1;`;
    const results = await runQuery(checkQuery, [groupId]);

    // If group doesn't exist, insert a minimal record with defaults
    if (results.length === 0) {
      logger.warn(`[ ensureGroupExists ] Grupo ${groupId} não encontrado no DB. Criando entrada mínima com defaults.`);
      const insertQuery = `
        INSERT IGNORE INTO \`${config.database.tables.groups}\`
          (id, name, owner, created_at, is_welcome, welcome_message, welcome_media, exit_message, exit_media)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      // Use defaults from config for the minimal entry, including messages
      await runQuery(insertQuery, [
        groupId,
        config.defaults.groupSubject,
        config.defaults.groupOwner,
        moment().format("YYYY-MM-DD HH:mm:ss"), // Use current time for created_at if unknown
        config.defaults.isWelcome,
        config.defaults.welcomeMessage, // Provide default welcome message
        config.defaults.welcomeMedia,
        config.defaults.exitMessage, // Provide default exit message
        config.defaults.exitMedia,
      ]);
      logger.info(`[ ensureGroupExists ] ✅ Entrada mínima criada para o grupo ${groupId}.`);
    }
    // Return the groupId whether it existed or was just created
    return groupId;
  } catch (error) {
    logger.error(`[ ensureGroupExists ] ❌ Erro crítico ao verificar/criar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error; // Re-throw critical error
  }
}

/**
 * Saves message details to the database.
 * @param {object} messageData - Object containing message details.
 * @param {string} messageData.messageId - The unique ID of the message.
 * @param {string} messageData.userId - The JID of the sender.
 * @param {string|null} messageData.groupId - The JID of the group (or null for private chat).
 * @param {string} messageData.messageType - The type of the message (e.g., 'conversation', 'imageMessage').
 * @param {string|null} messageData.messageContent - The JSON stringified content of the message.
 * @param {string} messageData.timestamp - The timestamp of the message in DB format.
 * @throws {Error} If required data is missing or the database query fails.
 */
async function saveMessageToDatabase(messageData) {
  const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;

  // Validate required fields
  if (!messageId || !userId || !messageType || !timestamp) {
    logger.error("[ saveMessageToDatabase ] ❌ Dados da mensagem incompletos para salvar.", messageData);
    throw new Error("Dados da mensagem incompletos para salvar.");
  }

  const query = `
    INSERT INTO ${config.database.tables.messages} (message_id, sender_id, group_id, messageType, messageContent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE messageType = VALUES(messageType), messageContent = VALUES(messageContent);
  `;
  try {
    await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
    // logger.debug(`[ saveMessageToDatabase ] ✅ Mensagem ${messageId} salva.`);
  } catch (error) {
    // Handle specific foreign key constraint errors gracefully
    if (error.code === "ER_NO_REFERENCED_ROW" || error.code === "ER_NO_REFERENCED_ROW_2") {
      if (error.message.includes("fk_sender_id")) {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Usuário ${userId} não encontrado. Mensagem ${messageId} não salva.`);
      } else if (error.message.includes("fk_group_id")) {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Grupo ${groupId} não encontrado. Mensagem ${messageId} não salva.`);
      } else {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK desconhecido ao salvar msg ${messageId}: ${error.message}`, { stack: error.stack });
      }
      // Optionally, attempt to re-ensure user/group exists here, but might cause loops.
      // For now, just log the error and prevent saving this message.
    } else {
      // Log other database errors
      logger.error(`[ saveMessageToDatabase ] ❌ Erro ao salvar msg ${messageId}: ${error.message}`, { stack: error.stack });
    }
    throw error; // Re-throw error after logging
  }
}

/**
 * Processes incoming message data: validates, saves user, ensures group exists, saves message.
 * @param {object} info - The Baileys message info object.
 * @returns {Promise<object>} Object containing { userId, groupId, messageId }.
 * @throws {Error} If validation, user saving, group ensuring, or message saving fails critically.
 */
async function processIncomingMessageData(info) {
  let validatedData;
  try {
    // 1. Validate and extract basic info
    validatedData = validateIncomingInfo(info);
  } catch (validationError) {
    // Log only unexpected validation errors
    if (validationError.message !== "Dados inválidos ou mensagem própria.") {
      logger.warn(`[ processIncomingMessageData ] ⚠️ Validação falhou: ${validationError.message}`, { key: info?.key });
    }
    throw validationError; // Stop processing if validation fails
  }

  const { from, userId, isGroup, messageId } = validatedData;
  const pushName = info.pushName; // Get pushName from the original info object

  try {
    // 2. Save/Update User Info
    await saveUserToDatabase(userId, pushName);
  } catch (userSaveError) {
    // Log error but continue processing if possible (message might still be savable if user exists)
    logger.error(`[ processIncomingMessageData ] ⚠️ Falha ao salvar usuário ${userId} (continuando se possível): ${userSaveError.message}`);
  }

  let groupId = null;
  if (isGroup) {
    try {
      // 3. Ensure Group Exists (Crucial for FK constraints)
      groupId = await ensureGroupExists(from);
    } catch (groupEnsureError) {
      // This is critical, message cannot be saved without a valid group reference
      logger.error(`[ processIncomingMessageData ] ❌ Falha crítica ao garantir grupo ${from}. Mensagem ${messageId} não será salva. Erro: ${groupEnsureError.message}`);
      throw groupEnsureError; // Stop processing
    }
  }

  try {
    // 4. Prepare and Save Message Details
    const messageType = Object.keys(info.message || {})[0] || "unknown";
    let messageContent = null;

    // Safely stringify message content, handling potential large sizes
    if (info.message && info.message[messageType]) {
      try {
        const contentString = JSON.stringify(info.message[messageType]);
        const MAX_CONTENT_LENGTH = 16 * 1024 * 1024; // MEDIUMTEXT limit (~16MB)
        // Check byte length for safety, leave some buffer room (e.g., 90%)
        if (Buffer.byteLength(contentString, "utf8") > MAX_CONTENT_LENGTH * 0.9) {
          logger.warn(`[ processIncomingMessageData ] ⚠️ Conteúdo da mensagem ${messageType} (ID: ${messageId}) muito longo. Salvando placeholder.`);
          messageContent = JSON.stringify({ error: "Conteúdo muito longo para salvar no banco de dados." });
        } else {
          messageContent = contentString;
        }
      } catch (stringifyError) {
        logger.warn(`[ processIncomingMessageData ] ⚠️ Falha ao stringificar conteúdo da mensagem ${messageType} (ID: ${messageId}): ${stringifyError.message}`);
        messageContent = JSON.stringify({ error: `Falha ao stringificar conteúdo: ${stringifyError.message}` });
      }
    }

    // Use server's local time (adjust timezone if needed)
    const timestamp = moment().tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");

    await saveMessageToDatabase({
      messageId,
      userId,
      groupId, // Will be null for non-group messages
      messageType,
      messageContent,
      timestamp,
    });

    // Return identifiers for potential further use (like triggering metadata update)
    return { userId, groupId, messageId };
  } catch (messageSaveError) {
    // Error already logged in saveMessageToDatabase
    logger.error(`[ processIncomingMessageData ] ❌ Erro final ao tentar salvar msg ${messageId}.`);
    throw messageSaveError; // Stop processing
  }
}

/**
 * Handles updates to group metadata. Fetches fresh data, merges with existing DB settings
 * to preserve custom configurations, and saves the merged data. Also updates participants.
 * Uses caching to avoid redundant fetches.
 * @param {string} groupId - The JID of the group.
 * @param {object} client - The Baileys client instance.
 */
async function handleGroupMetadataUpdate(groupId, client) {
  // Validate client object
  if (!client || typeof client.groupMetadata !== "function") {
    logger.error(`[ handleGroupMetadataUpdate ] ❌ Cliente Baileys inválido ou ausente para buscar metadados de ${groupId}.`);
    return;
  }

  // Check cache first
  const cachedData = groupMetadataCache.get(groupId);
  if (cachedData) {
    // logger.debug(`[ handleGroupMetadataUpdate ] Cache hit for ${groupId}. Skipping fetch.`);
    // Optional: Consider if even cached data should trigger a DB merge sometimes,
    // e.g., if a command explicitly changed settings. For now, cache hit skips DB interaction.
    return;
  }

  logger.info(`[ handleGroupMetadataUpdate ] 🔄 Cache miss. Buscando metadados E configurações do DB para ${groupId}`);
  try {
    // 1. Fetch fresh metadata from WhatsApp
    const fetchedMeta = await client.groupMetadata(groupId);
    if (!fetchedMeta || !fetchedMeta.id) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Metadados inválidos ou não encontrados via cliente para ${groupId}. Removendo do cache se existir.`);
      groupMetadataCache.delete(groupId);
      // Consider deleting from DB or marking inactive if group truly not found by client
      return;
    }

    // 2. Fetch existing custom settings from Database
    const existingDbSettings = await getGroupSettingsFromDB(groupId);
    if (existingDbSettings) {
      logger.debug(`[ handleGroupMetadataUpdate ] 💾 Configurações customizadas encontradas no DB para ${groupId}.`);
    } else {
      logger.debug(`[ handleGroupMetadataUpdate ] 💾 Nenhuma configuração customizada encontrada no DB para ${groupId} (usará defaults).`);
    }

    // 3. Merge fetched metadata with existing DB settings
    // Prioritize DB settings for custom fields, fetchedMeta for core WA fields.
    const mergedMeta = {
      // Start with all fetched metadata from WhatsApp client
      ...fetchedMeta,

      // --- Overwrite/Preserve specific fields ---

      // Core WA fields from fetchedMeta (use sanitizeData for safety and defaults)
      id: groupId, // Ensure ID is correct
      name: sanitizeData(fetchedMeta.subject, config.defaults.groupSubject), // Use 'name' for consistency with DB schema
      owner: sanitizeData(fetchedMeta.owner, config.defaults.groupOwner),
      creation: fetchedMeta.creation, // Keep original format for formatTimestampForDB
      description: sanitizeData(fetchedMeta.desc, config.defaults.groupDesc), // Use 'description' for consistency
      descId: sanitizeData(fetchedMeta.descId, config.defaults.descId),
      subjectOwner: sanitizeData(fetchedMeta.subjectOwner, config.defaults.subjectOwner),
      subjectTime: fetchedMeta.subjectTime, // Keep original format for formatTimestampForDB
      size: fetchedMeta.size || 0,
      restrict: fetchedMeta.restrict ? 1 : 0,
      announce: fetchedMeta.announce ? 1 : 0,
      isCommunity: fetchedMeta.isCommunity ? 1 : 0,
      isCommunityAnnounce: fetchedMeta.isCommunityAnnounce ? 1 : 0,
      joinApprovalMode: fetchedMeta.joinApprovalMode ? 1 : 0,
      memberAddMode: fetchedMeta.memberAddMode ? 1 : 0, // Assuming this comes from fetchedMeta

      // Custom DB fields: Use DB value if present, otherwise use default from config
      // Use nullish coalescing (??) to prefer existingDbSettings value over default
      isPremium: existingDbSettings?.isPremium ?? 0, // Keep existing premium status from DB
      premiumTemp: existingDbSettings?.premiumTemp ?? null, // Keep existing premium expiry from DB
      is_welcome: existingDbSettings?.is_welcome ?? config.defaults.isWelcome,
      welcome_message: existingDbSettings?.welcome_message ?? config.defaults.welcomeMessage,
      welcome_media: existingDbSettings?.welcome_media ?? config.defaults.welcomeMedia,
      exit_message: existingDbSettings?.exit_message ?? config.defaults.exitMessage,
      exit_media: existingDbSettings?.exit_media ?? config.defaults.exitMedia,
    };

    // Important: Remove participants array before saving to the 'groups' table
    // It should be saved separately to the 'group_participants' table.
    const participantsToSave = fetchedMeta.participants; // Keep a reference
    delete mergedMeta.participants; // Remove from the object going to saveGroupToDatabase

    // Cache the *raw* fetched metadata (as Baileys returned it) for future cache hits
    groupMetadataCache.set(groupId, fetchedMeta);
    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados brutos de ${groupId} cacheados.`);

    // 4. Save the MERGED data to the database
    await saveGroupToDatabase(mergedMeta); // This now saves the combined data

    // 5. Save participants separately (using the reference saved earlier)
    if (Array.isArray(participantsToSave)) {
      await saveGroupParticipantsToDatabase(groupId, participantsToSave);
    } else {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ ${groupId} sem array de participantes válido nos metadados buscados para salvar.`);
    }

    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados (mesclados com DB) e participantes de ${groupId} salvos no banco de dados.`);
  } catch (fetchSaveError) {
    // Handle errors during fetch or save (e.g., group not found, DB connection issues)
    if (fetchSaveError.message?.includes("group not found") || fetchSaveError.output?.statusCode === 404) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Grupo ${groupId} não encontrado pelo cliente (bot saiu ou grupo deletado?). Removendo do cache.`);
      groupMetadataCache.delete(groupId);
      // Optionally: Mark group as inactive or delete from DB here if desired
      // await runQuery(`DELETE FROM ${config.database.tables.groups} WHERE id = ?`, [groupId]);
    } else {
      logger.error(`[ handleGroupMetadataUpdate ] ❌ Erro ao buscar/mesclar/salvar metadados de ${groupId}: ${fetchSaveError.message}`, { stack: fetchSaveError.stack });
    }
  }
}

/**
 * Main function to process user data from incoming message events.
 * Iterates through messages, processes each one, and triggers group metadata updates if necessary.
 * @param {object} data - The Baileys event data containing messages.
 * @param {object} client - The Baileys client instance.
 */
async function processUserData(data, client) {
  // Check if data and messages array are valid
  if (!data?.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
    // logger.trace("[ processUserData ] Sem mensagens válidas para processar no evento.");
    return;
  }

  // Process each message in the event
  for (const info of data.messages) {
    let messageId = info?.key?.id || "ID_DESCONHECIDO"; // Default message ID for logging if key is missing
    try {
      // Process the message: validate, save user, ensure group, save message
      const { groupId } = await processIncomingMessageData(info);
      messageId = info.key?.id || messageId; // Update messageId if it was generated

      // If it was a group message, trigger a metadata update (will use cache if available)
      if (groupId) {
        // No need to await this, can run in background
        handleGroupMetadataUpdate(groupId, client);
      }
    } catch (error) {
      // Log errors during processing, but don't stop processing other messages in the batch
      // Filter out expected "self message" errors from logs
      if (error.message !== "Dados inválidos ou mensagem própria.") {
        logger.error(`[ processUserData ] ❌ Erro ao processar dados da mensagem ${messageId}: ${error.message}`, { stack: error.stack, messageKey: info?.key });
      }
    }
  }
}

// Export the necessary functions
module.exports = {
  createTables,
  processUserData,
  groupMetadataCache,
  // Export internal functions if needed elsewhere (e.g., for specific commands)
  handleGroupMetadataUpdate,
  saveGroupToDatabase,
  saveGroupParticipantsToDatabase,
  ensureGroupExists,
  getGroupSettingsFromDB, // Export if needed by commands
};
