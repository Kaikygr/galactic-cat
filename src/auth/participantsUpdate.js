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
    logger.error(`Failed to read groupData file: ${error.message}`);
    return;
  }

  const group = groupData[id];

  if (!group) {
    logger.warn(`Group ${id} not found in groupData`);
    return;
  }

  const welcomeConfig = group.welcome;

  if (action === "add") {
    for (const participant of participants) {
      logger.info(`Participant ${participant} added by ${author} to group ${id}`);
      if (welcomeConfig.status === "on") {
        let welcomeMessage = welcomeConfig.mensagemEntrada.replace("@#user", `@${participant.split("@")[0]}`);
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
          logger.error(`Failed to send welcome message to ${participant}: ${error.message}`);
        }
      }
    }
  } else if (action === "remove") {
    for (const participant of participants) {
      logger.info(`Participant ${participant} removed by ${author} from group ${id}`);
      if (welcomeConfig.status === "on") {
        const goodbyeMessage = welcomeConfig.mensagemSaida.replace("@#user", `@${participant.split("@")[0]}`);
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
          logger.error(`Failed to send goodbye message to ${participant}: ${error.message}`);
        }
      }
    }
  } else {
    logger.warn(`Unknown action: ${action}`);
  }
}

module.exports = { handleParticipantsUpdate };
