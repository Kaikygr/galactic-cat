const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const GROUP_DATA_FILE = path.join(__dirname, "../database/grupos/groupData.json");
let grupoDataCache = {};
let writeTimeout = null;

module.exports = async (data, client) => {
  logger.info("Data e cliente foram recebidos com sucesso");
  const from = data.messages[0].key.remoteJid;
  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? data.messages[0].key.participant : data.messages[0].key.remoteJid;
  await handleGroupData(from, client);
};

async function handleGroupData(from, client) {
  if (!from.endsWith("@g.us")) return;
  const filePath = path.join(__dirname, "../database/grupos/groupData.json");

  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}), "utf-8");
    logger.info("Arquivo groupData.json criado com sucesso!");
  }

  try {
    const groupData = await client.groupMetadata(from);
    const adminList = groupData.participants.filter(p => p.admin === "admin" || p.admin === "superadmin").map(p => p.id);
    const membersComum = groupData.participants.filter(p => !p.admin).map(p => p.id);

    const participants = {};
    groupData.participants.forEach(p => {
      participants[p.id] = {
        admin: !!p.admin,
        messages: 0,
        commands: 0,
        xp: 0,
        level: 1,
      };
    });

    const detailedInfo = {
      subject: groupData.subject,
      subjectOwner: groupData.subjectOwner,
      subjectTime: groupData.subjectTime,
      size: groupData.size,
      creation: groupData.creation,
      desc: groupData.desc,
      descId: groupData.descId,
      restrict: groupData.restrict,
      announce: groupData.announce,
      isCommunity: groupData.isCommunity,
      isCommunityAnnounce: groupData.isCommunityAnnounce,
      joinApprovalMode: groupData.joinApprovalMode,
      memberAddMode: groupData.memberAddMode,
      participants,
      ephemeralDuration: groupData.ephemeralDuration,
      adminList,
      membersComum,
      welcome: {},
      banned: [],
      usersAdvetencias: {},
      forbiddenWords: [],
    };

    await salvarGrupoJSON(groupData.id, detailedInfo);
  } catch (error) {
    logger.error(`❌ Erro ao processar o grupo ${from}:`, error);
  }
}

function scheduleCacheFlush() {
  if (writeTimeout) clearTimeout(writeTimeout);
  writeTimeout = setTimeout(() => {
    const dirPath = path.dirname(GROUP_DATA_FILE);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(GROUP_DATA_FILE, JSON.stringify(grupoDataCache, null, 2), "utf-8");
    logger.info("📀 Cache atualizado em groupData.json com sucesso!");
    writeTimeout = null;
  }, 500); // tempo de atraso para evitar escritas seguidas
}

async function salvarGrupoJSON(groupId, novoGrupo) {
  try {
    if (Object.keys(grupoDataCache).length === 0 && fs.existsSync(GROUP_DATA_FILE)) {
      const data = fs.readFileSync(GROUP_DATA_FILE, "utf-8");
      grupoDataCache = JSON.parse(data);
    }

    if (grupoDataCache[groupId]) {
      novoGrupo = mergeDeep(grupoDataCache[groupId], novoGrupo);
    }

    grupoDataCache[groupId] = novoGrupo;
    scheduleCacheFlush();
    logger.info(`✅ Dados do grupo ${novoGrupo.subject} enfileirados para atualização no cache!`);
  } catch (error) {
    logger.error("❌ Erro ao salvar JSON:", error);
  }
}

function mergeDeep(target, source) {
  for (const key in source) {
    if (key === "participants") {
      target[key] = source[key];
      continue;
    }
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      target[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

exports.modules = { handleGroupData };
