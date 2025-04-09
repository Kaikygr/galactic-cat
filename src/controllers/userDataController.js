/**
 * Initializes and creates the necessary tables in the database (i.e., groups, users, group_participants).
 *
 * @async
 * @function createTables
 * @throws {Error} If the database connection fails or table creation encounters an error.
 */

/**
 * Ensures that the database connection is active. If not, initializes a new connection.
 *
 * @async
 * @function ensureDatabaseConnection
 * @throws {Error} If the connection initialization fails.
 */

/**
 * Executes a SQL query with provided parameters using prepared statements to prevent SQL injection.
 *
 * @async
 * @function runQuery
 * @param {string} query - The SQL query string containing placeholders.
 * @param {Array<*>} params - The array of parameter values to substitute into the query.
 * @returns {(number|Object)} The result of the query execution, typically an insertId or a result object.
 * @throws {Error} If the query execution fails.
 */

/**
 * Determines if a user is premium based on the 'isPremium' flag and valid 'premiumTemp' expiration.
 *
 * @async
 * @function isUserPremium
 * @param {string} userId - The unique identifier (sender) of the user.
 * @returns {Promise<boolean>} Resolves to true if the user is premium and their premium period is still valid, otherwise false.
 * @throws {Error} If the query to check the user's premium status fails.
 */

/**
 * Determines if a group is premium based on the 'isPremium' flag and valid 'premiumTemp' expiration.
 *
 * @async
 * @function isGroupPremium
 * @param {string} groupId - The unique identifier of the group.
 * @returns {Promise<boolean>} Resolves to true if the group is premium and its premium period is still valid, otherwise false.
 * @throws {Error} If the query to check the group's premium status fails.
 */

/**
 * Saves the user's message and related information into the database. Also ensures that the group exists;
 * if not, it creates a new group record.
 *
 * @async
 * @function saveUserToDB
 * @param {Object} info - The message information object.
 * @param {Object} info.key - Contains keys related to the message (e.g., remoteJid, participant).
 * @param {string} [info.pushName] - The display name of the user.
 * @param {Object} [info.message] - The actual message object.
 * @returns {Promise<(number|Object)>} The result from the database insertion operation.
 * @throws {Error} If required sender information is missing or if the query execution fails.
 */

/**
 * Inserts or updates group metadata in the database using "ON DUPLICATE KEY UPDATE" to maintain data consistency.
 *
 * @async
 * @function saveGroupToDB
 * @param {Object} groupMeta - An object containing group metadata.
 * @param {string} groupMeta.id - The unique identifier of the group.
 * @param {string} [groupMeta.subject] - The name or subject of the group.
 * @param {string} [groupMeta.owner] - The owner identifier of the group.
 * @param {number} [groupMeta.creation] - Unix timestamp of the group's creation time.
 * @param {string} [groupMeta.desc] - The group's description.
 * @param {string} [groupMeta.descId] - An identifier for the description.
 * @param {string} [groupMeta.subjectOwner] - Indicates who changed the group subject.
 * @param {number} [groupMeta.subjectTime] - Unix timestamp of when the subject was set.
 * @param {number} [groupMeta.size] - The size (i.e., member count) of the group.
 * @param {*} [groupMeta.restrict] - Flag indicating if restrictions are applied to the group.
 * @param {*} [groupMeta.announce] - Flag indicating if group announcements are enabled.
 * @param {*} [groupMeta.isCommunity] - Flag indicating if the group is a community.
 * @param {*} [groupMeta.isCommunityAnnounce] - Flag indicating if community announcements are enabled.
 * @param {*} [groupMeta.joinApprovalMode] - Mode setting for join approval.
 * @param {*} [groupMeta.memberAddMode] - Mode setting for adding group members.
 * @param {*} [groupMeta.isPremium] - Flag indicating if the group is premium.
 * @param {number} [groupMeta.premiumTemp] - Unix timestamp indicating when premium access expires.
 * @returns {Promise<(number|Object)>} The result of the insertion or update database operation.
 * @throws {Error} If the group id is missing or if the query execution fails.
 */

