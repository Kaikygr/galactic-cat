// Importa módulos necessários
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

// Define caminhos para os arquivos de dados
const groupDataFilePath = path.join(__dirname, "../data/groupData.json");
const userDataFilePath = path.join(__dirname, "../data/userData.json");

// Variáveis de cache e controle de mudanças
let groupDataCache = null;
let userDataCache = null;
let groupDataChanged = false;
let userDataChanged = false;

// Cache para metadados de grupos com TTL (Time To Live)
const groupMetadataCache = new Map();
const GROUP_METADATA_CACHE_TTL = 30000; // 30 segundos

// Caminho para a pasta de backups temporários
const BACKUP_FOLDER = path.join(__dirname, "../temp");

// TTL para o cache de dados
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
let groupDataCacheTimestamp = null;
let userDataCacheTimestamp = null;

// Função para verificar se o cache ainda é válido
function isCacheValid(cacheTimestamp) {
  return cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL;
}

// Funções para limpar caches específicos ou todos os caches
function clearGroupDataCache() {
  groupDataCache = null;
  groupDataCacheTimestamp = null;
  logger.info("Cache de groupData limpo.");
}

function clearUserDataCache() {
  userDataCache = null;
  userDataCacheTimestamp = null;
  logger.info("Cache de userData limpo.");
}

function clearAllCaches() {
  clearGroupDataCache();
  clearUserDataCache();
  logger.info("Todos os caches foram limpos.");
}

// Garante que o arquivo existe, criando-o com dados iniciais, se necessário
function ensureFileExists(filePath, initialData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
    logger.info(`Arquivo JSON criado: ${filePath}`);
  }
}

// Restaura backups em caso de falha ao carregar os dados
function restoreBackup(filePath, defaultData) {
  try {
    ensureBackupFolderExists();
    const backupFiles = fs
      .readdirSync(BACKUP_FOLDER)
      .filter(file => file.startsWith(path.basename(filePath)))
      .sort((a, b) => b.localeCompare(a)); // Ordena por timestamp decrescente

    for (const backupFile of backupFiles) {
      const backupPath = path.join(BACKUP_FOLDER, backupFile);
      try {
        const backupContent = fs.readFileSync(backupPath, "utf-8");
        const parsedData = JSON.parse(backupContent);
        logger.info(`Backup restaurado com sucesso: ${backupPath}`);
        return parsedData;
      } catch (error) {
        logger.warn(`Backup corrompido ignorado: ${backupPath}`);
      }
    }
  } catch (error) {
    logger.error("Erro ao restaurar backup:", error);
  }

  logger.warn("Nenhum backup válido encontrado. Usando dados padrão.");
  return defaultData;
}

// Carrega dados de grupos com validação de cache
function loadGroupData() {
  if (groupDataCache && isCacheValid(groupDataCacheTimestamp)) {
    return groupDataCache;
  }
  ensureFileExists(groupDataFilePath, {});
  try {
    const fileContent = fs.readFileSync(groupDataFilePath, "utf-8");
    groupDataCache = JSON.parse(fileContent);
    groupDataCacheTimestamp = Date.now(); // Atualiza o timestamp ao carregar
  } catch (error) {
    logger.error("Erro ao carregar groupData.json. Tentando restaurar backup...", error);
    groupDataCache = restoreBackup(groupDataFilePath, {});
    groupDataCacheTimestamp = Date.now(); // Atualiza o timestamp ao restaurar
  }
  return groupDataCache;
}

// Carrega dados de usuários com validação de cache
function loadUserData() {
  if (userDataCache && isCacheValid(userDataCacheTimestamp)) {
    return userDataCache;
  }
  ensureFileExists(userDataFilePath, { users: {} });
  try {
    const fileContent = fs.readFileSync(userDataFilePath, "utf-8");
    userDataCache = JSON.parse(fileContent);
    userDataCacheTimestamp = Date.now(); // Atualiza o timestamp ao carregar
  } catch (error) {
    logger.error("Erro ao carregar userData.json. Tentando restaurar backup...", error);
    userDataCache = restoreBackup(userDataFilePath, { users: {} });
    userDataCacheTimestamp = Date.now(); // Atualiza o timestamp ao restaurar
  }
  return userDataCache;
}

