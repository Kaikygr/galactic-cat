const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const { getMediaBuffer } = require("../utils/functions");

async function handleParticipantsUpdate(event, client) {
  console.log(event);

  const { id, author, participants, action } = event;
  const groupDataPath = path.join(__dirname, "../database/grupos/groupData.json");

  let groupData;
  try {
    const data = fs.readFileSync(groupDataPath, "utf8");
    groupData = JSON.parse(data);
  } catch (error) {
    logger.error(`Falha ao ler o arquivo groupData: ${error.message}`);
    return;
  }

  const group = groupData[id];

  if (!group) {
    logger.warn(`Grupo ${id} não encontrado no groupData`);
    return;
  }

  const welcomeConfig = group.welcome;
  const groupName = group.subject;
  const groupSize = group.size;
  const groupCreationDate = new Date(group.creation * 1000).toLocaleDateString("pt-BR");
  const groupDescription = group.desc || "Sem descrição";
  const adminCount = group.adminList.length;

  if (action === "add") {
    for (const participant of participants) {
      logger.info(`Participante ${participant} adicionado ${author} ao groupo: ${id}`);
      if (welcomeConfig.status === "on") {
        let welcomeMessage = welcomeConfig.mensagemEntrada
          .replace("#user", `@${participant.split("@")[0]}`)
          .replace("#group", groupName)
          .replace("#size", groupSize)
          .replace("#created", groupCreationDate)
          .replace("#desc", groupDescription)
          .replace("#admins", adminCount);
        try {
          if (welcomeConfig.mediaEntrada.ativo) {
            const mediaBuffer = await getMediaBuffer(welcomeConfig.mediaEntrada.url);
            const mediaOptions = {
              caption: welcomeMessage,
              mentions: [participant],
            };
            if (welcomeConfig.mediaEntrada.tipo === "imagem") {
              mediaOptions.image = mediaBuffer;
            } else if (welcomeConfig.mediaEntrada.tipo === "video") {
              mediaOptions.video = mediaBuffer;
              mediaOptions.gifPlayback = true;
            }
            await client.sendMessage(event.id, mediaOptions);
          } else {
            await client.sendMessage(event.id, { text: welcomeMessage, mentions: [participant] });
          }
        } catch (error) {
          logger.error(`Falha ao enviar mensagem de boas-vindas para: ${participant}: ${error.message}`);
        }
      }
    }
  } else if (action === "remove") {
    for (const participant of participants) {
      logger.info(`Participante ${participant} removido ${author} do grupo: ${id}`);
      if (welcomeConfig.status === "on") {
        const goodbyeMessage = welcomeConfig.mensagemSaida
          .replace("#user", `@${participant.split("@")[0]}`)
          .replace("#group", groupName)
          .replace("#size", groupSize)
          .replace("#created", groupCreationDate)
          .replace("#desc", groupDescription)
          .replace("#admins", adminCount);
        try {
          if (welcomeConfig.mediaSaida.ativo) {
            const mediaBuffer = await getMediaBuffer(welcomeConfig.mediaSaida.url);
            const mediaOptions = {
              caption: goodbyeMessage,
              mentions: [participant],
            };
            if (welcomeConfig.mediaSaida.tipo === "imagem") {
              mediaOptions.image = mediaBuffer;
            } else if (welcomeConfig.mediaSaida.tipo === "video") {
              mediaOptions.video = mediaBuffer;
              mediaOptions.gifPlayback = true;
            }
            await client.sendMessage(event.id, mediaOptions);
          } else {
            await client.sendMessage(event.id, { text: goodbyeMessage, mentions: [participant] });
          }
        } catch (error) {
          logger.error(`Falha ao enviar mensagem de despedida para: ${participant}: ${error.message}`);
        }
      }
    }
  } else {
    logger.warn(`Ação desconhecida: ${action}`);
  }
}

module.exports = { handleParticipantsUpdate };
