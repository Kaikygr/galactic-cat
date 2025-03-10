/* eslint-disable no-unused-vars */
function extractQuotedData(qMsg) {
  if (qMsg.extendedTextMessage) {
    return {
      // extração mínima para extendedTextMessage
      type: "extendedTextMessage",
      text: qMsg.extendedTextMessage.text || "Informação não disponível",
    };
  }
  if (qMsg.imageMessage) {
    return {
      // extração mínima para imageMessage
      type: "imageMessage",
      url: qMsg.imageMessage.url || "Informação não disponível",
      caption: qMsg.imageMessage.caption || "Informação não disponível",
    };
  }
  if (qMsg.videoMessage) {
    return {
      // extração mínima para videoMessage
      type: "videoMessage",
      url: qMsg.videoMessage.url || "Informação não disponível",
      caption: qMsg.videoMessage.caption || "Informação não disponível",
    };
  }
  if (qMsg.stickerMessage) {
    return {
      // extração mínima para stickerMessage
      type: "stickerMessage",
      url: qMsg.stickerMessage.url || "Informação não disponível",
    };
  }
  if (qMsg.documentMessage) {
    return {
      // extração mínima para documentMessage
      type: "documentMessage",
      url: qMsg.documentMessage.url || "Informação não disponível",
      fileName: qMsg.documentMessage.fileName || "Informação não disponível",
    };
  }
  if (qMsg.audioMessage) {
    return {
      // extração mínima para audioMessage
      type: "audioMessage",
      url: qMsg.audioMessage.url || "Informação não disponível",
    };
  }
  // fallbacks
  return qMsg;
}