// Salva dados de grupos no cache e marca como alterados
function saveGroupData(groupData) {
  try {
    validateGroupData(groupData); // Valida os dados antes de salvar
    groupDataCache = groupData;
    groupDataCacheTimestamp = Date.now();
    groupDataChanged = true;
  } catch (error) {
    logger.error("Dados de grupo inválidos. Não foram salvos:", error);
  }
}

// Salva dados de usuários no cache e marca como alterados
function saveUserData(userData) {
  try {
    validateUserData(userData); // Valida os dados antes de salvar
    userDataCache = userData;
    userDataCacheTimestamp = Date.now();
    userDataChanged = true;
  } catch (error) {
    logger.error("Dados de usuário inválidos. Não foram salvos:", error);
  }
}

// Mescla objetos profundamente, preservando dados existentes
function mergeDeep(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Valida a estrutura dos dados de grupos
function validateGroupData(data) {
  if (typeof data !== "object" || data === null) {
    throw new Error("Estrutura de groupData inválida");
  }
  return true;
}

// Valida a estrutura dos dados de usuários
function validateUserData(data) {
  if (typeof data !== "object" || data === null || !data.hasOwnProperty("users")) {
    throw new Error("Estrutura de userData inválida");
  }
  return true;
}

// Garante que a pasta de backups existe
function ensureBackupFolderExists() {
  try {
    if (!fs.existsSync(BACKUP_FOLDER)) {
      fs.mkdirSync(BACKUP_FOLDER);
      logger.info(`Pasta de backups criada: ${BACKUP_FOLDER}`);
    }
  } catch (error) {
    logger.error("Erro ao criar a pasta de backups:", error);
  }
}

// Cria um backup do arquivo especificado
function createBackup(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      ensureBackupFolderExists();
      const timestamp = Date.now();
      const fileName = path.basename(filePath);
      const backupPath = path.join(BACKUP_FOLDER, `${fileName}.bak.${timestamp}`);
      fs.copyFileSync(filePath, backupPath);
      logger.info(`Backup criado: ${backupPath}`);
    }
  } catch (error) {
    logger.error(`Erro ao criar backup de ${filePath}:`, error);
  }
}

// Remove backups antigos, mantendo pelo menos um backup recente
function cleanupOldBackups() {
  try {
    ensureBackupFolderExists();
    const files = fs
      .readdirSync(BACKUP_FOLDER)
      .filter(file => file.match(/^(groupData|userData)\.json\.bak\.\d+$/)) // Filtra backups de groupData e userData
      .map(file => ({
        name: file,
        path: path.join(BACKUP_FOLDER, file),
        stats: fs.statSync(path.join(BACKUP_FOLDER, file)),
      }))
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs); // Ordena por data de modificação (mais recente primeiro)

    const groupDataBackups = files.filter(file => file.name.startsWith("groupData.json"));
    const userDataBackups = files.filter(file => file.name.startsWith("userData.json"));

    const now = Date.now();

    // Limpa backups de groupData, mantendo pelo menos 1
    groupDataBackups.forEach((file, index) => {
      if (index > 0 && now - file.stats.mtimeMs > 300000) {
        fs.unlinkSync(file.path);
        logger.info(`Backup de groupData removido por expiração: ${file.path}`);
      }
    });

    // Limpa backups de userData, mantendo pelo menos 1
    userDataBackups.forEach((file, index) => {
      if (index > 0 && now - file.stats.mtimeMs > 300000) {
        fs.unlinkSync(file.path);
        logger.info(`Backup de userData removido por expiração: ${file.path}`);
      }
    });

    if (groupDataBackups.length === 0) {
      logger.warn("Nenhum backup de groupData disponível. Certifique-se de criar um backup.");
    }

    if (userDataBackups.length === 0) {
      logger.warn("Nenhum backup de userData disponível. Certifique-se de criar um backup.");
    }
  } catch (error) {
    logger.error("Erro ao limpar backups antigos:", error);
  }
}