/**
 * Saves the participants of a group into the database using INSERT IGNORE to avoid duplication.
 *
 * @async
 * @function saveGroupParticipantsToDB
 * @param {Object} groupMeta - An object containing the group's metadata.
 * @param {string} groupMeta.id - The unique identifier of the group.
 * @param {Array<Object>} groupMeta.participants - An array of participant objects.
 * @param {string} groupMeta.participants[].id - The unique identifier for a participant.
 * @param {string} [groupMeta.participants[].admin] - Indicates if the participant has admin rights ("admin" if true).
 * @returns {Promise<void>}
 * @throws {Error} If the query for inserting participants fails.
 */

/**
 * Processes the incoming user data. Saves user messages and, for group messages, fetches and updates group metadata
 * and participants.
 *
 * @async
 * @function processUserData
 * @param {Object} data - The incoming data payload containing messages.
 * @param {Array<Object>} data.messages - Array of message objects.
 * @param {Object} client - The client instance used to fetch additional group metadata.
 * @returns {Promise<void>}
 * @throws {Error} If processing the user data or fetching/updating group details fails.
 */

const logger = require("../utils/logger");
const { initDatabase, connection } = require("../utils/processDatabase");
const moment = require("moment-timezone");
let db = connection; // Reutiliza a conexão compartilhada

// Função helper para evitar valores null
const sanitizeData = (value, defaultValue = "") => (value == null ? defaultValue : value);

