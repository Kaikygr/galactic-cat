/* eslint-disable no-unused-vars */
/* eslint-disable no-sync */
const fs = require("fs-extra");
const path = require("path");
const logger = require("../utils/logger");
const { getGroupAdmins } = require(path.join(__dirname, "../utils/functions"));

async function getGroupContext(client, from, info) {
  if (from.endsWith("@g.us")) {
    // Obter os metadados do grupo (nome, descrição, participantes, etc.)
    const groupMetadata = await client.groupMetadata(from);
    const groupName = groupMetadata.subject;
    const groupDesc = groupMetadata.desc;
    const groupSize = groupMetadata.size;
    const groupCreation = groupMetadata.creation;
    const groupOwner = groupMetadata.owner;
    const groupAdmins = getGroupAdmins(groupMetadata.participants);
    const groupParticipants = groupMetadata.participants.map(member => member.id);
    const groupSubjectOwner = groupMetadata.subjectOwner;
    const groupSubjectTime = groupMetadata.subjectTime;
    const groupDescId = groupMetadata.descId;
    const groupLinkedParent = groupMetadata.linkedParent || null;
    const groupRestrict = groupMetadata.restrict;
    const groupAnnounce = groupMetadata.announce;
    const groupIsCommunity = groupMetadata.isCommunity;
    const groupIsCommunityAnnounce = groupMetadata.isCommunityAnnounce;
    const groupJoinApprovalMode = groupMetadata.joinApprovalMode;
    const groupMemberAddMode = groupMetadata.memberAddMode;
    const groupEphemeralDuration = groupMetadata.ephemeralDuration;

    // Constrói o objeto com os dados do grupo para salvar no JSON
    const groupData = {
      [from]: {
        id: from,
        nome: groupName,
        descricao: groupDesc,
        tamanho: groupSize,
        criacao: groupCreation,
        dono: groupOwner,
        administradores: groupAdmins,
        participantes: groupParticipants,
        ownerSubject: groupSubjectOwner,
        subjectTime: groupSubjectTime,
        descId: groupDescId,
        linkedParent: groupLinkedParent,
        restrict: groupRestrict,
        announce: groupAnnounce,
        isCommunity: groupIsCommunity,
        isCommunityAnnounce: groupIsCommunityAnnounce,
        joinApprovalMode: groupJoinApprovalMode,
        memberAddMode: groupMemberAddMode,
        ephemeralDuration: groupEphemeralDuration,
      },
    };

    // Prepara o diretório e o arquivo para salvar as configurações
    const configFolder = path.join(__dirname, "../config/");
    fs.ensureDirSync(configFolder);
    const filePath = path.join(configFolder, "groupData.json");

    let existingData = {};
    if (fs.existsSync(filePath)) {
      try {
        // Lê o conteúdo já existente no arquivo JSON
        const fileContent = fs.readFileSync(filePath, "utf8");
        existingData = fileContent ? JSON.parse(fileContent) : {};
      } catch (error) {
        // Em caso de erro na leitura, inicializa com objeto vazio
        existingData = {};
      }
    }

    // Valida os dados atuais com os dados existentes no JSON
    if (existingData[from]) {
      if (existingData[from].nome && existingData[from].nome !== groupName) {
        logger.info(`Verificação: Nome do grupo no JSON ("${existingData[from].nome}") difere do atual ("${groupName}").`);
      }
      // ...outras verificações podem ser adicionadas aqui...
    }

    // Atualiza os dados do grupo no objeto existente
    existingData[from] = {
      ...existingData[from],
      ...groupData[from],
    };

    // Log de confirmação e escrita dos novos dados no arquivo JSON
    logger.info(`🟢 Grupo atualizado: ${groupName}`);
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), "utf8");

    return {
      groupMetadata,
      groupName,
      groupDesc,
      groupSize,
      groupCreation,
      groupOwner,
      groupAdmins,
      groupParticipants,
      groupSubjectOwner,
      groupSubjectTime,
      groupDescId,
      groupLinkedParent,
      groupRestrict,
      groupAnnounce,
      groupIsCommunity,
      groupIsCommunityAnnounce,
      groupJoinApprovalMode,
      groupMemberAddMode,
      groupEphemeralDuration,
    };
  }
  // Retorna objeto vazio se o "from" não for um grupo
  return {};
}

module.exports = { getGroupContext };
