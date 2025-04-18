const { runQuery } = require("../database/processDatabase");
const logger = require("../utils/logger");
const moment = require("moment-timezone");
const crypto = require("crypto");

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
  },
  cache: {
    groupMetadataExpiryMs: 5 * 60 * 1000, // 5 minutos
  },
};

class GroupMetadataCache {
  /**
   * @param {number} [expiryMs=config.cache.groupMetadataExpiryMs] - Tempo de vida da entrada no cache em milissegundos.
   */
  constructor(expiryMs = config.cache.groupMetadataExpiryMs) {
    this.cache = new Map();
    this.expiryMs = expiryMs;
    logger.info(`[GroupMetadataCache] Inicializado com expiração: ${expiryMs}ms`);
  }

  /**
   * Armazena dados no cache.
   * @param {string} key - A chave do cache (por exemplo, ID do grupo).
   * @param {*} data - Os dados a serem armazenados no cache (por exemplo, objeto de metadados do grupo).
   */
  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    logger.debug(`[GroupMetadataCache] Cache definido para a chave: ${key}`);
  }

  /**
   * Recupera dados do cache se existirem e não tiverem expirado.
   * Exclui entradas expiradas ao acessar.
   * @param {string} key - A chave do cache.
   * @returns {*|null} Os dados em cache ou null se não encontrados ou expirados.
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      logger.debug(`[GroupMetadataCache] Falha no cache para a chave: ${key}`);
      return null;
    }

    if (Date.now() - entry.timestamp > this.expiryMs) {
      logger.debug(`[GroupMetadataCache] Cache expirado para a chave: ${key}. Excluindo.`);
      this.cache.delete(key);
      return null;
    }

    logger.debug(`[GroupMetadataCache] Cache encontrado para a chave: ${key}`);
    return entry.data;
  }

  /**
   * Remove uma entrada do cache.
   * @param {string} key - A chave do cache a ser excluída.
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug(`[GroupMetadataCache] Cache excluído para a chave: ${key}`);
    }
  }

  clear() {
    this.cache.clear();
    logger.info("[GroupMetadataCache] Cache limpo.");
  }
}

const groupMetadataCache = new GroupMetadataCache();

/**
 * Sanitiza valores de entrada para inserção no banco de dados.
 * Retorna o valor padrão se o valor de entrada for nulo ou indefinido.
 * @param {*} value - O valor a ser sanitizado.
 * @param {*} [defaultValue=null] - O valor padrão a ser retornado.
 * @returns {*} - O valor sanitizado ou o valor padrão.
 */
const sanitizeData = (value, defaultValue = null) => (value == null ? defaultValue : value);

/**
 * Formata um timestamp Unix (segundos), objeto Date ou string analisável em uma string DATETIME do MySQL.
 * Retorna null se a entrada for inválida ou nula/indefinida.
 * @param {number|Date|string|null|undefined} timestamp - A entrada do timestamp.
 * @returns {string|null} - String DATETIME formatada (YYYY-MM-DD HH:MM:SS) ou null.
 */
const formatTimestampForDB = timestamp => {
  if (timestamp == null) return null;
  let m = null;
  if (typeof timestamp === "number" && timestamp > 0) {
    m = moment.unix(timestamp); // Assume segundos
  } else if (timestamp instanceof Date) {
    m = moment(timestamp);
  } else {
    m = moment(timestamp);
  }
  return m.isValid() ? m.format("YYYY-MM-DD HH:mm:ss") : null;
};

/**
 * Valida campos essenciais do objeto de informações da mensagem recebida.
 * @param {object} info - O objeto de mensagem do evento do cliente WhatsApp.
 * @returns {{from: string, userId: string, isGroup: boolean, messageId: string}} - Identificadores validados.
 * @throws {Error} Se dados essenciais (key, remoteJid, userId) estiverem ausentes ou inválidos.
 */