async function createTables() {
  try {
    /* Verifica se a conexão com o banco de dados está estabelecida */
    if (!db) {
      console.info("Inicializando conexão com o banco de dados...");
      db = await initDatabase();
      if (!db) {
        throw new Error("Falha na inicialização da conexão com o banco de dados.");
      }
    }

    /* Atualiza a tabela 'groups' para incluir novos campos */
    await db.execute(`
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
        \`restrict\` TINYINT, -- Corrigido para evitar conflito com palavra reservada
        announce TINYINT,
        is_community TINYINT,
        is_community_announce TINYINT,
        join_approval_mode TINYINT,
        member_add_mode TINYINT,
        isPremium TINYINT DEFAULT 0, -- Indica se o grupo é premium
        premiumTemp DATETIME DEFAULT NULL -- Data de término do plano premium
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("✅ Tabela 'groups' atualizada com colunas 'isPremium' e 'premiumTemp'.");

    /* Cria a tabela 'users' com restrição de chave estrangeira segura */
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender VARCHAR(255) NOT NULL,
        pushName VARCHAR(255),
        isGroup TINYINT,
        messageType VARCHAR(255),
        messageContent TEXT,
        timestamp DATETIME,
        group_id VARCHAR(255) DEFAULT 'message in private',
        isPremium TINYINT DEFAULT 0, -- Indica se o usuário é premium
        premiumTemp DATETIME DEFAULT NULL, -- Data de término do plano premium
        CONSTRAINT fk_group_id FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE SET NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("✅ Tabela 'users' atualizada com colunas 'isPremium' e 'premiumTemp'.");

    /* Cria a tabela 'group_participants' com integridade referencial e chave composta */
    await db.execute(`
      CREATE TABLE IF NOT EXISTS group_participants (
        group_id VARCHAR(255) NOT NULL,
        participant VARCHAR(255) NOT NULL,
        isAdmin TINYINT,
        PRIMARY KEY (group_id, participant),
        CONSTRAINT fk_group_participants FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("✅ Tabela 'group_participants' criada/verificada.");
  } catch (error) {
    /* Em caso de erro, loga a mensagem detalhada e relança o erro para manuseio global */
    logger.info("❌ Erro ao criar/verificar tabelas:", error);
    throw error;
  }
}

/* 
Inicializa a conexão com o banco de dados e cria as tabelas necessárias.
*/
initDatabase()
  .then(async connection => {
    db = connection;
    await createTables();
  })
  .catch(err => {
    logger.error("❌ Erro na inicialização do MySQL:", err);
  });

/* 
Garante que a conexão com o banco de dados esteja ativa.
Caso não esteja, inicializa a conexão.
*/
async function ensureDatabaseConnection() {
  if (!db) {
    console.info("DB não inicializado, inicializando conexão...");
    db = await initDatabase();
    if (!db) {
      throw new Error("Falha na inicialização da conexão com o banco de dados.");
    }
  }
}

/* 
Executa uma query com tratamento de erros e prevenção de SQL Injection usando placeholders.
*/
async function runQuery(query, params) {
  try {
    await ensureDatabaseConnection();
    const [result] = await db.execute(query, params);
    return result.insertId || result;
  } catch (err) {
    logger.error("❌ Erro na execução da query:", err);
    throw err;
  }
}

/* 
Valida se o usuário é premium com base em 'premiumTemp'.
*/
async function isUserPremium(userId) {
  try {
    const query = `
      SELECT isPremium, premiumTemp
      FROM users
      WHERE sender = ?
    `;
    const [result] = await runQuery(query, [userId]);

    if (result.length > 0) {
      const { isPremium, premiumTemp } = result[0];
      const now = moment().format("YYYY-MM-DD HH:mm:ss");
      return isPremium === 1 && premiumTemp && premiumTemp > now;
    }
    return false;
  } catch (error) {
    logger.error("❌ Erro ao verificar status premium do usuário:", error);
    throw error;
  }
}

/* 
Valida se o grupo é premium com base em 'premiumTemp'.
*/
async function isGroupPremium(groupId) {
  try {
    const query = `
      SELECT isPremium, premiumTemp
      FROM \`groups\`
      WHERE id = ?
    `;
    const [result] = await runQuery(query, [groupId]);

    if (result.length > 0) {
      const { isPremium, premiumTemp } = result[0];
      const now = moment().format("YYYY-MM-DD HH:mm:ss");
      return isPremium === 1 && premiumTemp && premiumTemp > now;
    }
    return false;
  } catch (error) {
    logger.error("❌ Erro ao verificar status premium do grupo:", error);
    throw error;
  }
}

/* 
Salva os dados do usuário/mensagem no banco de dados.
Divide a responsabilidade de verificação do grupo para evitar inconsistência de dados.
*/
async function saveUserToDB(info) {
  try {
    await ensureDatabaseConnection();
    const from = info?.key?.remoteJid || null;
    const isGroup = from?.endsWith("@g.us") ? 1 : 0;
    const userId = isGroup ? info.key.participant : from;

    // Verifica se o sender (userId) não é nulo
    if (!userId) {
      throw new Error("sender cannot be null");
    }

    let pushName = info.pushName || null;
    let messageType = Object.keys(info.message || {})[0] || null;
    let messageContent = info.message?.[messageType] ? JSON.stringify(info.message[messageType]) : null;

    // Aplica a sanitização para evitar nulls
    pushName = sanitizeData(pushName);
    messageType = sanitizeData(messageType);
    messageContent = sanitizeData(messageContent);

    const timestamp = moment.tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");
    const groupId = isGroup ? from : "privado";
    const groupExistsQuery = `SELECT id FROM \`groups\` WHERE id = ?`;
    const [groupExists] = await db.execute(groupExistsQuery, [groupId]);
    if (groupExists.length === 0) {
      logger.warn(`Grupo '${groupId}' não encontrado. Criando grupo '${groupId}'.`);
      await saveGroupToDB({ id: groupId, subject: isGroup ? "Grupo Desconhecido" : "Mensagens Privadas" });
    }

    const query = `
      INSERT INTO users (sender, pushName, isGroup, messageType, messageContent, timestamp, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await runQuery(query, [userId, pushName, isGroup, messageType, messageContent, timestamp, groupId]);
    logger.info("✅ Mensagem salva no histórico do usuário:", userId);
    return result;
  } catch (error) {
    logger.error("❌ Erro ao salvar usuário/mensagem no banco:", error);
    throw error;
  }
}

/* 
Salva ou atualiza as informações do grupo no banco de dados.
Utiliza ON DUPLICATE KEY UPDATE para prevenir duplicação e manter a integridade dos dados.
*/
async function saveGroupToDB(groupMeta) {
  try {
    await ensureDatabaseConnection();
    const id = groupMeta.id || null;
    if (!id) {
      throw new Error("group id cannot be null");
    }
    const name = groupMeta.subject || "Grupo Desconhecido";
    const owner = groupMeta.owner || null;
    const createdAt = groupMeta.creation ? new Date(groupMeta.creation * 1000).toISOString().slice(0, 19).replace("T", " ") : new Date().toISOString().slice(0, 19).replace("T", " ");
    let description = groupMeta.desc || null;
    let descriptionId = groupMeta.descId || null;
    let subjectOwner = groupMeta.subjectOwner || null;
    let subjectTime = groupMeta.subjectTime ? new Date(groupMeta.subjectTime * 1000).toISOString().slice(0, 19).replace("T", " ") : null;
    const size = groupMeta.size || 0;
    const restrict = groupMeta.restrict ? 1 : 0;
    const announce = groupMeta.announce ? 1 : 0;
    const isCommunity = groupMeta.isCommunity ? 1 : 0;
    const isCommunityAnnounce = groupMeta.isCommunityAnnounce ? 1 : 0;
    const joinApprovalMode = groupMeta.joinApprovalMode ? 1 : 0;
    const memberAddMode = groupMeta.memberAddMode ? 1 : 0;
    const isPremium = groupMeta.isPremium ? 1 : 0;
    const premiumTemp = groupMeta.premiumTemp ? new Date(groupMeta.premiumTemp * 1000).toISOString().slice(0, 19).replace("T", " ") : null;

    // Aplicar sanitização para evitar valores null
    description = sanitizeData(description);
    descriptionId = sanitizeData(descriptionId);
    subjectOwner = sanitizeData(subjectOwner);

    const query = `
      INSERT INTO \`groups\` (
        id, name, owner, created_at, description, description_id, subject_owner, subject_time, size,
        \`restrict\`, announce, is_community, is_community_announce, join_approval_mode, member_add_mode, isPremium, premiumTemp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        owner = VALUES(owner),
        created_at = VALUES(created_at),
        description = VALUES(description),
        description_id = VALUES(description_id),
        subject_owner = VALUES(subject_owner),
        subject_time = VALUES(subject_time),
        size = VALUES(size),
        \`restrict\` = VALUES(\`restrict\`),
        announce = VALUES(announce),
        is_community = VALUES(is_community),
        is_community_announce = VALUES(is_community_announce),
        join_approval_mode = VALUES(join_approval_mode),
        member_add_mode = VALUES(member_add_mode),
        isPremium = VALUES(isPremium),
        premiumTemp = VALUES(premiumTemp)
    `;
    const result = await runQuery(query, [id, name, owner, createdAt, description, descriptionId, subjectOwner, subjectTime, size, restrict, announce, isCommunity, isCommunityAnnounce, joinApprovalMode, memberAddMode, isPremium, premiumTemp]);
    logger.info("✅ Grupo salvo/atualizado:", id);
    return result;
  } catch (error) {
    logger.error("❌ Erro ao salvar grupo no banco:", error);
    throw error;
  }
}

/* 
Salva os participantes do grupo no banco de dados.
Utiliza INSERT IGNORE para prevenir erros ao inserir entradas duplicadas.
*/
async function saveGroupParticipantsToDB(groupMeta) {
  try {
    for (const participant of groupMeta.participants) {
      const isAdmin = participant.admin === "admin" ? 1 : 0;
      const query = `
        INSERT IGNORE INTO group_participants (group_id, participant, isAdmin)
        VALUES (?, ?, ?)
      `;
      await runQuery(query, [groupMeta.id, participant.id, isAdmin]);
    }
    logger.info("✅ Participantes do grupo salvos:", groupMeta.id);
  } catch (error) {
    logger.error("❌ Erro ao salvar participantes do grupo:", error);
    throw error;
  }
}

/* 
Processa os dados recebidos do usuário.
Se a mensagem for de grupo, também processa os metadados e participantes do grupo.
*/
async function processUserData(data, client) {
  try {
    /* Extrai a primeira mensagem do payload de dados */
    const info = data.messages[0];
    if (info?.key?.fromMe === true) return;
    await saveUserToDB(info);

    /* Se for mensagem de grupo, processa os metadados do grupo */
    const from = info?.key?.remoteJid;
    if (from?.endsWith("@g.us")) {
      try {
        const groupMeta = await client.groupMetadata(from);
        await saveGroupToDB(groupMeta);
        await saveGroupParticipantsToDB(groupMeta);
      } catch (gError) {
        logger.error("❌ Erro ao processar os dados do grupo:", gError);
      }
    }
  } catch (error) {
    logger.error("❌ Erro ao processar os dados do usuário:", error);
    throw error;
  }
}

module.exports = processUserData;
