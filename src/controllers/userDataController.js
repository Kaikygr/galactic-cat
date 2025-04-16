// /home/kaiky/Área de trabalho/dev/src/controllers/userDataController.js

const { initDatabase, runQuery } = require("../database/processDatabase"); // Use the refactored module
const logger = require("../utils/logger");
const moment = require("moment-timezone");
const crypto = require("crypto");

// --- Constants ---
const DEFAULT_PUSHNAME = "Desconhecido";
const DEFAULT_GROUP_SUBJECT = "Grupo Desconhecido";
const DEFAULT_GROUP_OWNER = "Desconhecido";
const DEFAULT_GROUP_DESC = null; // Use NULL for empty description
const DEFAULT_DESC_ID = null; // Use NULL for empty description ID
const DEFAULT_SUBJECT_OWNER = null; // Use NULL if unknown

// --- Helper Functions ---

/**
 * Sanitizes input values for database insertion.
 * Returns null if the value is null or undefined, otherwise returns the value.
 * @param {*} value - The value to sanitize.
 * @param {*} [defaultValue=null] - The default value to return if the input is null/undefined.
 * @returns {*} - The sanitized value or the default value.
 */
const sanitizeData = (value, defaultValue = null) => (value == null ? defaultValue : value);

/**
 * Formats a Unix timestamp (seconds) or Date object into a MySQL DATETIME string.
 * Returns null if the input is invalid.
 * @param {number|Date|null|undefined} timestamp - The Unix timestamp (seconds) or Date object.
 * @returns {string|null} - Formatted DATETIME string (YYYY-MM-DD HH:MM:SS) or null.
 */
const formatTimestampForDB = timestamp => {
  if (timestamp == null) return null;
  // Check if it's a Unix timestamp (assuming seconds)
  if (typeof timestamp === "number" && timestamp > 0) {
    return moment.unix(timestamp).isValid() ? moment.unix(timestamp).format("YYYY-MM-DD HH:mm:ss") : null;
  }
  // Check if it's already a Date object
  if (timestamp instanceof Date && !isNaN(timestamp)) {
    return moment(timestamp).format("YYYY-MM-DD HH:mm:ss");
  }
  // Try parsing as a string just in case, though less common for creation/subjectTime
  const parsedMoment = moment(timestamp);
  return parsedMoment.isValid() ? parsedMoment.format("YYYY-MM-DD HH:mm:ss") : null;
};

// --- Database Schema Management ---

/**
 * Creates necessary database tables if they don't exist.
 * Should be called once during application startup *after* initDatabase succeeds.
 * @throws {Error} If table creation fails.
 */
