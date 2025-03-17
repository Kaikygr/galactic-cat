const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const GROUP_DATA_FILE = path.join(__dirname, "../database/grupos/groupData.json");

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
      welcome: {
        status: "off",
        mensagemEntrada: "Olá @#user, seja bem-vindo! 😊",
        mensagemSaida: "Até logo, @#user! 👋",
        mediaEntrada: {
          ativo: false,
          tipo: "imagem",
          url: "",
        },
        mediaSaida: {
          ativo: false,
          tipo: "imagem",
          url: "",
        },
      },
      banned: [],
      usersAdvetencias: {},
      forbiddenWords: [],
    };

    await salvarGrupoJSON(groupData.id, detailedInfo);
  } catch (error) {
    logger.error(`❌ Erro ao processar o grupo ${from}:`, error);
  }
}

async function salvarGrupoJSON(groupId, novoGrupo) {
  try {
    if (!validateGroupData(novoGrupo)) {
      logger.warn(`⚠️ Dados inválidos para o grupo ${groupId}. Operação abortada.`);
      return;
    }

    let currentData = {};
    if (fs.existsSync(GROUP_DATA_FILE)) {
      const data = fs.readFileSync(GROUP_DATA_FILE, "utf-8");
      currentData = JSON.parse(data);
    }

    if (currentData[groupId]) {
      const cached = currentData[groupId];
      novoGrupo = mergeDeep(cached, novoGrupo);
      novoGrupo.welcome = cached.welcome;
      novoGrupo.banned = cached.banned;
      novoGrupo.usersAdvetencias = cached.usersAdvetencias;
      novoGrupo.forbiddenWords = cached.forbiddenWords;
    }

    currentData[groupId] = novoGrupo;
    fs.writeFileSync(GROUP_DATA_FILE, JSON.stringify(currentData, null, 2), "utf-8");
    logger.info(`✅ Dados do grupo ${novoGrupo.subject} escritos no arquivo groupData.json!`);
  } catch (error) {
    logger.error("❌ Erro ao salvar JSON:", error);
  }
}

function validateGroupData(data) {
  if (!data || typeof data !== "object") return false;
  if (!data.subject || typeof data.subject !== "string") return false;
  if (!data.participants || typeof data.participants !== "object") return false;

  if (data.welcome !== undefined && typeof data.welcome !== "object") return false;
  if (data.banned !== undefined && !Array.isArray(data.banned)) return false;
  if (data.usersAdvetencias !== undefined && typeof data.usersAdvetencias !== "object") return false;
  if (data.forbiddenWords !== undefined && !Array.isArray(data.forbiddenWords)) return false;

  return true;
}

function mergeDeep(target, source) {
  for (const key in source) {
    if (key === "participants") {
      target[key] = source[key];
      continue;
    }
    if (["welcome", "usersAdvetencias", "banned", "forbiddenWords"].includes(key)) {
      if (target[key] !== undefined) {
        continue;
      } else {
        target[key] = source[key];
        continue;
      }
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