const validateIncomingInfo = info => {
  if (!info?.key) {
    throw new Error("Dados da mensagem inválidos (sem chave).");
  }
  if (info.key.fromMe) {
    throw new Error("Mensagem própria ignorada.");
  }

  const from = info.key.remoteJid;
  if (!from || (!from.endsWith("@g.us") && !from.endsWith("@s.whatsapp.net"))) {
    throw new Error(`RemoteJid inválido ou não suportado: ${from}`);
  }

  const isGroup = from.endsWith("@g.us");
  const userId = isGroup ? sanitizeData(info.key.participant) : from;

  if (!userId) {
    throw new Error("ID do remetente (userId) não pôde ser determinado.");
  }

  const messageId = info.key.id || crypto.randomUUID();
  if (!info.key.id) {
    logger.warn(`[validateIncomingInfo] Mensagem sem ID original (key.id). Gerado UUID: ${messageId}`);
  }

  return { from, userId, isGroup, messageId };
};

/**
 * Cria as tabelas necessárias no banco de dados, se não existirem.
 * Deve ser chamado uma vez durante a inicialização do aplicativo *após* initDatabase ter sucesso.
 * Usa nomes de tabelas do objeto de configuração.
 * @throws {Error} Se a criação da tabela falhar.
 */
async function createTables() {
  logger.info("[ createTables ] 📦 Verificando e criando tabelas necessárias no banco de dados...");
  const { groups, users, messages, participants, commandUsage } = config.database.tables;
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
        premiumTemp DATETIME DEFAULT NULL
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
    logger.info(`[ createTables ] ✅ Tabela '${commandUsage}' verificada/criada.`);

    logger.info("[ createTables ] ✅ Verificação/criação de todas as tabelas concluída.");
  } catch (error) {
    logger.error(`[ createTables ] ❌ Erro crítico ao criar/verificar tabelas: ${error.message}`, { stack: error.stack });
    throw new Error(`Falha ao inicializar tabelas do banco de dados: ${error.message}`);
  }
}

/**
 * Salva ou atualiza as informações do usuário no banco de dados.
 * @param {string} userId - O JID do usuário.
 * @param {string|null|undefined} pushName - O nome de exibição do usuário.
 * @throws {Error} Se a consulta ao banco de dados falhar.
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
    logger.debug(`[ saveUserToDatabase ] Usuário salvo/atualizado: ${userId}`);
  } catch (error) {
    logger.error(`[ saveUserToDatabase ] ❌ Erro ao salvar usuário ${userId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

/**
 * Salva ou atualiza os metadados do grupo no banco de dados.
 * @param {object} groupMeta - O objeto de metadados do grupo do cliente WhatsApp.
 * @param {string} groupMeta.id - JID do grupo.
 * @param {string} [groupMeta.subject] - Nome do grupo.
 * @param {string} [groupMeta.owner] - JID do dono do grupo.
 * @param {number|Date} [groupMeta.creation] - Timestamp de criação do grupo.
 * @param {string} [groupMeta.desc] - Descrição do grupo.
 * @param {string} [groupMeta.descId] - ID da descrição.
 * @param {string} [groupMeta.subjectOwner] - JID do usuário que definiu o título.
 * @param {number|Date} [groupMeta.subjectTime] - Timestamp da alteração do título.
 * @param {number} [groupMeta.size] - Número de participantes.
 * @param {boolean} [groupMeta.restrict] - Apenas admins podem alterar configurações.
 * @param {boolean} [groupMeta.announce] - Apenas admins podem enviar mensagens.
 * @param {boolean} [groupMeta.isCommunity] - Se é uma comunidade.
 * @param {boolean} [groupMeta.isCommunityAnnounce] - Se é o grupo de anúncios da comunidade.
 * @param {boolean} [groupMeta.joinApprovalMode] - Aprovação necessária para entrar.
 * @param {boolean} [groupMeta.memberAddMode] - Configuração do modo de adicionar membros.
 * @param {boolean} [groupMeta.isPremium] - Flag personalizada premium (se utilizada).
 * @param {Date|string} [groupMeta.premiumTemp] - Data de expiração premium (se utilizada).
 * @throws {Error} Se o ID do grupo estiver ausente ou a consulta ao banco de dados falhar.
 */