// Sincroniza a limpeza de backups antigos com o intervalo de persistência
setInterval(cleanupOldBackups, 30 * 60 * 1000);

// Persiste os dados do cache no disco, criando backups e validando os dados
function flushCacheToDisk() {
  if (groupDataChanged) {
    let originalGroupData = {};
    try {
      if (fs.existsSync(groupDataFilePath)) {
        const fileContent = fs.readFileSync(groupDataFilePath, "utf-8");
        originalGroupData = JSON.parse(fileContent);
        validateGroupData(originalGroupData);
      }
    } catch (error) {
      logger.error("Erro ao processar groupData.json. Restaurando backup...", error);
      originalGroupData = restoreBackup(groupDataFilePath, {});
    }

    createBackup(groupDataFilePath);
    const mergedGroupData = mergeDeep(originalGroupData, groupDataCache);
    try {
      fs.writeFileSync(groupDataFilePath, JSON.stringify(mergedGroupData, null, 2));
      groupDataChanged = false;
      logger.info("Dados do grupo mesclados, validados e persistidos no arquivo.");
    } catch (error) {
      logger.error("Erro ao salvar os dados do grupo:", error);
    }
  }
  if (userDataChanged) {
    let originalUserData = {};
    try {
      if (fs.existsSync(userDataFilePath)) {
        const fileContent = fs.readFileSync(userDataFilePath, "utf-8");
        originalUserData = JSON.parse(fileContent);
        validateUserData(originalUserData);
      }
    } catch (error) {
      logger.error("Erro ao processar userData.json. Restaurando backup...", error);
      originalUserData = restoreBackup(userDataFilePath, { users: {} });
    }
    createBackup(userDataFilePath);
    const mergedUserData = mergeDeep(originalUserData, userDataCache);
    try {
      fs.writeFileSync(userDataFilePath, JSON.stringify(mergedUserData, null, 2));
      userDataChanged = false;
      logger.info("Dados do usuário mesclados, validados e persistidos no arquivo.");
    } catch (error) {
      logger.error("Erro ao salvar os dados do usuário:", error);
    }
  }
}

// Sincroniza a persistência de dados com o intervalo de 30 minutos
setInterval(flushCacheToDisk, 30 * 60 * 1000);

// Limpa todos os caches periodicamente
setInterval(clearAllCaches, 30 * 60 * 1000);

// Obtém metadados de grupos com cache para evitar chamadas repetidas
async function getGroupMetadataWithCache(client, groupId) {
  const now = Date.now();

  if (groupMetadataCache.has(groupId)) {
    const cachedData = groupMetadataCache.get(groupId);
    if (now - cachedData.timestamp < GROUP_METADATA_CACHE_TTL) {
      logger.info(`Metadados do grupo obtidos do cache: ${groupId}S`);
      return cachedData.data;
    }
    groupMetadataCache.delete(groupId);
  }

  try {
    const groupMeta = await client.groupMetadata(groupId);
    groupMetadataCache.set(groupId, { data: groupMeta, timestamp: now });
    logger.info(`Metadados do grupo atualizados no cache: ${groupId}`);
    return groupMeta;
  } catch (error) {
    logger.error(`Erro ao obter metadados do grupo: ${groupId}`, error);
    if (groupMetadataCache.has(groupId)) {
      logger.warn(`Usando metadados do cache expirado para o grupo: ${groupId}`);
      return groupMetadataCache.get(groupId).data;
    }
    throw error;
  }
}

// Atualiza os dados de um participante em um grupo
function updateParticipantData(participantData, messageType) {
  participantData.occurrences += 1;
  participantData.timestamps.push(new Date().toISOString());

  if (!participantData.messageTypes[messageType]) {
    participantData.messageTypes[messageType] = { count: 0, dates: [] };
  }
  participantData.messageTypes[messageType].count += 1;
  participantData.messageTypes[messageType].dates.push(new Date().toISOString());

  logger.info(`Participante atualizado`);
}

