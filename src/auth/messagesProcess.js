/* eslint-disable no-unused-vars */
async function userMessageProcess(data) {
  try {
    console.log(`\n\n\n${JSON.stringify(data, null, 2)}\n\n\n`);
    const [message] = data.messages;
    const { messageTimestamp: messageTime, pushName: userName, broadcast: status, key: messageKeys, message: messageContent } = message;
    const { remoteJid, fromMe, id: messageID, participant } = messageKeys;
    const userID = participant ?? remoteJid;
    const messageSecretKey = messageContent.messageContextInfo?.messageSecret ?? null;
    const messageType = Object.keys(messageContent)[0];

    // Novo bloco para extração específica com várias constantes para cada tipo
    let extractedData;
    switch (messageType) {
      case "extendedTextMessage":
        {
          const texto = data?.messages?.[0]?.message?.extendedTextMessage?.text || "Informação não disponível";
          const previewType = data?.messages?.[0]?.message?.extendedTextMessage?.previewType || "Informação não disponível";
          const expiration = data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const invitlink = data?.messages?.[0]?.message?.extendedTextMessage?.inviteLinkGroupTypeV2 || "Informação não disponível";
          const ephemeralSettingTimestamp = data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.ephemeralSettingTimestamp || "Informação não disponível";
          const senderKeyHash = data?.messages?.[0]?.message?.messageContextInfo?.deviceListMetadata?.senderKeyHash || "Informação não disponível";
          const senderTimestamp = data?.messages?.[0]?.message?.messageContextInfo?.deviceListMetadata?.senderTimestamp || "Informação não disponível";
          const recipientKeyHash = data?.messages?.[0]?.message?.messageContextInfo?.deviceListMetadata?.recipientKeyHash || "Informação não disponível";
          const recipientTimestamp = data?.messages?.[0]?.message?.messageContextInfo?.deviceListMetadata?.recipientTimestamp || "Informação não disponível";
          const deviceListMetadataVersion = data?.messages?.[0]?.message?.messageContextInfo?.deviceListMetadataVersion || "Informação não disponível";
          const verifiedBizName = data?.messages?.[0]?.verifiedBizName || "Informação não disponível";
          extractedData = { texto, previewType, expiration, initiator, trigger, invitlink, ephemeralSettingTimestamp, senderKeyHash, senderTimestamp, recipientKeyHash, recipientTimestamp, deviceListMetadataVersion, verifiedBizName };
        }
        break;

      default:
        extractedData = { info: "Tipo não identificado" };
        break;
    }

    console.log({
      messageType,
      messageTime,
      userName,
      status,
      remoteJid,
      fromMe,
      messageID,
      userID,
      messageSecretKey,
      extractedData,
    });
  } catch (error) {
    console.error(error);
  }
}

module.exports = { userMessageProcess };