async function userMessageProcess(data) {
  try {
    const [message] = data.messages;
    const { messageTimestamp: messageTime, pushName: userName, broadcast: status, key: messageKeys, message: messageContent } = message;
    const { remoteJid, fromMe, id: messageID, participant } = messageKeys;
    const userID = participant ?? remoteJid;
    const messageSecretKey = messageContent.messageContextInfo?.messageSecret ?? null;
    const messageType = Object.keys(messageContent)[0];

    let extractedData;

    switch (messageType) {
      case "conversation":
        {
          const text = data?.messages?.[0]?.message?.conversation || "Informação não disponível";
          extractedData = { text };
        }
        break;

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
          const quotedRaw = data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw?.conversation || "Informação não disponível";
          const initByMe = data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.disappearingMode?.initiatedByMe || "Informação não disponível";
          extractedData = { texto, previewType, expiration, initiator, trigger, invitlink, ephemeralSettingTimestamp, senderKeyHash, senderTimestamp, recipientKeyHash, recipientTimestamp, deviceListMetadataVersion, verifiedBizName, quotedMessage, initByMe };
        }
        break;

      case "imageMessage":
      case "videoMessage": {
        const type = data?.messages?.[0]?.message?.imageMessage ? "imageMessage" : "videoMessage";

        const url = data?.messages?.[0]?.message?.[type]?.url || "Informação não disponível";
        const mimetype = data?.messages?.[0]?.message?.[type]?.mimetype || "Informação não disponível";
        const caption = data?.messages?.[0]?.message?.[type]?.caption || "Informação não disponível";
        const fileSha256 = data?.messages?.[0]?.message?.[type]?.fileSha256 || "Informação não disponível";
        const fileLength = data?.messages?.[0]?.message?.[type]?.fileLength || "Informação não disponível";
        const height = data?.messages?.[0]?.message?.[type]?.height || "Informação não disponível";
        const width = data?.messages?.[0]?.message?.[type]?.width || "Informação não disponível";
        const mediaKey = data?.messages?.[0]?.message?.[type]?.mediaKey || "Informação não disponível";
        const fileEncSha256 = data?.messages?.[0]?.message?.[type]?.fileEncSha256 || "Informação não disponível";
        const directPath = data?.messages?.[0]?.message?.[type]?.directPath || "Informação não disponível";
        const mediaKeyTimestamp = data?.messages?.[0]?.message?.[type]?.mediaKeyTimestamp || "Informação não disponível";
        const jpegThumbnail = data?.messages?.[0]?.message?.[type]?.jpegThumbnail || "Informação não disponível";
        const expiration = data?.messages?.[0]?.message?.[type]?.contextInfo?.expiration || "Informação não disponível";
        const stanzaId = data?.messages?.[0]?.message?.[type]?.contextInfo?.stanzaId || "Informação não disponível";
        const participant = data?.messages?.[0]?.message?.[type]?.contextInfo?.participant || "Informação não disponível";
        const seconds = data?.messages?.[0]?.message?.[type]?.seconds || "Informação não disponível";
        const quotedRaw = data?.messages?.[0]?.message?.[type]?.contextInfo?.quotedMessage;
        const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

        extractedData = {
          type,
          url,
          mimetype,
          caption,
          fileSha256,
          fileLength,
          height,
          width,
          mediaKey,
          fileEncSha256,
          directPath,
          mediaKeyTimestamp,
          jpegThumbnail,
          expiration,
          stanzaId,
          participant,
          quotedMessage,
          seconds,
        };
        break;
      }

      case "stickerMessage":
        {
          const url = data?.messages?.[0]?.message?.stickerMessage?.url || "Informação não disponível";
          const fileSha256 = data?.messages?.[0]?.message?.stickerMessage?.fileSha256 || "Informação não disponível";
          const fileEncSha256 = data?.messages?.[0]?.message?.stickerMessage?.fileEncSha256 || "Informação não disponível";
          const mediaKey = data?.messages?.[0]?.message?.stickerMessage?.mediaKey || "Informação não disponível";
          const mimetype = data?.messages?.[0]?.message?.stickerMessage?.mimetype || "Informação não disponível";
          const height = data?.messages?.[0]?.message?.stickerMessage?.height || "Informação não disponível";
          const width = data?.messages?.[0]?.message?.stickerMessage?.width || "Informação não disponível";
          const directPath = data?.messages?.[0]?.message?.stickerMessage?.directPath || "Informação não disponível";
          const fileLength = data?.messages?.[0]?.message?.stickerMessage?.fileLength || "Informação não disponível";
          const mediaKeyTimestamp = data?.messages?.[0]?.message?.stickerMessage?.mediaKeyTimestamp || "Informação não disponível";
          const isAnimated = data?.messages?.[0]?.message?.stickerMessage?.isAnimated || false;
          const expiration = data?.messages?.[0]?.message?.stickerMessage?.contextInfo?.expiration || "Informação não disponível";
          const ephemeralSettingTimestamp = data?.messages?.[0]?.message?.stickerMessage?.contextInfo?.ephemeralSettingTimestamp || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.stickerMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.stickerMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const initByMe = data?.messages?.[0]?.message?.stickerMessage?.contextInfo?.disappearingMode?.initiatedByMe || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.stickerMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            url,
            fileSha256,
            fileEncSha256,
            mediaKey,
            mimetype,
            height,
            width,
            directPath,
            fileLength,
            mediaKeyTimestamp,
            isAnimated,
            expiration,
            ephemeralSettingTimestamp,
            initiator,
            trigger,
            initByMe,
            quotedMessage,
          };
        }
        break;

      case "reactionMessage":
        {
          const reactionText = data?.messages?.[0]?.message?.reactionMessage?.text || "Informação não disponível";
          const senderTimestampMs = data?.messages?.[0]?.message?.reactionMessage?.senderTimestampMs || "Informação não disponível";
          const reactedMessageKey = data?.messages?.[0]?.message?.reactionMessage?.key || {};
          const quotedRaw = data?.messages?.[0]?.message?.reactionMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            reactionText,
            senderTimestampMs,
            reactedMessageKey,
            quotedMessage,
          };
        }
        break;

      case "senderKeyDistributionMessage":
        {
          const groupId = data?.messages?.[0]?.message?.senderKeyDistributionMessage?.groupId || "Informação não disponível";
          const axolotlSenderKeyDistributionMessage = data?.messages?.[0]?.message?.senderKeyDistributionMessage?.axolotlSenderKeyDistributionMessage || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.senderKeyDistributionMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            groupId,
            axolotlSenderKeyDistributionMessage,
            quotedMessage,
          };
        }
        break;

      case "documentMessage":
        {
          const url = data?.messages?.[0]?.message?.documentMessage?.url || "Informação não disponível";
          const mimetype = data?.messages?.[0]?.message?.documentMessage?.mimetype || "Informação não disponível";
          const fileSha256 = data?.messages?.[0]?.message?.documentMessage?.fileSha256 || "Informação não disponível";
          const fileLength = data?.messages?.[0]?.message?.documentMessage?.fileLength || "Informação não disponível";
          const pageCount = data?.messages?.[0]?.message?.documentMessage?.pageCount || 0;
          const mediaKey = data?.messages?.[0]?.message?.documentMessage?.mediaKey || "Informação não disponível";
          const fileName = data?.messages?.[0]?.message?.documentMessage?.fileName || "Informação não disponível";
          const fileEncSha256 = data?.messages?.[0]?.message?.documentMessage?.fileEncSha256 || "Informação não disponível";
          const directPath = data?.messages?.[0]?.message?.documentMessage?.directPath || "Informação não disponível";
          const mediaKeyTimestamp = data?.messages?.[0]?.message?.documentMessage?.mediaKeyTimestamp || "Informação não disponível";
          const expiration = data?.messages?.[0]?.message?.documentMessage?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.documentMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.documentMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.documentMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            url,
            mimetype,
            fileSha256,
            fileLength,
            pageCount,
            mediaKey,
            fileName,
            fileEncSha256,
            directPath,
            mediaKeyTimestamp,
            expiration,
            initiator,
            trigger,
            quotedMessage,
          };
        }
        break;

      case "productMessage":
        {
          const product = data?.messages?.[0]?.message?.productMessage?.product || {};
          const businessOwnerJid = data?.messages?.[0]?.message?.productMessage?.businessOwnerJid || "Informação não disponível";
          const expiration = data?.messages?.[0]?.message?.productMessage?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.productMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.productMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.productMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            product,
            businessOwnerJid,
            expiration,
            initiator,
            trigger,
            quotedMessage,
          };
        }
        break;

      case "locationMessage":
        {
          const degreesLatitude = data?.messages?.[0]?.message?.locationMessage?.degreesLatitude || "Informação não disponível";
          const degreesLongitude = data?.messages?.[0]?.message?.locationMessage?.degreesLongitude || "Informação não disponível";
          const jpegThumbnail = data?.messages?.[0]?.message?.locationMessage?.jpegThumbnail || "Informação não disponível";
          const expiration = data?.messages?.[0]?.message?.locationMessage?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.locationMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.locationMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.locationMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            degreesLatitude,
            degreesLongitude,
            jpegThumbnail,
            expiration,
            initiator,
            trigger,
            quotedMessage,
          };
        }
        break;

      case "contactMessage":
        {
          const displayName = data?.messages?.[0]?.message?.contactMessage?.displayName || "Informação não disponível";
          const vcard = data?.messages?.[0]?.message?.contactMessage?.vcard || "Informação não disponível";
          const expiration = data?.messages?.[0]?.message?.contactMessage?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.contactMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.contactMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.contactMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            displayName,
            vcard,
            expiration,
            initiator,
            trigger,
            quotedMessage,
          };
        }
        break;

      case "pollCreationMessageV3":
        {
          const name = data?.messages?.[0]?.message?.pollCreationMessageV3?.name || "Informação não disponível";
          const options = data?.messages?.[0]?.message?.pollCreationMessageV3?.options || [];
          const selectableOptionsCount = data?.messages?.[0]?.message?.pollCreationMessageV3?.selectableOptionsCount || 0;
          const expiration = data?.messages?.[0]?.message?.pollCreationMessageV3?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.pollCreationMessageV3?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.pollCreationMessageV3?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.pollCreationMessageV3?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            name,
            options,
            selectableOptionsCount,
            expiration,
            initiator,
            trigger,
            quotedMessage,
          };
        }
        break;

      case "eventMessage":
        {
          const isCanceled = data?.messages?.[0]?.message?.eventMessage?.isCanceled || false;
          const name = data?.messages?.[0]?.message?.eventMessage?.name || "Informação não disponível";
          const description = data?.messages?.[0]?.message?.eventMessage?.description || "Informação não disponível";
          const location = data?.messages?.[0]?.message?.eventMessage?.location || {};
          const joinLink = data?.messages?.[0]?.message?.eventMessage?.joinLink || "Informação não disponível";
          const startTime = data?.messages?.[0]?.message?.eventMessage?.startTime || "Informação não disponível";
          const expiration = data?.messages?.[0]?.message?.eventMessage?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.eventMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.eventMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.eventMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            isCanceled,
            name,
            description,
            location,
            joinLink,
            startTime,
            expiration,
            initiator,
            trigger,
            quotedMessage,
          };
        }
        break;

      case "audioMessage":
        {
          const url = data?.messages?.[0]?.message?.audioMessage?.url || "Informação não disponível";
          const mimetype = data?.messages?.[0]?.message?.audioMessage?.mimetype || "Informação não disponível";
          const fileSha256 = data?.messages?.[0]?.message?.audioMessage?.fileSha256 || "Informação não disponível";
          const fileLength = data?.messages?.[0]?.message?.audioMessage?.fileLength || "Informação não disponível";
          const seconds = data?.messages?.[0]?.message?.audioMessage?.seconds || "Informação não disponível";
          const mediaKey = data?.messages?.[0]?.message?.audioMessage?.mediaKey || "Informação não disponível";
          const fileEncSha256 = data?.messages?.[0]?.message?.audioMessage?.fileEncSha256 || "Informação não disponível";
          const directPath = data?.messages?.[0]?.message?.audioMessage?.directPath || "Informação não disponível";
          const mediaKeyTimestamp = data?.messages?.[0]?.message?.audioMessage?.mediaKeyTimestamp || "Informação não disponível";
          const expiration = data?.messages?.[0]?.message?.audioMessage?.contextInfo?.expiration || "Informação não disponível";
          const initiator = data?.messages?.[0]?.message?.audioMessage?.contextInfo?.disappearingMode?.initiator || "Informação não disponível";
          const trigger = data?.messages?.[0]?.message?.audioMessage?.contextInfo?.disappearingMode?.trigger || "Informação não disponível";
          const quotedRaw = data?.messages?.[0]?.message?.audioMessage?.contextInfo?.quotedMessage;
          const quotedMessage = quotedRaw && typeof quotedRaw === "object" ? extractQuotedData(quotedRaw) : quotedRaw || "Informação não disponível";

          extractedData = {
            url,
            mimetype,
            fileSha256,
            fileLength,
            seconds,
            mediaKey,
            fileEncSha256,
            directPath,
            mediaKeyTimestamp,
            expiration,
            initiator,
            trigger,
            quotedMessage,
          };
        }
        break;

      default:
        extractedData = { info: "Tipo não identificado" };
        break;
    }

    console.log(
      "Mensagem Processada:",
      JSON.stringify(
        {
          Tipo: messageType,
          "Horário da Mensagem": messageTime,
          "Nome do Usuário": userName,
          Status: status,
          "ID Remoto": remoteJid,
          "Enviado por Mim": fromMe,
          "ID da Mensagem": messageID,
          "ID do Usuário": userID,
          "Dados Extraídos": extractedData,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Erro ao processar a mensagem:", error);
  }
}

module.exports = { userMessageProcess };
