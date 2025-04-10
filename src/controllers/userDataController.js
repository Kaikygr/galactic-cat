const logger = require("../utils/logger");
const { initDatabase, connection } = require("../utils/processDatabase");
const moment = require("moment-timezone");
const crypto = require("crypto");
let database = connection;
let databaseInitialized = false;

const sanitizeData = (value, defaultValue = "") => (value == null ? defaultValue : value);

async function createTables() {
  try {
    /* Verifica se a conexão com o banco de dados está estabelecida */
    if (!database) {
      logger.info("🔄 Inicializando conexão com o banco de dados...");
      database = await initDatabase();
      if (!database) {
        logger.error("❌ Erro: Conexão com o banco de dados falhou.");
        throw new Error("Conexão com o banco de dados falhou.");
      }
    }

    logger.info("🔄 Criando/verificando tabelas no banco de dados...");

    /* Cria a tabela 'groups' */
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
    logger.info("✅ Tabela 'groups' criada/verificada com sucesso.");

    /* Cria a tabela 'users' */
    await database.execute(`
      CREATE TABLE IF NOT EXISTS users (
        sender VARCHAR(255) PRIMARY KEY,
        pushName VARCHAR(255),
        isPremium TINYINT DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("✅ Tabela 'users' criada/verificada com sucesso.");

    /* Cria a tabela 'messages' */
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
    logger.info("✅ Tabela 'messages' criada/verificada com sucesso.");

    /* Cria a tabela 'group_participants' */
    await database.execute(`
      CREATE TABLE IF NOT EXISTS group_participants (
        group_id VARCHAR(255) NOT NULL,
        participant VARCHAR(255) NOT NULL,
        isAdmin TINYINT,
        PRIMARY KEY (group_id, participant),
        CONSTRAINT fk_group_participants FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("✅ Tabela 'group_participants' criada/verificada com sucesso.");
  } catch (error) {
    logger.error("❌ Erro crítico ao criar ou verificar as tabelas no banco de dados.", error);
    throw new Error(error);
  }
}

/* 
Garante que a conexão com o banco de dados esteja ativa e as tabelas criadas.
*/
async function ensureDatabaseConnection() {
  if (!database || !databaseInitialized) {
    logger.warn("⚠️ Conexão com o banco de dados não detectada. Tentando inicializar...");
    try {
      database = await initDatabase();
      if (!database) {
        throw new Error("Conexão retornou valor indefinido.");
      }
      await createTables();
      databaseInitialized = true;
      logger.info("✅ Conexão com o banco de dados estabelecida e tabelas verificadas com sucesso.");
    } catch (error) {
      logger.error("❌ Erro crítico: não foi possível estabelecer a conexão com o banco de dados.", error);
      throw new Error("Error ao conectar ao banco de dados.");
    }
  }
}

/* 
Executa uma query com tratamento de erros e prevenção de SQL Injection usando placeholders.
*/
async function runQuery(query, params = []) {
  try {
    await ensureDatabaseConnection();
    const [result] = await database.execute(query, params);

    // Identifica o tipo de query pelo primeiro comando
    const queryType = query.trim().split(" ")[0].toUpperCase();
    const isIgnoreQuery = query.toUpperCase().includes("INSERT IGNORE");

    // Validações e retornos específicos por tipo de operação
    switch (queryType) {
      case "SELECT":
        if (!result || result.length === 0) {
          logger.debug(`⚠️ Nenhum resultado encontrado para a consulta`);
          return [];
        }
        return result;

      case "INSERT":
        // Se for INSERT IGNORE, não lança erro quando nenhuma linha é inserida
        if (!result.affectedRows && !isIgnoreQuery) {
          throw new Error("Nenhuma linha foi inserida");
        }
        return {
          insertId: result.insertId,
          affectedRows: result.affectedRows,
        };

      case "UPDATE":
      case "DELETE":
        if (!result.affectedRows) {
          logger.warn(`⚠️ Nenhuma linha foi afetada pela operação ${queryType}`);
        }
        return {
          affectedRows: result.affectedRows,
          changedRows: result.changedRows,
        };

      default:
        return result;
    }
  } catch (err) {
    logger.error(`❌ Erro ao executar a query:\n→ Query: ${query}\n→ Parâmetros: ${JSON.stringify(params)}\n→ Detalhes: ${err.message}`);
    throw new Error(`Erro na execução da consulta: ${err.message}`);
  }
}

/* 
Salva ou atualiza dados do usuário no banco.
*/
async function saveUserToDatabase(userId, pushName = "Desconhecido") {
  const query = `
    INSERT INTO users (sender, pushName)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE pushName = VALUES(pushName)
  `;
  await runQuery(query, [userId, pushName]);
  logger.info("✅ Usuário salvo/atualizado:", userId);
}

/* 
Verifica se grupo existe e cria com valores padrão se necessário.
*/
async function saveGroupIfNotExists(groupId) {
  const groupExistsQuery = `SELECT id FROM \`groups\` WHERE id = ?`;
  const groupExists = await runQuery(groupExistsQuery, [groupId]);

  if (!groupExists || groupExists.length === 0) {
    logger.warn(`Grupo '${groupId}' não encontrado. Criando com valores padrão.`);
    const defaultGroupData = {
      id: groupId,
      subject: "Grupo Desconhecido",
      owner: "Desconhecido",
      creation: moment().unix(),
    };
    await saveGroupTodatabase(defaultGroupData);
  }
  return groupId;
}

/* 
Salva uma mensagem no histórico.
*/
async function saveMessageToDatabase(messageData) {
  const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;

  const query = `
    INSERT INTO messages (message_id, sender_id, group_id, messageType, messageContent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
  logger.info("✅ Mensagem salva para o usuário:", userId);
}

/* 
Processa e salva os dados do usuário/mensagem.
*/
async function saveUserTodatabase(info) {
  try {
    await ensureDatabaseConnection();

    if (!info?.key) {
      logger.error("❌ Dados da mensagem inválidos:", { info });
      throw new Error("Dados da mensagem inválidos.");
    }

    const from = info.key.remoteJid;
    const isGroup = from?.endsWith("@g.us") ? 1 : 0;
    const userId = isGroup ? info.key.participant : from;

    if (!userId) {
      logger.error("❌ Sender está nulo:", { info });
      return null;
    }

    // Salva/atualiza dados do usuário
    await saveUserToDatabase(userId, info.pushName);

    // Verifica/cria grupo se necessário
    const groupId = isGroup ? await saveGroupIfNotExists(from) : null;

    // Prepara e salva a mensagem
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
    logger.error("❌ Erro ao processar dados:", error);
    throw new Error("Erro ao processar dados.");
  }
}

/* 
Salva ou atualiza as informações do grupo no banco de dados.
Utiliza ON DUPLICATE KEY UPDATE para prevenir duplicação e manter a integridade dos dados.
*/
async function saveGroupTodatabase(groupMeta) {
  try {
    await ensureDatabaseConnection();
    const id = groupMeta.id;
    if (!id) {
      logger.error("❌ Erro: ID do grupo ausente. Dados recebidos:", { groupMeta });
      throw new Error("ID do grupo ausente.");
    }

    // Log detalhado para verificar os metadados recebidos
    logger.info("🔄 Salvando metadados do grupo:", JSON.stringify(groupMeta, null, 2));

    // Extração e sanitização dos metadados do grupo
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

    // Query para salvar ou atualizar os metadados do grupo
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
    logger.info("✅ Grupo salvo ou atualizado no banco de dados:", id);
    return result;
  } catch (error) {
    logger.error("❌ Erro ao salvar ou atualizar grupo no banco de dados:", error);
    throw new Error("Erro ao salvar ou atualizar grupo no banco de dados.");
  }
}

/* 
Salva os participantes do grupo no banco de dados.
Utiliza INSERT IGNORE para prevenir erros ao inserir entradas duplicadas.
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
    logger.info("✅ Participantes do grupo salvos:", groupMeta.id);
  } catch (error) {
    logger.error("❌ Erro ao salvar participantes do grupo:", error);
    throw new Error("Erro ao salvar participantes do grupo.");
  }
}

/* 
Processa os dados recebidos do usuário.
Se a mensagem for de grupo, também processa os metadados e participantes do grupo.
*/
async function processUserData(data, client) {
  try {
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      logger.error("❌ Dados inválidos ou ausentes no payload:", { data });
      throw new Error("Payload de dados inválido.");
    }

    const info = data.messages[0];
    if (info?.key?.fromMe === true) return;

    if (!info.key?.remoteJid) {
      logger.error("❌ Erro: 'remoteJid' ausente na mensagem:", { info });
      throw new Error("remoteJid ausente na mensagem.");
    }

    await saveUserTodatabase(info);
    const from = info.key.remoteJid;

    // Se for uma mensagem de grupo
    if (from?.endsWith("@g.us")) {
      logger.info(`🔄 Processando metadados do grupo: ${from}`);

      try {
        // Verifica se o client está disponível
        if (!client || typeof client.groupMetadata !== "function") {
          logger.error("❌ Cliente WhatsApp inválido ou método groupMetadata não disponível");
          throw new Error("Cliente WhatsApp inválido");
        }

        // Sistema de cache com tempo de expiração
        const cacheKey = from;
        const cacheExpiry = 5 * 60 * 1000; // 5 minutos

        let groupMeta;
        const cachedData = global.groupMetadataCache?.[cacheKey];
        const now = Date.now();

        if (cachedData && now - cachedData.timestamp < cacheExpiry) {
          logger.info(`📦 Usando metadados em cache para o grupo: ${from}`);
          groupMeta = cachedData.data;
        } else {
          logger.info(`🔄 Buscando novos metadados para o grupo: ${from}`);
          try {
            groupMeta = await client.groupMetadata(from);

            if (!groupMeta || !groupMeta.id) {
              throw new Error("Metadados do grupo retornados são inválidos");
            }

            // Atualiza o cache
            if (!global.groupMetadataCache) global.groupMetadataCache = {};
            global.groupMetadataCache[cacheKey] = {
              data: groupMeta,
              timestamp: now,
            };

            logger.info(`✅ Metadados do grupo obtidos com sucesso: ${from}`);
          } catch (fetchError) {
            logger.error(`❌ Erro ao buscar metadados do grupo ${from}:`, fetchError);
            throw fetchError;
          }
        }

        if (groupMeta) {
          logger.info(`🔄 Salvando metadados do grupo ${from} no banco de dados`);
          await saveGroupTodatabase(groupMeta);
          await saveGroupParticipantsTodatabase(groupMeta);
          logger.info(`✅ Metadados do grupo ${from} salvos com sucesso`);
        }
      } catch (gError) {
        logger.error(`❌ Erro ao processar grupo ${from}:`, gError);
        // Não lança o erro para permitir que o processamento continue para outras mensagens
      }
    }
  } catch (error) {
    logger.error("❌ Erro ao processar dados do usuário:", error);
    throw error;
  }
}

module.exports = processUserData;
