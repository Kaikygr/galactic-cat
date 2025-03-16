const { from } = require("multistream");
const logger = require("../utils/logger");
const baileys = require("@whiskeysockets/baileys");

module.exports = async (data, client) => {
  logger.info("Data e cliente foram recebidos com sucesso");
  const from = data.messages[0].key.remoteJid;
  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? data.messages[0].key.participant : data.messages[0].key.remoteJid;
};
