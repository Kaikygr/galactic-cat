/* eslint-disable no-unused-vars */
const colors = require("colors");

async function userMessageProcess(data) {
  try {
    const [message] = data.messages;
    const { messageTimestamp: messageTime, pushName: userName, broadcast: status, key: messageKeys, message: messageContent } = message;
    const { remoteJid, fromMe, id: messageID, participant } = messageKeys;
    const userID = participant ?? remoteJid;
    const messageSecretKey = messageContent.messageContextInfo?.messageSecret ?? null;
    const messageType = Object.keys(messageContent)[0];

    const logMessage = `
${"==============".yellow}
${"Mensagem Processada:".green}
${"Tipo:".blue} ${messageType}
${"Horário da Mensagem:".blue} ${messageTime}
${"Nome do Usuário:".blue} ${userName}
${"Status:".blue} ${status}
${"ID Remoto:".blue} ${remoteJid}
${"Enviado por Mim:".blue} ${fromMe}
${"ID da Mensagem:".blue} ${messageID}
${"ID do Usuário:".blue} ${userID}
${"Chave Secreta da Mensagem:".blue} ${messageSecretKey}
${"==============".yellow}
`;

    console.log(logMessage);
  } catch (error) {
    console.error("Erro ao processar a mensagem:".red, error);
  }
}

module.exports = { userMessageProcess };