async function createTables() {
  logger.info("[ createTables ] 📦 Verificando e criando tabelas necessárias no banco de dados...");
  try {
    // Note: runQuery handles pool initialization check internally if needed,
    // but it's best practice to ensure initDatabase() was called successfully before this.

    await runQuery(`
      CREATE TABLE IF NOT EXISTS \`groups\` (
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
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info("[ createTables ] ✅ Tabela 'groups' verificada/criada.");

    await runQuery(`
      CREATE TABLE IF NOT EXISTS users (
        sender VARCHAR(255) PRIMARY KEY,
        pushName VARCHAR(255),
        isPremium TINYINT(1) DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info("[ createTables ] ✅ Tabela 'users' verificada/criada.");

    await runQuery(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id VARCHAR(255) NOT NULL,
        sender_id VARCHAR(255) NOT NULL,
        group_id VARCHAR(255),
        messageType VARCHAR(255),
        messageContent MEDIUMTEXT, -- Changed to MEDIUMTEXT for potentially large JSON
        timestamp DATETIME NOT NULL,
        PRIMARY KEY (sender_id, timestamp, message_id), -- Composite key allows multiple messages per sender
        INDEX idx_message_id (message_id), -- Index for faster lookups by message_id if needed
        INDEX idx_group_id (group_id), -- Index for faster lookups by group_id
        CONSTRAINT fk_sender_id FOREIGN KEY (sender_id) REFERENCES users(sender) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_group_id FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info("[ createTables ] ✅ Tabela 'messages' verificada/criada.");

    await runQuery(`
      CREATE TABLE IF NOT EXISTS group_participants (
        group_id VARCHAR(255) NOT NULL,
        participant VARCHAR(255) NOT NULL,
        isAdmin TINYINT(1) DEFAULT 0,
        PRIMARY KEY (group_id, participant),
        CONSTRAINT fk_group_participants_group FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE ON UPDATE CASCADE,
        -- Optional: Add foreign key to users table if desired, but might cause issues if user leaves group before being saved
        -- CONSTRAINT fk_group_participants_user FOREIGN KEY (participant) REFERENCES users(sender) ON DELETE CASCADE ON UPDATE CASCADE
        INDEX idx_participant (participant) -- Index for faster lookups by participant
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info("[ createTables ] ✅ Tabela 'group_participants' verificada/criada.");

    await runQuery(`
      CREATE TABLE IF NOT EXISTS command_usage (
        user_id VARCHAR(255) NOT NULL,
        command_name VARCHAR(50) NOT NULL,
        usage_count_window INT DEFAULT 0,
        window_start_timestamp DATETIME NULL, -- Allow NULL initially
        last_used_timestamp DATETIME NULL, -- Allow NULL initially
        PRIMARY KEY (user_id, command_name),
        CONSTRAINT fk_user_usage FOREIGN KEY (user_id) REFERENCES users(sender) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logger.info("[ createTables ] ✅ Tabela 'command_usage' verificada/criada.");

    logger.info("[ createTables ] ✅ Verificação/criação de todas as tabelas concluída.");
  } catch (error) {
    logger.error(`[ createTables ] ❌ Erro crítico ao criar/verificar tabelas: ${error.message}`, { stack: error.stack });
    // Re-throw critical error to potentially halt startup if tables are essential
    throw new Error(`Falha ao inicializar tabelas do banco de dados: ${error.message}`);
  }
}

// --- Data Saving Functions ---

/**
 * Saves or updates user information in the database.
 * @param {string} userId - The user's JID (e.g., '1234567890@s.whatsapp.net').
 * @param {string} [pushName=DEFAULT_PUSHNAME] - The user's display name.
 * @throws {Error} If the database query fails.
 */
async function saveUserToDatabase(userId, pushName = DEFAULT_PUSHNAME) {
  const finalPushName = sanitizeData(pushName, DEFAULT_PUSHNAME); // Ensure pushName isn't null
  const query = `
    INSERT INTO users (sender, pushName)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE pushName = VALUES(pushName);
  `;
  try {
    await runQuery(query, [userId, finalPushName]);
    logger.debug(`[ saveUserToDatabase ] Usuário salvo/atualizado: ${userId}`);
  } catch (error) {
    logger.error(`[ saveUserToDatabase ] ❌ Erro ao salvar usuário ${userId}: ${error.message}`, { stack: error.stack });
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Saves or updates group metadata in the database.
 * @param {object} groupMeta - The group metadata object from the WhatsApp client.
 * @throws {Error} If the group ID is missing or the database query fails.
 */
async function saveGroupToDatabase(groupMeta) {
  const groupId = groupMeta?.id;
  if (!groupId) {
    logger.error("[ saveGroupToDatabase ] ❌ Erro: ID do grupo ausente.", { groupMeta });
    throw new Error("ID do grupo ausente nos metadados fornecidos.");
  }

  logger.debug(`[ saveGroupToDatabase ] Processando metadados do grupo: ${groupId}`);

  try {
    const values = [
      groupId,
      sanitizeData(groupMeta.subject, DEFAULT_GROUP_SUBJECT),
      sanitizeData(groupMeta.owner, DEFAULT_GROUP_OWNER),
      formatTimestampForDB(groupMeta.creation),
      sanitizeData(groupMeta.desc, DEFAULT_GROUP_DESC),
      sanitizeData(groupMeta.descId, DEFAULT_DESC_ID),
      sanitizeData(groupMeta.subjectOwner, DEFAULT_SUBJECT_OWNER),
      formatTimestampForDB(groupMeta.subjectTime),
      groupMeta.size || 0,
      groupMeta.restrict ? 1 : 0,
      groupMeta.announce ? 1 : 0,
      groupMeta.isCommunity ? 1 : 0,
      groupMeta.isCommunityAnnounce ? 1 : 0,
      groupMeta.joinApprovalMode ? 1 : 0,
      groupMeta.memberAddMode ? 1 : 0, // Ensure correct mapping if property name differs
      groupMeta.isPremium ? 1 : 0, // Assuming this might come from metadata someday
      formatTimestampForDB(groupMeta.premiumTemp), // Assuming this might come from metadata someday
    ];

    const query = `
      INSERT INTO \`groups\` (
        id, name, owner, created_at, description, description_id, subject_owner, subject_time, size,
        \`restrict\`, announce, is_community, is_community_announce, join_approval_mode, member_add_mode, isPremium, premiumTemp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name), owner = VALUES(owner), created_at = VALUES(created_at), description = VALUES(description),
        description_id = VALUES(description_id), subject_owner = VALUES(subject_owner), subject_time = VALUES(subject_time),
        size = VALUES(size), \`restrict\` = VALUES(\`restrict\`), announce = VALUES(announce), is_community = VALUES(is_community),
        is_community_announce = VALUES(is_community_announce), join_approval_mode = VALUES(join_approval_mode),
        member_add_mode = VALUES(member_add_mode), isPremium = VALUES(isPremium), premiumTemp = VALUES(premiumTemp);
    `;

    await runQuery(query, values);
    logger.debug(`[ saveGroupToDatabase ] ✅ Grupo salvo/atualizado: ${groupId}`);
  } catch (error) {
    logger.error(`[ saveGroupToDatabase ] ❌ Erro ao salvar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error; // Re-throw
  }
}

/**
 * Saves or updates group participant information (ensuring they exist in the table).
 * Uses INSERT IGNORE to avoid errors if the participant already exists for the group.
 * @param {string} groupId - The ID of the group.
 * @param {Array<object>} participants - An array of participant objects from group metadata.
 * @throws {Error} If the database query fails.
 */
async function saveGroupParticipantsToDatabase(groupId, participants) {
  if (!participants || participants.length === 0) {
    logger.debug(`[ saveGroupParticipantsToDatabase ] Sem participantes para salvar no grupo ${groupId}.`);
    return;
  }

  // Prepare bulk insert data
  const values = participants.map(p => [groupId, p.id, p.admin === "admin" || p.admin === "superadmin" ? 1 : 0]);

  const query = `
    INSERT IGNORE INTO group_participants (group_id, participant, isAdmin)
    VALUES (?, ?, ?);
  `;

  try {
    // Execute as queries em uma transação
    for (const participantData of values) {
      await runQuery(query, participantData);
    }
    logger.debug(`[ saveGroupParticipantsToDatabase ] ✅ Participantes do grupo ${groupId} salvos/ignorados.`);
  } catch (error) {
    logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Erro ao salvar participantes do grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

/**
 * Ensures a group exists in the 'groups' table. If not, inserts a minimal entry.
 * This is crucial for foreign key constraints when saving messages or participants.
 * @param {string} groupId - The group JID.
 * @returns {Promise<string>} The groupId.
 * @throws {Error} If checking or inserting the group fails.
 */
async function ensureGroupExists(groupId) {
  try {
    const checkQuery = `SELECT id FROM \`groups\` WHERE id = ? LIMIT 1;`;
    const results = await runQuery(checkQuery, [groupId]);

    if (results.length === 0) {
      logger.warn(`[ ensureGroupExists ] Grupo ${groupId} não encontrado. Criando entrada mínima.`);
      // Insert a minimal record to satisfy foreign key constraints
      // Full details will be populated later by saveGroupToDatabase if metadata is fetched
      const insertQuery = `
        INSERT IGNORE INTO \`groups\` (id, name, owner, created_at)
        VALUES (?, ?, ?, ?);
      `;
      await runQuery(insertQuery, [
        groupId,
        DEFAULT_GROUP_SUBJECT,
        DEFAULT_GROUP_OWNER,
        moment().format("YYYY-MM-DD HH:mm:ss"), // Use current time as creation placeholder
      ]);
      logger.info(`[ ensureGroupExists ] ✅ Entrada mínima criada para o grupo ${groupId}.`);
    }
    return groupId;
  } catch (error) {
    logger.error(`[ ensureGroupExists ] ❌ Erro ao verificar/criar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error; // Re-throw critical error
  }
}

/**
 * Saves message details to the database.
 * @param {object} messageData - Object containing message details.
 * @param {string} messageData.messageId - The unique ID of the message.
 * @param {string} messageData.userId - The sender's JID.
 * @param {string|null} messageData.groupId - The group JID if it's a group message, otherwise null.
 * @param {string} messageData.messageType - The type of the message (e.g., 'conversation', 'imageMessage').
 * @param {string|null} messageData.messageContent - The content of the message (often stringified JSON).
 * @param {string} messageData.timestamp - The timestamp of the message (YYYY-MM-DD HH:mm:ss).
 * @throws {Error} If the database query fails.
 */
async function saveMessageToDatabase(messageData) {
  const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;

  // Basic validation
  if (!messageId || !userId || !messageType || !timestamp) {
    logger.error("[ saveMessageToDatabase ] ❌ Dados da mensagem incompletos.", messageData);
    throw new Error("Dados da mensagem incompletos para salvar no banco de dados.");
  }

  const query = `
    INSERT INTO messages (message_id, sender_id, group_id, messageType, messageContent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE -- Avoid duplicate errors if message processed twice, update content just in case
      messageType = VALUES(messageType),
      messageContent = VALUES(messageContent);
  `;
  try {
    await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
    logger.debug(`[ saveMessageToDatabase ] ✅ Mensagem ${messageId} salva para usuário ${userId}.`);
  } catch (error) {
    // Log specific FK constraint errors if possible
    if (error.code === "ER_NO_REFERENCED_ROW_2" && error.message.includes("fk_sender_id")) {
      logger.error(`[ saveMessageToDatabase ] ❌ Erro de chave estrangeira: Usuário ${userId} não encontrado na tabela 'users'. Mensagem ${messageId} não salva.`);
    } else if (error.code === "ER_NO_REFERENCED_ROW_2" && error.message.includes("fk_group_id")) {
      logger.error(`[ saveMessageToDatabase ] ❌ Erro de chave estrangeira: Grupo ${groupId} não encontrado na tabela 'groups'. Mensagem ${messageId} não salva.`);
    } else {
      logger.error(`[ saveMessageToDatabase ] ❌ Erro ao salvar mensagem ${messageId}: ${error.message}`, { stack: error.stack });
    }
    throw error; // Re-throw
  }
}

/**
 * Processes incoming message data: saves user, ensures group exists (if applicable), and saves the message.
 * @param {object} info - The message object from the WhatsApp client event.
 * @throws {Error} If processing fails at any step (validation, database interaction).
 */
async function processIncomingMessageData(info) {
  // --- 1. Validate Input ---
  if (!info?.key) {
    logger.warn("[ processIncomingMessageData ] ⚠️ Dados da mensagem inválidos ou ausentes (sem chave).", { info });
    throw new Error("Dados da mensagem inválidos (sem chave).");
  }
  if (info.key.fromMe) {
    logger.debug("[ processIncomingMessageData ] Ignorando mensagem própria.");
    return; // Don't process own messages
  }

  const from = info.key.remoteJid;
  if (!from || (!from.endsWith("@g.us") && !from.endsWith("@s.whatsapp.net"))) {
    logger.warn(`[ processIncomingMessageData ] ⚠️ RemoteJid inválido ou não suportado: ${from}`);
    throw new Error(`RemoteJid inválido ou não suportado: ${from}`);
  }

  const isGroup = from.endsWith("@g.us");
  const userId = isGroup ? sanitizeData(info.key.participant) : from; // Get participant in group, or sender in PM

  if (!userId) {
    logger.error("[ processIncomingMessageData ] ❌ ID do remetente (userId) não pôde ser determinado.", { key: info.key });
    throw new Error("ID do remetente (userId) ausente.");
  }

  const messageId = info.key.id || crypto.randomUUID(); // Use provided ID or generate one

  // --- 2. Save User ---
  try {
    await saveUserToDatabase(userId, info.pushName);
  } catch (userSaveError) {
    // Log but continue if possible, maybe message save will work if user was created previously
    logger.error(`[ processIncomingMessageData ] ❌ Falha ao salvar usuário ${userId}, mas tentando continuar: ${userSaveError.message}`);
    // Optionally re-throw if user saving is absolutely critical before message saving
    // throw userSaveError;
  }

  // --- 3. Ensure Group Exists (if applicable) ---
  let groupId = null;
  if (isGroup) {
    try {
      groupId = await ensureGroupExists(from);
    } catch (groupEnsureError) {
      logger.error(`[ processIncomingMessageData ] ❌ Falha ao garantir a existência do grupo ${from}. Mensagem pode não ser salva corretamente: ${groupEnsureError.message}`);
      // Decide whether to proceed without a valid group ID or throw
      // Proceeding might lead to FK errors later, throwing stops processing now.
      throw groupEnsureError;
    }
  }

  // --- 4. Prepare and Save Message ---
  try {
    // Determine message type and content carefully
    const messageType = Object.keys(info.message || {})[0] || "unknown";
    let messageContent = null;
    if (info.message && info.message[messageType]) {
      try {
        // Stringify complex objects, keep simple types as is if needed (though stringify is safer)
        messageContent = JSON.stringify(info.message[messageType]);
      } catch (stringifyError) {
        logger.warn(`[ processIncomingMessageData ] ⚠️ Falha ao stringificar conteúdo da mensagem tipo ${messageType}. Salvando como texto: ${stringifyError.message}`);
        messageContent = `[Error stringifying content: ${stringifyError.message}]`;
      }
    }

    const timestamp = moment().tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss"); // Use current server time

    await saveMessageToDatabase({
      messageId,
      userId,
      groupId, // Will be null for non-group messages
      messageType,
      messageContent,
      timestamp,
    });

    logger.debug(`[ processIncomingMessageData ] ✅ Dados da mensagem ${messageId} processados com sucesso para ${userId}.`);
  } catch (messageSaveError) {
    logger.error(`[ processIncomingMessageData ] ❌ Erro final ao salvar a mensagem ${messageId} para ${userId}: ${messageSaveError.message}`);
    throw messageSaveError; // Re-throw the specific message saving error
  }
}

// --- Main Processing Function ---

// Cache for group metadata to avoid excessive lookups
// Consider using a more robust caching library (like node-cache) for TTL and size limits
const groupMetadataCache = new Map();
const GROUP_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Main function to process user and group data from incoming WhatsApp events.
 * @param {object} data - The raw event data containing messages.
 * @param {object} client - The initialized WhatsApp client instance (e.g., Baileys).
 * @throws {Error} If essential data is missing or processing fails.
 */
async function processUserData(data, client) {
  // --- 1. Basic Validation ---
  if (!data?.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
    logger.warn("[ processUserData ] ⚠️ Payload de dados inválido ou sem mensagens.", { data });
    // Depending on requirements, maybe return instead of throwing
    // throw new Error("Payload de dados inválido ou sem mensagens.");
    return;
  }

  // Process only the first message in the batch for simplicity, adjust if needed
  const info = data.messages[0];

  try {
    // --- 2. Process User and Message Data ---
    // This function now handles user saving, group checking (minimal), and message saving
    await processIncomingMessageData(info);

    // --- 3. Process Full Group Metadata (if applicable and needed) ---
    const from = info.key?.remoteJid;
    if (from?.endsWith("@g.us")) {
      logger.debug(`[ processUserData ] Mensagem do grupo ${from}. Verificando necessidade de atualizar metadados.`);

      if (!client || typeof client.groupMetadata !== "function") {
        logger.error("[ processUserData ] ❌ Cliente WhatsApp inválido ou método groupMetadata não disponível. Não é possível buscar metadados do grupo.");
        // Don't throw here, as message/user might be saved already. Log the error.
        return;
      }

      const now = Date.now();
      const cachedEntry = groupMetadataCache.get(from);

      // Check cache validity
      if (cachedEntry && now - cachedEntry.timestamp < GROUP_CACHE_EXPIRY_MS) {
        logger.debug(`[ processUserData ] 📦 Usando metadados em cache para o grupo: ${from}`);
        // Optionally, trigger saves even with cache if needed, but usually cache means data is recent
        // await saveGroupToDatabase(cachedEntry.data);
        // await saveGroupParticipantsToDatabase(from, cachedEntry.data.participants);
      } else {
        logger.info(`[ processUserData ] 🔄 Cache expirado ou ausente. Buscando novos metadados para o grupo: ${from}`);
        try {
          const groupMeta = await client.groupMetadata(from);

          if (!groupMeta || !groupMeta.id) {
            // This might happen if the bot is no longer in the group
            logger.warn(`[ processUserData ] ⚠️ Não foi possível obter metadados válidos para o grupo ${from}. O bot ainda está no grupo?`);
            groupMetadataCache.delete(from); // Remove potentially invalid cache entry
            return; // Stop processing group data for this message
          }

          // Update cache
          groupMetadataCache.set(from, { data: groupMeta, timestamp: now });
          logger.info(`[ processUserData ] ✅ Metadados do grupo ${from} obtidos e cacheados.`);

          // Save fetched metadata and participants
          await saveGroupToDatabase(groupMeta);
          await saveGroupParticipantsToDatabase(from, groupMeta.participants); // Pass participants array

          logger.info(`[ processUserData ] ✅ Metadados e participantes do grupo ${from} salvos no banco de dados.`);
        } catch (fetchError) {
          // Handle specific errors like 'group not found' if the API provides them
          logger.error(`[ processUserData ] ❌ Erro ao buscar/salvar metadados do grupo ${from}: ${fetchError.message}`, { stack: fetchError.stack });
          // Don't re-throw usually, as the main message processing might have succeeded
        }
      }
    }
  } catch (error) {
    // Catch errors from processIncomingMessageData or group processing logic
    logger.error(`[ processUserData ] ❌ Erro geral ao processar dados para a mensagem ${info?.key?.id}: ${error.message}`, { stack: error.stack });
    // Decide if this error should halt further processing or just be logged
    // throw error; // Re-throw if critical
  }
}

// --- Exports ---
module.exports = {
  createTables, // Export for calling during startup
  processUserData, // Main function to handle incoming events
  // Export individual save functions only if needed externally, usually not recommended
  // saveUserToDatabase,
  // saveGroupToDatabase,
  // saveUserToDatabase,
  // saveGroupToDatabase,
  // saveGroupParticipantsToDatabase,
  // saveMessageToDatabase,
};
