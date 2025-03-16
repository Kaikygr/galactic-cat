const { from } = require("multistream");
const logger = require("../utils/logger");
const baileys = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");

module.exports = async (data, client) => {
  logger.info("Data e cliente foram recebidos com sucesso");
  const from = data.messages[0].key.remoteJid;
  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? data.messages[0].key.participant : data.messages[0].key.remoteJid;
  await handleGroupData(from, client);
};

async function handleGroupData(from, client) {
  if (!from.endsWith("@g.us")) return;
  // Alterado: novo diretório para armazenar o JSON
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

    // Formatar participantes com as novas informações
    const participants = {};
    groupData.participants.forEach(p => {
      participants[p.id] = {
        admin: !!p.admin,
        messages: 0, // Inicializando o contador de mensagens
        commands: 0, // Inicializando o contador de comandos
        xp: 0, // Inicializando o XP
        level: 1, // Inicializando o nível
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

async function salvarGrupoJSON(groupId, novoGrupo) {
  try {
    let grupos = {};

    // Alterado: assegurar que o caminho do arquivo utilize a nova configuração de diretório
    const filePath = path.join(__dirname, "../database/grupos/groupData.json");

    // Se o arquivo existir, ler os dados atuais
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      grupos = JSON.parse(data);
    }

    // Se os dados do grupo já existirem, compara e atualiza
    if (grupos[groupId]) {
      novoGrupo = mergeDeep(grupos[groupId], novoGrupo);
    }

    // Atualiza ou adiciona o grupo
    grupos[groupId] = novoGrupo;

    // Salva o JSON atualizado
    fs.writeFileSync(filePath, JSON.stringify(grupos, null, 2), "utf-8");
    logger.info(`✅ Dados do grupo ${novoGrupo.subject} salvos com sucesso!`);
  } catch (error) {
    logger.error("❌ Erro ao salvar JSON:", error);
  }
}

// Atualizada a função mergeDeep para substituir 'participants' e remover usuários ausentes na nova lista
function mergeDeep(target, source) {
  for (const key in source) {
    if (key === "participants") {
      // Substitui completamente o objeto participants com a nova lista
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
