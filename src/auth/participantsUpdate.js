const logger = require("../utils/logger");

async function handleParticipantsUpdate(event, client, groupCache) {
  switch (event.action) {
    case "add":
      logger.info(`Participante(s): ${event.participants.join(", ")} adicionado(s) no grupo ${event.id}.`);
      break;
    case "remove":
      logger.info(`Participante(s): ${event.participants.join(", ")} removido(s) do grupo ${event.id}.`);
      break;
    default:
      logger.info(`Ação desconhecida '${event.action}' para o grupo ${event.id}.`);
  }
  const metadata = await client.groupMetadata(event.id);
  groupCache.set(event.id, metadata);
}

module.exports = { handleParticipantsUpdate };