async function saveGroupToDatabase(groupMeta) {
  const groupId = groupMeta?.id;
  if (!groupId) {
    logger.error("[ saveGroupToDatabase ] ❌ Erro: ID do grupo ausente.", { groupMeta });
    throw new Error("ID do grupo ausente nos metadados fornecidos.");
  }

  logger.debug(`[ saveGroupToDatabase ] Processando metadados do grupo: ${groupId}`);

  try {
    const values = [groupId, sanitizeData(groupMeta.subject, config.defaults.groupSubject), sanitizeData(groupMeta.owner, config.defaults.groupOwner), formatTimestampForDB(groupMeta.creation), sanitizeData(groupMeta.desc, config.defaults.groupDesc), sanitizeData(groupMeta.descId, config.defaults.descId), sanitizeData(groupMeta.subjectOwner, config.defaults.subjectOwner), formatTimestampForDB(groupMeta.subjectTime), groupMeta.size || 0, groupMeta.restrict ? 1 : 0, groupMeta.announce ? 1 : 0, groupMeta.isCommunity ? 1 : 0, groupMeta.isCommunityAnnounce ? 1 : 0, groupMeta.joinApprovalMode ? 1 : 0, groupMeta.memberAddMode ? 1 : 0, groupMeta.isPremium ? 1 : 0, formatTimestampForDB(groupMeta.premiumTemp)];

    const query = `
      INSERT INTO \`${config.database.tables.groups}\` (
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
    throw error;
  }
}
/**
 * Salva ou atualiza as informações dos participantes do grupo.
 * Usa INSERT IGNORE em massa para eficiência, gerando múltiplos grupos de valores.
 * Recorre a inserções individuais se a inserção em massa falhar.
 * @param {string} groupId - O ID do grupo.
 * @param {Array<object>} participants - Array de objetos de participantes (por exemplo, [{ id: 'jid', admin: 'admin'|'superadmin'|null }]).
 * @throws {Error} Se a consulta ao banco de dados falhar criticamente após o fallback.
 */
async function saveGroupParticipantsToDatabase(groupId, participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    logger.debug(`[ saveGroupParticipantsToDatabase ] Sem participantes para salvar no grupo ${groupId}.`);
    return;
  }

  const values = participants.map(p => [groupId, p.id, p.admin === "admin" || p.admin === "superadmin" ? 1 : 0]);

  if (values.length === 0) {
    return;
  }

  const placeholders = values.map(() => "(?, ?, ?)").join(", ");

  const bulkQuery = `
    INSERT IGNORE INTO ${config.database.tables.participants} (group_id, participant, isAdmin)
    VALUES ${placeholders};
  `;

  const flatValues = values.flat();

  try {
    await runQuery(bulkQuery, flatValues);
    logger.debug(`[ saveGroupParticipantsToDatabase ] ✅ Tentativa de inserção em massa para ${values.length} participantes do grupo ${groupId} concluída (inseridos/ignorados).`);
  } catch (error) {
    logger.warn(`[ saveGroupParticipantsToDatabase ] Inserção em massa falhou para ${groupId}, tentando individualmente: ${error.message}`);

    const individualQuery = `
      INSERT IGNORE INTO ${config.database.tables.participants} (group_id, participant, isAdmin)
      VALUES (?, ?, ?);
    `;
    let successCount = 0;
    let failCount = 0;
    for (const participantData of values) {
      try {
        await runQuery(individualQuery, participantData);
        successCount++;
      } catch (individualError) {
        failCount++;
        logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Erro ao salvar participante individual ${participantData[1]} para grupo ${groupId}: ${individualError.message}`);
      }
    }
    if (failCount > 0 && successCount === 0) {
      logger.error(`[ saveGroupParticipantsToDatabase ] ❌ Falha crítica: Inserção em massa e todas as inserções individuais falharam para o grupo ${groupId}.`);
    }
  }
}
/**
 * Garante que um grupo exista na tabela 'groups'. Se não, insere uma entrada mínima.
 * Crucial para restrições de chave estrangeira ao salvar mensagens ou participantes *antes* que os metadados completos sejam buscados.
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
        INSERT IGNORE INTO \`${config.database.tables.groups}\` (id, name, owner, created_at)
        VALUES (?, ?, ?, ?);
      `;
      await runQuery(insertQuery, [groupId, config.defaults.groupSubject, config.defaults.groupOwner, moment().format("YYYY-MM-DD HH:mm:ss")]);
      logger.info(`[ ensureGroupExists ] ✅ Entrada mínima criada para o grupo ${groupId}.`);
    }
    return groupId;
  } catch (error) {
    logger.error(`[ ensureGroupExists ] ❌ Erro ao verificar/criar grupo ${groupId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

/**
 * Salva os detalhes da mensagem no banco de dados.
 * Nota: Salvar todo o conteúdo da mensagem (especialmente metadados de mídia ou JSON grande)
 * pode aumentar significativamente o tamanho do banco de dados e potencialmente impactar o desempenho.
 * Considere filtrar quais mensagens/tipos de conteúdo são salvos com base nos requisitos.
 *
 * @param {object} messageData - Objeto contendo detalhes da mensagem.
 * @param {string} messageData.messageId - O ID único da mensagem.
 * @param {string} messageData.userId - O JID do remetente.
 * @param {string|null} messageData.groupId - O JID do grupo se for uma mensagem de grupo, caso contrário, null.
 * @param {string} messageData.messageType - O tipo da mensagem (por exemplo, 'conversation', 'imageMessage').
 * @param {string|null} messageData.messageContent - O conteúdo da mensagem (geralmente JSON stringificado).
 * @param {string} messageData.timestamp - O timestamp da mensagem (YYYY-MM-DD HH:mm:ss).
 * @throws {Error} Se a consulta ao banco de dados falhar.
 */