// Atualiza os dados de um usuário, incluindo mensagens e tipos de mensagens
function updateUserData(userData, sender, pushName, messageType, isGroup) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const currentISODate = new Date().toISOString();
  const user = userData.users[sender] || {
    pushName,
    totalMessages: 0,
    messageTypes: {},
    firstSeen: currentISODate,
    lastSeen: null,
    totalMessagesInGroup: 0,
    totalMessagesOutsideGroup: 0,
    timestamps: [],
    timestamp: currentTimestamp,
  };

  user.totalMessages += 1;
  user.lastSeen = currentISODate;
  user.timestamps.push(currentISODate);
  if (isGroup) {
    user.totalMessagesInGroup += 1;
  } else {
    user.totalMessagesOutsideGroup += 1;
  }

  if (!user.messageTypes[messageType]) {
    user.messageTypes[messageType] = { count: 0, dates: [] };
  }
  user.messageTypes[messageType].count += 1;
  user.messageTypes[messageType].dates.push(currentISODate);

  userData.users[sender] = user;

  logger.info(`Dados do usuário atualizados`);
}

// Processa dados de mensagens recebidas, atualizando informações de grupos e usuários
async function groupProcessData(data, client) {
  try {
    logger.info("Processando nova mensagem...");
    const from = data.messages[0].key.remoteJid;
    if (data.messages[0].key.fromMe === true) return;

    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? data.messages[0].key.participant : data.messages[0].key.remoteJid;
    const pushName = data.messages[0].pushName || "Desconhecido";

    const message = data.messages[0].message;
    const messageType = message ? Object.keys(message)[0] : "unknown";

    const groupMeta = isGroup ? await getGroupMetadataWithCache(client, from) : null;

    if (isGroup && groupMeta) {
      const groupId = groupMeta.id;

      let groupData = loadGroupData();

      const currentSize = groupMeta.participants.length;
      const groupHistory = groupData[groupId]?.growthHistory || [];

      if (!groupHistory.length || groupHistory[groupHistory.length - 1].size !== currentSize) {
        groupHistory.push({ size: currentSize, timestamp: new Date().toISOString() });
        logger.info(`Histórico de crescimento atualizado para o grupo: ${groupId}`);
      }

      groupData[groupId] = {
        ...groupData[groupId],
        name: groupMeta.subject,
        subjectOwner: groupMeta.subjectOwner,
        subjectTime: groupMeta.subjectTime,
        size: currentSize,
        creation: groupMeta.creation,
        owner: groupMeta.owner,
        desc: groupMeta.desc,
        descId: groupMeta.descId,
        restrict: groupMeta.restrict,
        announce: groupMeta.announce,
        isCommunity: groupMeta.isCommunity,
        isCommunityAnnounce: groupMeta.isCommunityAnnounce,
        joinApprovalMode: groupMeta.joinApprovalMode,
        memberAddMode: groupMeta.memberAddMode,
        participants: groupData[groupId]?.participants || {},
        growthHistory: groupHistory,
      };

      const participantData = groupData[groupId].participants[sender] || {
        pushName,
        occurrences: 0,
        timestamps: [],
        messageTypes: {},
      };
      updateParticipantData(participantData, messageType);
      groupData[groupId].participants[sender] = participantData;

      saveGroupData(groupData);

      logger.info(`Mensagem processada com sucesso para o grupo: ${groupId}`);
    }

    let userData = loadUserData();
    updateUserData(userData, sender, pushName, messageType, isGroup);

    saveUserData(userData);

    logger.info(`Mensagem processada com sucesso para o usuário: ${sender}`);
  } catch (error) {
    logger.error("Erro ao processar mensagem:", error);
    throw error;
  }
}

// Garante que os dados sejam persistidos e os caches limpos ao sair do processo
process.on("exit", () => {
  flushCacheToDisk();
  clearAllCaches();
});

process.on("SIGINT", () => {
  flushCacheToDisk();
  clearAllCaches();
  process.exit();
});

// Exporta a função principal para processamento de dados
module.exports = groupProcessData;
