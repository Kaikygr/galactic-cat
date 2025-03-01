const chalk = require('chalk');

async function processMessage(info, client) {
  const isGroup = info.key.remoteJid.endsWith('@g.us');
  let groupInfo = {};

  if (isGroup) {
    groupInfo = await client.groupMetadata(info.key.remoteJid);
  }

  console.log(formatMessage(info, groupInfo));
}

function getMessageType(message) {
  if (message.conversation) return 'conversation';
  if (message.stickerMessage) return 'stickerMessage';
  if (message.extendedTextMessage) return 'extendedTextMessage';
  if (message.imageMessage) return 'imageMessage';
  if (message.videoMessage) return 'videoMessage';
  if (message.audioMessage) return 'audioMessage';
  if (message.documentMessage) return 'documentMessage';
  if (message.contactMessage) return 'contactMessage';
  if (message.locationMessage) return 'locationMessage';
  if (message.liveLocationMessage) return 'liveLocationMessage';
  if (message.reactionMessage) return 'reactionMessage';
  return 'unknown';
}

function formatMessage(info, groupInfo) {
  const isGroup = info.key.remoteJid.endsWith('@g.us');
  return `
${chalk.blue.bold('Mensagem recebida:')}
${chalk.green.bold('Remote JID:')} ${info.key.remoteJid}
${chalk.green.bold('From Me:')} ${info.key.fromMe}
${chalk.green.bold('ID:')} ${info.key.id}
${chalk.green.bold('Participant:')} ${info.key.participant || 'N/A'}
${chalk.green.bold('Timestamp:')} ${new Date(info.messageTimestamp * 1000).toLocaleString()}
${chalk.green.bold('Push Name:')} ${info.pushName}
${chalk.green.bold('Broadcast:')} ${info.broadcast}
${isGroup ? formatGroupInfo(groupInfo) : ''}
${chalk.green.bold('Message:')}
${formatMessageContent(info.message)}
\n`;
}

function formatGroupInfo(groupInfo) {
  return `${chalk.green.bold('Group Name:')} ${groupInfo.subject}
${chalk.green.bold('Group Participants:')} ${groupInfo.participants.length}
`;
}

function formatMessageContent(message) {
  if (message.conversation) {
    return `${chalk.yellow.bold('Conversation:')} ${message.conversation}`;
  } else if (message.stickerMessage) {
    return `${chalk.yellow.bold('Sticker Message:')}
    URL: ${message.stickerMessage.url}
    Mimetype: ${message.stickerMessage.mimetype}
    Height: ${message.stickerMessage.height}
    Width: ${message.stickerMessage.width}`;
  } else if (message.extendedTextMessage) {
    return `${chalk.yellow.bold('Extended Text Message:')} ${message.extendedTextMessage.text}`;
  } else if (message.imageMessage) {
    return `${chalk.yellow.bold('Image Message:')}
    URL: ${message.imageMessage.url}
    Mimetype: ${message.imageMessage.mimetype}
    Height: ${message.imageMessage.height}
    Width: ${message.imageMessage.width}`;
  } else if (message.videoMessage) {
    return `${chalk.yellow.bold('Video Message:')}
    URL: ${message.videoMessage.url}
    Mimetype: ${message.videoMessage.mimetype}
    Height: ${message.videoMessage.height}
    Width: ${message.videoMessage.width}
    Duration: ${message.videoMessage.seconds} seconds`;
  } else if (message.audioMessage) {
    return `${chalk.yellow.bold('Audio Message:')}
    URL: ${message.audioMessage.url}
    Mimetype: ${message.audioMessage.mimetype}
    Duration: ${message.audioMessage.seconds} seconds`;
  } else if (message.documentMessage) {
    return `${chalk.yellow.bold('Document Message:')}
    URL: ${message.documentMessage.url}
    Mimetype: ${message.documentMessage.mimetype}
    File Name: ${message.documentMessage.fileName}`;
  } else if (message.contactMessage) {
    return `${chalk.yellow.bold('Contact Message:')}
    Name: ${message.contactMessage.displayName}
    VCard: ${message.contactMessage.vcard}`;
  } else if (message.locationMessage) {
    return `${chalk.yellow.bold('Location Message:')}
    Latitude: ${message.locationMessage.degreesLatitude}
    Longitude: ${message.locationMessage.degreesLongitude}`;
  } else if (message.liveLocationMessage) {
    return `${chalk.yellow.bold('Live Location Message:')}
    Latitude: ${message.liveLocationMessage.degreesLatitude}
    Longitude: ${message.liveLocationMessage.degreesLongitude}`;
  } else if (message.reactionMessage) {
    return `${chalk.yellow.bold('Reaction Message:')}
    Reaction: ${message.reactionMessage.text}`;
  } else {
    return `${chalk.red.bold('Unknown Message Type:')} ${JSON.stringify(message, null, 2)}`;
  }
}

module.exports = { processMessage };