async function saveMessageToDatabase(messageData) {
  const { messageId, userId, groupId, messageType, messageContent, timestamp } = messageData;

  if (!messageId || !userId || !messageType || !timestamp) {
    logger.error("[ saveMessageToDatabase ] ❌ Dados da mensagem incompletos no momento de salvar.", messageData);
    throw new Error("Dados da mensagem incompletos para salvar no banco de dados.");
  }

  const query = `
    INSERT INTO ${config.database.tables.messages} (message_id, sender_id, group_id, messageType, messageContent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE -- Evita erros duplicados se a mensagem for processada duas vezes
      messageType = VALUES(messageType),
      messageContent = VALUES(messageContent);
  `;
  try {
    await runQuery(query, [messageId, userId, groupId, messageType, messageContent, timestamp]);
    logger.debug(`[ saveMessageToDatabase ] ✅ Mensagem ${messageId} salva para usuário ${userId}.`);
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      if (error.message.includes("fk_sender_id")) {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Usuário ${userId} não encontrado em '${config.database.tables.users}'. Mensagem ${messageId} não salva.`);
      } else if (error.message.includes("fk_group_id")) {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK: Grupo ${groupId} não encontrado em '${config.database.tables.groups}'. Mensagem ${messageId} não salva.`);
      } else {
        logger.error(`[ saveMessageToDatabase ] ❌ Erro FK desconhecido ao salvar mensagem ${messageId}: ${error.message}`, { stack: error.stack });
      }
    } else {
      logger.error(`[ saveMessageToDatabase ] ❌ Erro ao salvar mensagem ${messageId}: ${error.message}`, { stack: error.stack });
    }
    throw error;
  }
}

/**
 * Processa os dados da mensagem recebida: valida, salva o usuário, garante que o grupo exista (se aplicável) e salva a mensagem.
 * @param {object} info - O objeto de mensagem do evento do cliente WhatsApp.
 * @returns {Promise<{userId: string, groupId: string|null, messageId: string}>} Objeto com identificadores chave.
 * @throws {Error} Se o processamento falhar em qualquer etapa (validação, interação com o banco de dados).
 */
