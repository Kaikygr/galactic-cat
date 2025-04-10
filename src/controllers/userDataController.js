/**
 * Inicializa e cria as tabelas necessárias no banco de dados (ou seja, groups, users, group_participants).
 *
 * @async
 * @function createTables
 * @throws {Error} Se a conexão com o banco de dados falhar ou ocorrer um erro na criação das tabelas.
 */

/**
 * Garante que a conexão com o banco de dados está ativa. Se não estiver, inicializa uma nova conexão.
 *
 * @async
 * @function ensureDatabaseConnection
 * @throws {Error} Se a inicialização da conexão falhar.
 */

/**
 * Executa uma consulta SQL com os parâmetros fornecidos usando prepared statements para evitar SQL injection.
 *
 * @async
 * @function runQuery
 * @param {string} query - A string da consulta SQL contendo placeholders.
 * @param {Array<*>} params - Array com os valores dos parâmetros a serem substituídos na consulta.
 * @returns {(number|Object)} O resultado da execução da consulta, geralmente um insertId ou um objeto de resultado.
 * @throws {Error} Se a execução da consulta falhar.
 */

/**
 * Verifica se um usuário é premium com base no campo 'isPremium' e na validade do campo 'premiumTemp'.
 *
 * @async
 * @function isUserPremium
 * @param {string} userId - O identificador único (sender) do usuário.
 * @returns {Promise<boolean>} Retorna true se o usuário for premium e o período premium ainda estiver válido, senão false.
 * @throws {Error} Se a consulta para verificar o status premium do usuário falhar.
 */

/**
 * Verifica se um grupo é premium com base no campo 'isPremium' e na validade do campo 'premiumTemp'.
 *
 * @async
 * @function isGroupPremium
 * @param {string} groupId - O identificador único do grupo.
 * @returns {Promise<boolean>} Retorna true se o grupo for premium e o período premium ainda estiver válido, senão false.
 * @throws {Error} Se a consulta para verificar o status premium do grupo falhar.
 */

/**
 * Salva a mensagem do usuário e as informações relacionadas no banco de dados. Também garante que o grupo exista;
 * caso contrário, cria um novo registro de grupo.
 *
 * @async
 * @function saveUserTodatabase
 * @param {Object} info - O objeto com informações da mensagem.
 * @param {Object} info.key - Contém chaves relacionadas à mensagem (ex: remoteJid, participant).
 * @param {string} [info.pushName] - O nome de exibição do usuário.
 * @param {Object} [info.message] - O objeto da mensagem propriamente dita.
 * @returns {Promise<(number|Object)>} O resultado da operação de inserção no banco de dados.
 * @throws {Error} Se as informações obrigatórias do remetente estiverem ausentes ou se a execução da consulta falhar.
 */

/**
 * Insere ou atualiza os metadados do grupo no banco de dados usando "ON DUPLICATE KEY UPDATE" para manter a consistência dos dados.
 *
 * @async
 * @function saveGroupTodatabase
 * @param {Object} groupMeta - Um objeto contendo os metadados do grupo.
 * @param {string} groupMeta.id - O identificador único do grupo.
 * @param {string} [groupMeta.subject] - O nome ou assunto do grupo.
 * @param {string} [groupMeta.owner] - O identificador do dono do grupo.
 * @param {number} [groupMeta.creation] - Timestamp Unix da criação do grupo.
 * @param {string} [groupMeta.desc] - A descrição do grupo.
 * @param {string} [groupMeta.descId] - Um identificador para a descrição.
 * @param {string} [groupMeta.subjectOwner] - Indica quem alterou o assunto do grupo.
 * @param {number} [groupMeta.subjectTime] - Timestamp Unix de quando o assunto foi definido.
 * @param {number} [groupMeta.size] - O tamanho (quantidade de membros) do grupo.
 * @param {*} [groupMeta.restrict] - Flag indicando se há restrições aplicadas ao grupo.
 * @param {*} [groupMeta.announce] - Flag indicando se os anúncios estão ativados no grupo.
 * @param {*} [groupMeta.isCommunity] - Flag indicando se o grupo é uma comunidade.
 * @param {*} [groupMeta.isCommunityAnnounce] - Flag indicando se anúncios da comunidade estão ativados.
 * @param {*} [groupMeta.joinApprovalMode] - Modo de aprovação para entrada no grupo.
 * @param {*} [groupMeta.memberAddMode] - Modo de adição de membros no grupo.
 * @param {*} [groupMeta.isPremium] - Flag indicando se o grupo é premium.
 * @param {number} [groupMeta.premiumTemp] - Timestamp Unix indicando quando expira o acesso premium.
 * @returns {Promise<(number|Object)>} O resultado da operação de inserção ou atualização no banco.
 * @throws {Error} Se o ID do grupo estiver ausente ou se a execução da consulta falhar.
 */

/**
 * Salva os participantes de um grupo no banco de dados usando INSERT IGNORE para evitar duplicações.
 *
 * @async
 * @function saveGroupParticipantsTodatabase
 * @param {Object} groupMeta - Um objeto contendo os metadados do grupo.
 * @param {string} groupMeta.id - O identificador único do grupo.
 * @param {Array<Object>} groupMeta.participants - Um array com objetos dos participantes.
 * @param {string} groupMeta.participants[].id - O identificador único de um participante.
 * @param {string} [groupMeta.participants[].admin] - Indica se o participante é admin ("admin", se verdadeiro).
 * @returns {Promise<void>}
 * @throws {Error} Se a consulta para inserir os participantes falhar.
 */

