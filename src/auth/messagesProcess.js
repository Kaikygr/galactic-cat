async function userMessageProcess(data) {
  try {
    const [message] = data.messages;
    const { messageTimestamp: messageTime, pushName: userName, broadcast: status, key: messageKeys, message: messageContent } = message;
    const { remoteJid, fromMe, id: messageID, participant } = messageKeys;
    const userID = participant ?? remoteJid;
    const messageSecretKey = messageContent.messageContextInfo?.messageSecret ?? null;
    const messageType = Object.keys(messageContent)[0];

    console.log("\x1b[32mMensagem Processada:\x1b[0m");
    console.log("\x1b[34mTipo:\x1b[0m", messageType);
    console.log("\x1b[34mHorário da Mensagem:\x1b[0m", messageTime);
    console.log("\x1b[34mNome do Usuário:\x1b[0m", userName);
    console.log("\x1b[34mStatus:\x1b[0m", status);
    console.log("\x1b[34mID Remoto:\x1b[0m", remoteJid);
    console.log("\x1b[34mEnviado por Mim:\x1b[0m", fromMe);
    console.log("\x1b[34mID da Mensagem:\x1b[0m", messageID);
    console.log("\x1b[34mID do Usuário:\x1b[0m", userID);
    console.log("\x1b[34mChave Secreta da Mensagem:\x1b[0m", messageSecretKey);
  } catch (error) {
    console.error("\x1b[31mErro ao processar a mensagem:\x1b[0m", error);
  }
}

module.exports = { userMessageProcess };