async function processIncomingMessageData(info) {
  let validatedData;
  try {
    validatedData = validateIncomingInfo(info);
  } catch (validationError) {
    if (validationError.message !== "Mensagem própria ignorada.") {
      logger.warn(`[ processIncomingMessageData ] ⚠️ Validação falhou: ${validationError.message}`, { key: info?.key });
    }
    throw validationError;
  }

  const { from, userId, isGroup, messageId } = validatedData;
  const pushName = info.pushName;

  try {
    await saveUserToDatabase(userId, pushName);
  } catch (userSaveError) {
    logger.error(`[ processIncomingMessageData ] ❌ Falha ao salvar usuário ${userId}, continuando se possível: ${userSaveError.message}`);
  }

  let groupId = null;
  if (isGroup) {
    try {
      groupId = await ensureGroupExists(from);
    } catch (groupEnsureError) {
      logger.error(`[ processIncomingMessageData ] ❌ Falha crítica ao garantir a existência do grupo ${from}. Não é possível salvar a mensagem: ${groupEnsureError.message}`);
      throw groupEnsureError;
    }
  }

  try {
    const messageType = Object.keys(info.message || {})[0] || "unknown";
    let messageContent = null;
    if (info.message && info.message[messageType]) {
      try {
        messageContent = JSON.stringify(info.message[messageType]);
      } catch (stringifyError) {
        logger.warn(`[ processIncomingMessageData ] ⚠️ Falha ao stringificar conteúdo da mensagem tipo ${messageType} (ID: ${messageId}). Salvando placeholder: ${stringifyError.message}`);
        messageContent = `{"error": "Falha ao stringificar conteúdo: ${stringifyError.message}"}`;
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
    logger.error(`[ processIncomingMessageData ] ❌ Erro final ao salvar a mensagem ${messageId} para ${userId}: ${messageSaveError.message}`);
    throw messageSaveError;
  }
}

/**
 * Lida com a busca, cache e salvamento de metadados completos do grupo e participantes.
 * @param {string} groupId - O JID do grupo.
 * @param {object} client - A instância do cliente WhatsApp inicializada (por exemplo, Baileys).
 * @throws {Error} Se o cliente for inválido ou a busca/salvamento falhar criticamente.
 */
async function handleGroupMetadataUpdate(groupId, client) {
  logger.debug(`[ handleGroupMetadataUpdate ] Verificando metadados para o grupo: ${groupId}`);

  if (!client || typeof client.groupMetadata !== "function") {
    logger.error(`[ handleGroupMetadataUpdate ] ❌ Cliente WhatsApp inválido ou método groupMetadata não disponível para ${groupId}.`);
    return;
  }

  const cachedData = groupMetadataCache.get(groupId);
  if (cachedData) {
    return;
  }

  logger.info(`[ handleGroupMetadataUpdate ] 🔄 Cache expirado ou ausente. Buscando novos metadados para o grupo: ${groupId}`);
  try {
    const groupMeta = await client.groupMetadata(groupId);

    if (!groupMeta || !groupMeta.id) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Não foi possível obter metadados válidos para o grupo ${groupId}. O bot ainda está no grupo? Removendo do cache.`);
      groupMetadataCache.delete(groupId);
      return;
    }

    groupMetadataCache.set(groupId, groupMeta);
    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados do grupo ${groupId} obtidos e cacheados.`);

    await saveGroupToDatabase(groupMeta);
    if (Array.isArray(groupMeta.participants)) {
      await saveGroupParticipantsToDatabase(groupId, groupMeta.participants);
    } else {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Metadados do grupo ${groupId} não continham um array de participantes válido.`);
    }

    logger.info(`[ handleGroupMetadataUpdate ] ✅ Metadados e participantes do grupo ${groupId} salvos no banco de dados.`);
  } catch (fetchSaveError) {
    if (fetchSaveError.message?.includes("group not found") || fetchSaveError.output?.statusCode === 404) {
      logger.warn(`[ handleGroupMetadataUpdate ] ⚠️ Grupo ${groupId} não encontrado ao buscar metadados (provavelmente o bot saiu). Removendo do cache.`);
      groupMetadataCache.delete(groupId);
    } else {
      logger.error(`[ handleGroupMetadataUpdate ] ❌ Erro ao buscar/salvar metadados do grupo ${groupId}: ${fetchSaveError.message}`, { stack: fetchSaveError.stack });
    }
  }
}

/**
 * Função principal para processar dados de usuários e grupos a partir de eventos recebidos do WhatsApp.
 * Orquestra validação, salvamento de usuário/mensagem e atualizações de metadados de grupo.
 * @param {object} data - Os dados brutos do evento contendo mensagens (por exemplo, do 'messages.upsert' do Baileys).
 * @param {object} client - A instância do cliente WhatsApp inicializada.
 */
async function processUserData(data, client) {
  if (!data?.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
    logger.debug("[ processUserData ] Payload sem mensagens válidas para processar.", { data });
    return;
  }

  for (const info of data.messages) {
    let messageId = info?.key?.id || "N/A";
    try {
      const { groupId } = await processIncomingMessageData(info);
      messageId = info.key?.id || messageId;
      if (groupId) {
        await handleGroupMetadataUpdate(groupId, client);
      }
    } catch (error) {
      if (error.message !== "Mensagem própria ignorada.") {
        logger.error(`[ processUserData ] ❌ Erro ao processar dados para a mensagem ${messageId}: ${error.message}`, { stack: error.stack, messageKey: info?.key });
      }
    }
  }
}

module.exports = {
  createTables,
  processUserData,
  groupMetadataCache,
};
