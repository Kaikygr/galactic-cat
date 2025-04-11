// Importação de dependências necessárias
const logger = require("../utils/logger");
const { initDatabase, connection, runQuery } = require("../utils/processDatabase");
const moment = require("moment-timezone");
const crypto = require("crypto");

// Variáveis globais para controle de conexão
let database = connection;
let databaseInitialized = false;

/**
 * Sanitiza dados de entrada, substituindo valores nulos por um valor padrão
 * @param {*} value - Valor a ser sanitizado
 * @param {string} defaultValue - Valor padrão caso o input seja nulo
 * @returns {*} Valor sanitizado
 */
const sanitizeData = (value, defaultValue = "") => (value == null ? defaultValue : value);

/**
 * Cria as tabelas necessárias no banco de dados se não existirem
 * @async
 * @throws {Error} Se houver erro na criação das tabelas
 */
async function createTables() {
  try {
    if (!database) {
      logger.info("[ createTables ] 🔄 Inicializando conexão com o banco de dados...");

      try {
        database = await initDatabase();

        if (!database) {
          throw new Error("[ createTables ] ❌ A função 'initDatabase' vinda de 'processDatabase' retornou nulo ou indefinido.");
        }
      } catch (error) {
        logger.error(`[ createTables ] ❌ Erro ao conectar ao banco de dados segue abaixo o motivo do error:\n → Error:${error}`);
        throw error;
      }
    }

    logger.info("[ createTables ] 📦 Verificando e criando tabelas necessárias no banco de dados...");

    await database.execute(`
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
        \`restrict\` TINYINT,
        announce TINYINT,
        is_community TINYINT,
        is_community_announce TINYINT,
        join_approval_mode TINYINT,
        member_add_mode TINYINT,
        isPremium TINYINT DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("[ createTables ] ✅ Tabela 'groups' foi verificada a sua exitencia ou criada com sucesso.");

    await database.execute(`
      CREATE TABLE IF NOT EXISTS users (
        sender VARCHAR(255) PRIMARY KEY,
        pushName VARCHAR(255),
        isPremium TINYINT DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("[ createTables ] ✅ Tabela 'users' foi verificada a sua exitencia ou criada com sucesso.");

    await database.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id VARCHAR(255),
        sender_id VARCHAR(255) NOT NULL,
        group_id VARCHAR(255),
        messageType VARCHAR(255),
        messageContent TEXT,
        timestamp DATETIME,
        PRIMARY KEY (sender_id, timestamp, message_id),
        CONSTRAINT fk_sender_id FOREIGN KEY (sender_id) REFERENCES users(sender) ON DELETE CASCADE,
        CONSTRAINT fk_group_id FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE SET NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("[ createTables ] ✅ Tabela 'messages foi verificada a sua exitencia ou criada com sucesso.");

    await database.execute(`
      CREATE TABLE IF NOT EXISTS group_participants (
        group_id VARCHAR(255) NOT NULL,
        participant VARCHAR(255) NOT NULL,
        isAdmin TINYINT,
        PRIMARY KEY (group_id, participant),
        CONSTRAINT fk_group_participants FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("[ createTables ] ✅ Tabela 'group_participants' foi verificada a sua exitencia ou criada com sucesso.");
  } catch (error) {
    logger.error(`[ createTables ] ❌ Erro crítico ao criar ou verificar as tabelas no banco de dados.\n → Error:${error}`);
    throw new Error(error);
  }
}

/**
 * Garante que existe uma conexão ativa com o banco de dados
 * @async
 * @throws {Error} Se não for possível estabelecer conexão
 */
async function ensureDatabaseConnection() {
  if (!database || !databaseInitialized) {
    logger.warn("[ ensureDatabaseConnection ] ⚠️ Conexão com o banco de dados não detectada. Tentando inicializar...");
    try {
      database = await initDatabase();
      if (!database) {
        throw new Error("[ ensureDatabaseConnection ] Conexão retornou valor indefinido.");
      }
      await createTables();
      databaseInitialized = true;
      logger.info("[ ensureDatabaseConnection ] ✅ Conexão com o banco de dados estabelecida e tabelas verificadas com sucesso.");
    } catch (error) {
      logger.error(`[ ensureDatabaseConnection ] ❌ Erro crítico: não foi possível estabelecer a conexão com o banco de dados.\n → Error:${error}`);
      throw new Error(error);
    }
  }
}

/**
 * Salva ou atualiza informações do usuário no banco de dados
 * @async
 * @param {string} userId - ID do usuário
 * @param {string} pushName - Nome do usuário
 */
async function saveUserToDatabase(userId, pushName = "Desconhecido") {
  const query = `
    INSERT INTO users (sender, pushName)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE pushName = VALUES(pushName)
  `;
  await runQuery(query, [userId, pushName]);
  logger.info(`[ saveUserToDatabase ] ✅ Usuário atualizado: ${userId}`);
}

/**
 * Verifica e salva um grupo se ele não existir no banco de dados
 * @async
 * @param {string} groupId - ID do grupo
 * @returns {string} ID do grupo
 * @throws {Error} Se houver erro ao criar o grupo
 */
async function saveGroupIfNotExists(groupId) {
  try {
    const groupExistsQuery = `SELECT id FROM \`groups\` WHERE id = ?`;
    const groupExists = await runQuery(groupExistsQuery, [groupId]);

    if (!groupExists || groupExists.length === 0) {
      logger.warn(`[ saveGroupIfNotExists ] Grupo '${groupId}' não encontrado. Criando com valores padrão.`);
      const defaultGroupData = {
        id: groupId,
        subject: "Grupo Desconhecido",
        owner: "Desconhecido",
        creation: moment().unix(),
      };
      await saveGroupTodatabase(defaultGroupData);
    }
    return groupId;
  } catch (error) {
    logger.error(`[ saveGroupIfNotExists ] ❌ Error ao criar grupo: ${error}`);
    throw error;
  }
}

/**
 * Salva uma mensagem no banco de dados
 * @async
 * @param {Object} messageData - Dados da mensagem
 * @param {string} messageData.messageId - ID da mensagem
 * @param {string} messageData.userId - ID do usuário
 * @param {string} messageData.groupId - ID do grupo
 * @param {string} messageData.messageType - Tipo da mensagem
 * @param {string} messageData.messageContent - Conteúdo da mensagem
 * @param {string} messageData.timestamp - Timestamp da mensagem
 * @throws {Error} Se houver erro ao salvar a mensagem
 */
async function saveMessageToDatabase(messageData) {
  try {
    const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;

    const query = `
      INSERT INTO messages (message_id, sender_id, group_id, messageType, messageContent, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
    logger.info(`[ saveMessageToDatabase ] ✅ Mensagem salva para o usuário: ${userId}`);
  } catch (error) {
    logger.error(`[ saveMessageToDatabase ] ❌ Erro ao salvar mensagem: ${error}`);
    throw error;
  }
}

/**
 * Processa e salva dados do usuário a partir de uma mensagem
 * @async
 * @param {Object} info - Informações da mensagem
 * @returns {boolean} True se processado com sucesso
 * @throws {Error} Se houver erro no processamento
 */
async function saveUserTodatabase(info) {
  try {
    await ensureDatabaseConnection();

    if (!info?.key) {
      logger.error("[ saveUserTodatabase ] ❌ Dados da mensagem inválidos:", { info });
      throw new Error("Dados da mensagem inválidos.");
    }

    const from = info.key.remoteJid;
    if (!from || (!from.endsWith("@g.us") && !from.endsWith(".net"))) {
      logger.error("[ saveUserTodatabase ] ❌ RemoteJid inválido:", { from });
      return;
    }

    const isGroup = from.endsWith("@g.us") ? 1 : 0;
    const userId = isGroup ? info.key.participant : from;

    if (!userId) {
      logger.error("[ saveUserTodatabase ] ❌ Sender está nulo:", { info });
      return;
    }

    await saveUserToDatabase(userId, info.pushName);

    const groupId = isGroup ? await saveGroupIfNotExists(from) : null;

    const messageType = Object.keys(info.message || {})[0] || "tipo desconhecido";
    const messageContent = info.message?.[messageType] ? JSON.stringify(info.message[messageType]) : null;
    const timestamp = moment.tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");

    await saveMessageToDatabase({
      messageId: info.key.id || crypto.randomUUID(),
      userId,
      groupId,
      messageType,
      messageContent,
      timestamp,
    });

    return true;
  } catch (error) {
    logger.error("[ saveUserTodatabase ] ❌ Erro ao processar dados:", error);
    throw new Error("Erro ao processar dados.");
  }
}

/**
 * Salva ou atualiza metadados de um grupo no banco de dados
 * @async
 * @param {Object} groupMeta - Metadados do grupo
 * @returns {Object} Resultado da operação
 * @throws {Error} Se houver erro ao salvar os dados
 */
async function saveGroupTodatabase(groupMeta) {
  try {
    await ensureDatabaseConnection();
    const id = groupMeta.id;
    if (!id) {
      logger.error("[ saveGroupTodatabase ] ❌ Erro: ID do grupo ausente. Dados recebidos:", { groupMeta });
      throw new Error("ID do grupo ausente.");
    }

    logger.info("[ saveGroupTodatabase ] 🔄 Salvando metadados do grupo:", JSON.stringify(groupMeta, null, 2));

    const name = sanitizeData(groupMeta.subject, "Grupo Desconhecido");
    const owner = sanitizeData(groupMeta.owner, "Desconhecido");
    const createdAt = groupMeta.creation ? new Date(groupMeta.creation * 1000).toISOString().slice(0, 19).replace("T", " ") : new Date().toISOString().slice(0, 19).replace("T", " ");
    const description = sanitizeData(groupMeta.desc, "Sem descrição");
    const descriptionId = sanitizeData(groupMeta.descId, "Sem ID de descrição");
    const subjectOwner = sanitizeData(groupMeta.subjectOwner, "Desconhecido");
    const subjectTime = groupMeta.subjectTime ? new Date(groupMeta.subjectTime * 1000).toISOString().slice(0, 19).replace("T", " ") : null;
    const size = groupMeta.size || 0;
    const restrict = groupMeta.restrict ? 1 : 0;
    const announce = groupMeta.announce ? 1 : 0;
    const isCommunity = groupMeta.isCommunity ? 1 : 0;
    const isCommunityAnnounce = groupMeta.isCommunityAnnounce ? 1 : 0;
    const joinApprovalMode = groupMeta.joinApprovalMode ? 1 : 0;
    const member_add_mode = groupMeta.memberAddMode ? 1 : 0;
    const isPremium = groupMeta.isPremium ? 1 : 0;
    const premiumTemp = groupMeta.premiumTemp ? new Date(groupMeta.premiumTemp * 1000).toISOString().slice(0, 19).replace("T", " ") : null;

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
    const result = await runQuery(query, [id, name, owner, createdAt, description, descriptionId, subjectOwner, subjectTime, size, restrict, announce, isCommunity, isCommunityAnnounce, joinApprovalMode, member_add_mode, isPremium, premiumTemp]);
    logger.info("[ saveGroupTodatabase ]✅ Grupo salvo ou atualizado no banco de dados:", id);
    return result;
  } catch (error) {
    logger.error("[ saveGroupTodatabase ] ❌ Erro ao salvar ou atualizar grupo no banco de dados:", error);
    throw error;
  }
}

/**
 * Salva os participantes de um grupo no banco de dados
 * @async
 * @param {Object} groupMeta - Metadados do grupo contendo participantes
 * @throws {Error} Se houver erro ao salvar os participantes
 */
async function saveGroupParticipantsTodatabase(groupMeta) {
  try {
    for (const participant of groupMeta.participants) {
      const isAdmin = participant.admin === "admin" ? 1 : 0;
      const query = `
        INSERT IGNORE INTO group_participants (group_id, participant, isAdmin)
        VALUES (?, ?, ?)
      `;
      await runQuery(query, [groupMeta.id, participant.id, isAdmin]);
    }
    logger.info("[ saveGroupParticipantsTodatabase ]✅ Participantes do grupo salvos:", groupMeta.id);
  } catch (error) {
    logger.error("[ saveGroupParticipantsTodatabase ] ❌ Erro ao salvar participantes do grupo:", error);
    throw error;
  }
}

/**
 * Função principal que processa dados do usuário e do grupo
 * @async
 * @param {Object} data - Dados a serem processados
 * @param {Object} client - Cliente WhatsApp
 * @throws {Error} Se houver erro no processamento dos dados
 */
async function processUserData(data, client) {
  try {
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      logger.error("[ processUserData ] ❌ Dados inválidos ou ausentes no payload:", { data });
      throw new Error("Payload de dados inválido.");
    }

    const info = data.messages[0];
    if (info?.key?.fromMe === true) return;

    if (!info.key?.remoteJid) {
      logger.error("[ processUserData ] ❌ Erro: 'remoteJid' ausente na mensagem:", { info });
      throw new Error("remoteJid ausente na mensagem.");
    }

    await saveUserTodatabase(info);
    const from = info.key.remoteJid;

    if (from?.endsWith("@g.us")) {
      logger.info(`[ processUserData ] 🔄 Processando metadados do grupo: ${from}`);

      try {
        if (!client || typeof client.groupMetadata !== "function") {
          logger.error("[ processUserData ] ❌ Cliente WhatsApp inválido ou método groupMetadata não disponível");
          throw new Error("Cliente WhatsApp inválido");
        }

        const cacheKey = from;
        const cacheExpiry = 5 * 60 * 1000;

        let groupMeta;
        const cachedData = global.groupMetadataCache?.[cacheKey];
        const now = Date.now();

        if (cachedData && now - cachedData.timestamp < cacheExpiry) {
          logger.info(`[processUserData ] 📦 Usando metadados em cache para o grupo: ${from}`);
          groupMeta = cachedData.data;
        } else {
          logger.info(`[ processUserData ] 🔄 Buscando novos metadados para o grupo: ${from}`);
          try {
            groupMeta = await client.groupMetadata(from);

            if (!groupMeta || !groupMeta.id) {
              throw new Error("Metadados do grupo retornados são inválidos");
            }

            if (!global.groupMetadataCache) global.groupMetadataCache = {};
            global.groupMetadataCache[cacheKey] = {
              data: groupMeta,
              timestamp: now,
            };

            logger.info(`[ processUserData ] ✅ Metadados do grupo obtidos com sucesso: ${from}`);
          } catch (fetchError) {
            logger.error(`[ processUserData ] ❌ Erro ao buscar metadados do grupo ${from}:`, fetchError);
            throw fetchError;
          }
        }

        if (groupMeta) {
          logger.info(`[ processUserData ] 🔄 Salvando metadados do grupo ${from} no banco de dados`);
          await saveGroupTodatabase(groupMeta);
          await saveGroupParticipantsTodatabase(groupMeta);
          logger.info(`[ processUserData ] ✅ Metadados do grupo ${from} salvos com sucesso`);
        }
      } catch (gError) {
        logger.error(`[processUserData ]❌ Erro ao processar grupo ${from}:`, gError);
      }
    }
  } catch (error) {
    logger.error("[ processUserData ] ❌ Erro ao processar dados do usuário:", error);
    throw error;
  }
}

module.exports = processUserData;
