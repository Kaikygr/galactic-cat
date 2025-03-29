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

function flushCacheToDisk() {
  if (groupDataChanged) {
    fs.writeFileSync(groupDataFilePath, JSON.stringify(groupDataCache, null, 2));
    groupDataChanged = false;
    logger.info("Dados do grupo persistidos no arquivo.");
  }
  if (userDataChanged) {
    fs.writeFileSync(userDataFilePath, JSON.stringify(userDataCache, null, 2));
    userDataChanged = false;
    logger.info("Dados do usuário persistidos no arquivo.");
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
