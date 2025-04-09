/**
 * Inicializa e verifica as tabelas necessárias do banco de dados.
 * Esta função cria as seguintes tabelas, caso elas não existam:
 * - `groups` para armazenar os metadados dos grupos.
 * - `users` para armazenar as mensagens dos usuários.
 * - `group_participants` para armazenar os participantes dos grupos.
 * Registra cada ação e lança um erro se ocorrer alguma falha na criação ou verificação das tabelas.
 *
 * @async
 * @function createTables
 * @throws {Error} Se ocorrer um erro ao criar ou verificar as tabelas.
 */

/**
 * Garante que a conexão com o banco de dados esteja ativa.
 * Se a conexão (`db`) não estiver inicializada, ela será iniciada utilizando initDatabase.
 *
 * @async
 * @function ensureDatabaseConnection
 * @throws {Error} Se a conexão com o banco de dados falhar ao iniciar.
 */

/**
 * Executa uma query SQL com parâmetros utilizando placeholders para prevenir ataques de SQL Injection.
 *
 * @async
 * @function runQuery
 * @param {string} query - A query SQL a ser executada.
 * @param {Array<*>} params - Os parâmetros que serão injetados de forma segura na query.
 * @returns {Promise<*>} O insertId da operação, se disponível, ou o resultado da query.
 * @throws {Error} Se a query falhar ao ser executada.
 */

/**
 * Salva os dados da mensagem de um usuário no banco de dados.
 * Processa o remetente, determina se a mensagem é de um grupo ou privada,
 * garante que o grupo exista no banco (criando-o se necessário) e insere o registro.
 *
 * @async
 * @function saveUserToDB
 * @param {Object} info - Os dados da mensagem.
 * @param {Object} info.key - Contém os identificadores do remetente e possivelmente do grupo.
 * @param {string} [info.pushName] - O nome de exibição do remetente.
 * @param {Object} info.message - A mensagem, onde a chave representa o tipo da mensagem.
 * @param {number} info.messageTimestamp - Timestamp UNIX (em segundos) de quando a mensagem foi enviada.
 * @returns {Promise<*>} O resultado da operação de inserção na tabela `users`.
 * @throws {Error} Se houver falha ao salvar os dados da mensagem/usuário.
 */

/**
 * Salva ou atualiza os metadados de um grupo no banco de dados.
 * Utiliza uma query INSERT com ON DUPLICATE KEY UPDATE para inserir um novo grupo ou atualizar um existente.
 *
 * @async
 * @function saveGroupToDB
 * @param {Object} groupMeta - O objeto com os metadados do grupo.
 * @param {string} groupMeta.id - O identificador único do grupo.
 * @param {string} [groupMeta.subject] - O nome ou assunto do grupo.
 * @param {string} [groupMeta.owner] - O identificador do dono do grupo.
 * @param {number} [groupMeta.creation] - Timestamp UNIX (em segundos) representando a data de criação do grupo.
 * @param {string} [groupMeta.desc] - A descrição do grupo.
 * @returns {Promise<*>} O resultado da operação de inserção ou atualização.
 * @throws {Error} Se houver falha ao salvar ou atualizar os dados do grupo.
 */

/**
 * Salva os participantes de um grupo no banco de dados.
 * Insere cada participante na tabela `group_participants` utilizando INSERT IGNORE para evitar duplicações.
 *
 * @async
 * @function saveGroupParticipantsToDB
 * @param {Object} groupMeta - O objeto com os metadados do grupo que inclui os participantes.
 * @param {string} groupMeta.id - O identificador único do grupo.
 * @param {Array<Object>} groupMeta.participants - Um array contendo objetos dos participantes.
 * @param {string} groupMeta.participants[].id - O identificador do participante.
 * @param {string} groupMeta.participants[].admin - O papel do participante (espera-se "admin" para administradores).
 * @returns {Promise<void>}
 * @throws {Error} Se houver falha ao salvar os participantes.
 */

/**
 * Processa os dados do usuário recebidos.
 * Extrai a primeira mensagem, salva a mensagem do usuário no banco de dados,
 * e, se a mensagem for de um grupo, recupera e salva os metadados e os dados dos participantes do grupo.
 *
 * @async
 * @function processUserData
 * @param {Object} data - O objeto contendo os dados da mensagem.
 * @param {Array<Object>} data.messages - Um array contendo os objetos das mensagens.
 * @param {Object} client - A instância do cliente utilizada para recuperar os metadados do grupo.
 * @returns {Promise<void>}
 * @throws {Error} Se houver falha ao processar os dados do usuário ou do grupo.
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
