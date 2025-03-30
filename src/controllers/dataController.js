const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const groupDataFilePath = path.join(__dirname, "../data/groupData.json");
const userDataFilePath = path.join(__dirname, "../data/userData.json");

let groupDataCache = null;
let userDataCache = null;
let groupDataChanged = false;
let userDataChanged = false;

const groupMetadataCache = new Map();
const GROUP_METADATA_CACHE_TTL = 30000;

const BACKUP_FOLDER = path.join(__dirname, "../temp");

function ensureFileExists(filePath, initialData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
    logger.info(`Arquivo JSON criado: ${filePath}`);
  }
}

function loadGroupData() {
  if (!groupDataCache) {
    ensureFileExists(groupDataFilePath, {});
    const fileContent = fs.readFileSync(groupDataFilePath, "utf-8");
    groupDataCache = JSON.parse(fileContent);
  }
  return groupDataCache;
}

function loadUserData() {
  if (!userDataCache) {
    ensureFileExists(userDataFilePath, { users: {} });
    const fileContent = fs.readFileSync(userDataFilePath, "utf-8");
    userDataCache = JSON.parse(fileContent);
  }
  return userDataCache;
}

function saveGroupData(groupData) {
  groupDataCache = groupData;
  groupDataChanged = true;
}

function saveUserData(userData) {
  userDataCache = userData;
  userDataChanged = true;
}

// Função para mesclar objetos recursivamente preservando campos existentes
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

// Nova função para validar a estrutura dos dados do grupo
function validateGroupData(data) {
  // Exemplo de validação: data deve ser um objeto
  if (typeof data !== "object" || data === null) {
    throw new Error("Estrutura de groupData inválida");
  }
  return true;
}

// Nova função para validar a estrutura dos dados de usuário
function validateUserData(data) {
  if (typeof data !== "object" || data === null || !data.hasOwnProperty("users")) {
    throw new Error("Estrutura de userData inválida");
  }
  return true;
}

// Função que garante a existência da pasta de backups
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

// Modificação na função createBackup para salvar os backups na pasta tempBackup
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

// Função para limpar backups com mais de 5 minutos (300000 ms) de idade
function cleanupOldBackups() {
  try {
    ensureBackupFolderExists();
    const files = fs.readdirSync(BACKUP_FOLDER);
    const now = Date.now();
    files.forEach(file => {
      const backupFilePath = path.join(BACKUP_FOLDER, file);
      try {
        const stats = fs.statSync(backupFilePath);
        if (now - stats.mtimeMs > 300000) {
          // 5 minutos em milissegundos
          fs.unlinkSync(backupFilePath);
          logger.info(`Backup removido por expiração: ${backupFilePath}`);
        }
      } catch (error) {
        logger.error(`Erro ao processar o arquivo de backup ${backupFilePath}:`, error);
      }
    });
  } catch (error) {
    logger.error("Erro ao limpar backups antigos:", error);
  }
}

// Agendamento da limpeza dos backups antigos a cada 1 minuto
setInterval(cleanupOldBackups, 60000);

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
      logger.error("Erro ao processar groupData.json. Reiniciando com dados padrão.", error);
      originalGroupData = {}; // Reinicia com dados padrão
    }
    // Cria backup do arquivo groupData.json
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
      logger.error("Erro ao processar userData.json. Reiniciando com dados padrão.", error);
      originalUserData = { users: {} };
    }
    // Cria backup do arquivo userData.json
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

setInterval(flushCacheToDisk, 5000);

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

process.on("exit", flushCacheToDisk);
process.on("SIGINT", () => {
  flushCacheToDisk();
  process.exit();
});

module.exports = groupProcessData;