/**
 * Processa os dados do usuário recebidos. Salva mensagens de usuários e, no caso de mensagens em grupo,
 * busca e atualiza os metadados e participantes do grupo.
 *
 * @async
 * @function processUserData
 * @param {Object} data - O payload de dados recebidos contendo mensagens.
 * @param {Array<Object>} data.messages - Array de objetos de mensagens.
 * @param {Object} client - A instância do cliente usada para buscar metadados adicionais do grupo.
 * @returns {Promise<void>}
 * @throws {Error} Se o processamento dos dados do usuário ou a atualização dos dados do grupo falhar.
 */

const logger = require("../utils/logger");
const { initDatabase, connection } = require("../utils/processDatabase");
const moment = require("moment-timezone");
let database = connection;

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
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender VARCHAR(255) NOT NULL UNIQUE,
        pushName VARCHAR(255),
        isPremium TINYINT DEFAULT 0,
        premiumTemp DATETIME DEFAULT NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info("✅ Tabela 'users' criada/verificada com sucesso.");

    /* Cria a tabela 'messages' */
    await database.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id VARCHAR(255) NOT NULL,
        group_id VARCHAR(255),
        messageType VARCHAR(255),
        messageContent TEXT,
        timestamp DATETIME,
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
Inicializa a conexão com o banco de dados e cria as tabelas necessárias.
*/
initDatabase()
  .then(async connection => {
    database = connection;
    await createTables();
    logger.info("✅ Banco de dados inicializado e tabelas verificadas/criadas com sucesso.");
  })
  .catch(err => {
    logger.error(`❌ Erro crítico ao inicializar o MySQL.`, err);
    throw new Error(err);
  });

/* 
Garante que a conexão com o banco de dados esteja ativa.
Caso não esteja, inicializa a conexão.
*/
async function ensureDatabaseConnection() {
  if (!database) {
    logger.warn("⚠️ Conexão com o banco de dados não detectada. Tentando inicializar...");
    try {
      database = await initDatabase();
      if (!database) {
        throw new Error("Conexão retornou valor indefinido.");
      }
      logger.info("✅ Conexão com o banco de dados estabelecida com sucesso.");
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

    const retorno = result?.insertId ? result.insertId : result;
    //logger.debug(`🔄 Executando a query:\n${query}\n→ Parâmetros: ${JSON.stringify(params)}\n\n✅ Resultado da query:\n${JSON.stringify(retorno, null, 2)}`);

    return retorno;
  } catch (err) {
    logger.error(`❌ Erro ao executar a query:\n→ Query: ${query}\n→ Parâmetros: ${JSON.stringify(params)}\n→ Detalhes: ${err.message}`);
    throw new Error("Erro na execução da consulta ao banco de dados.");
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
async function saveUserTodatabase(info) {
  try {
    await ensureDatabaseConnection();

    if (!info || !info.key) {
      logger.error("❌ Erro: Dados da mensagem inválidos ou ausentes. Dados recebidos:", { info });
      throw new Error("Dados da mensagem inválidos ou ausentes.");
    }

    const from = info.key.remoteJid;
    const isGroup = from?.endsWith("@g.us") ? 1 : 0;
    const userId = isGroup ? info.key.participant : from;

    if (!userId) {
      logger.error("❌ Erro: 'sender' está nulo. Dados recebidos:", { info });
      throw new Error("Sender está nulo.");
    }

    let pushName = info.pushName || "Desconhecido";
    const timestamp = moment.tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");

    // Insere ou atualiza o usuário na tabela 'users'
    const userQuery = `
      INSERT INTO users (sender, pushName)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE pushName = VALUES(pushName)
    `;
    await runQuery(userQuery, [userId, pushName]);

    // Verifica se o grupo existe antes de salvar a mensagem
    const groupId = isGroup ? from : null;
    if (groupId) {
      const groupExistsQuery = `SELECT id FROM \`groups\` WHERE id = ?`;
      const groupExists = await runQuery(groupExistsQuery, [groupId]);

      if (!groupExists || groupExists.length === 0) {
        logger.warn(`Grupo '${groupId}' não encontrado. Criando grupo '${groupId}' com valores padrão.`);
        const defaultGroupData = {
          id: groupId,
          subject: "Grupo Desconhecido",
          owner: "Desconhecido",
          creation: moment().unix(),
        };
        await saveGroupTodatabase(defaultGroupData);
      }
    }

    // Insere a mensagem na tabela 'messages'
    const messageType = Object.keys(info.message || {})[0] || "tipo desconhecido";
    const messageContent = info.message?.[messageType] ? JSON.stringify(info.message[messageType]) : null;

    const messageQuery = `
      INSERT INTO messages (sender_id, group_id, messageType, messageContent, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await runQuery(messageQuery, [userId, groupId, messageType, messageContent, timestamp]);
    logger.info("✅ Mensagem salva no histórico do usuário:", userId);
    return result;
  } catch (error) {
    logger.error("❌ Erro ao salvar usuário/mensagem no banco:", error);
    throw new Error("Erro ao salvar usuário/mensagem no banco.");
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
