const chalk = require('chalk');

const processMessage = async (info, client) => {
	const isGroup = info.key.remoteJid.endsWith('@g.us');
	const groupInfo = isGroup ? await client.groupMetadata(info.key.remoteJid) : {};
	console.log(formatMessage(info, groupInfo));
};

const getMessageType = message => {
	const types = [
		'conversation',
		'stickerMessage',
		'extendedTextMessage',
		'imageMessage',
		'videoMessage',
		'audioMessage',
		'documentMessage',
		'contactMessage',
		'locationMessage',
		'liveLocationMessage',
		'reactionMessage'
	];
	return types.find(type => message[type]) || 'unknown';
};

const formatGroupInfo = groupInfo => {
	if (!groupInfo || !groupInfo.subject) return '';
	return `
${chalk.green.bold('Group Name:')} ${groupInfo.subject}
${chalk.green.bold('Group Participants:')} ${Array.isArray(groupInfo.participants) ? groupInfo.participants.length : 'N/A'}`;
};

const formatMessageContent = message => {
	if (message.conversation) {
		return `${chalk.yellow.bold('Conversation:')} ${message.conversation}`;
	}
	if (message.stickerMessage) {
		const { url, mimetype, height, width } = message.stickerMessage;
		return `${chalk.yellow.bold('Sticker Message:')}
    URL: ${url}
    Mimetype: ${mimetype}
    Height: ${height}
    Width: ${width}`;
	}
	if (message.extendedTextMessage) {
		return `${chalk.yellow.bold('Extended Text Message:')} ${message.extendedTextMessage.text}`;
	}
	if (message.imageMessage) {
		const { url, mimetype, height, width } = message.imageMessage;
		return `${chalk.yellow.bold('Image Message:')}
    URL: ${url}
    Mimetype: ${mimetype}
    Height: ${height}
    Width: ${width}`;
	}
	if (message.videoMessage) {
		const { url, mimetype, height, width, seconds } = message.videoMessage;
		return `${chalk.yellow.bold('Video Message:')}
    URL: ${url}
    Mimetype: ${mimetype}
    Height: ${height}
    Width: ${width}
    Duration: ${seconds} seconds`;
	}
	if (message.audioMessage) {
		const { url, mimetype, seconds } = message.audioMessage;
		return `${chalk.yellow.bold('Audio Message:')}
    URL: ${url}
    Mimetype: ${mimetype}
    Duration: ${seconds} seconds`;
	}
	if (message.documentMessage) {
		const { url, mimetype, fileName } = message.documentMessage;
		return `${chalk.yellow.bold('Document Message:')}
    URL: ${url}
    Mimetype: ${mimetype}
    File Name: ${fileName}`;
	}
	if (message.contactMessage) {
		const { displayName, vcard } = message.contactMessage;
		return `${chalk.yellow.bold('Contact Message:')}
    Name: ${displayName}
    VCard: ${vcard}`;
	}
	if (message.locationMessage) {
		const { degreesLatitude, degreesLongitude } = message.locationMessage;
		return `${chalk.yellow.bold('Location Message:')}
    Latitude: ${degreesLatitude}
    Longitude: ${degreesLongitude}`;
	}
	if (message.liveLocationMessage) {
		const { degreesLatitude, degreesLongitude } = message.liveLocationMessage;
		return `${chalk.yellow.bold('Live Location Message:')}
    Latitude: ${degreesLatitude}
    Longitude: ${degreesLongitude}`;
	}
	if (message.reactionMessage) {
		return `${chalk.yellow.bold('Reaction Message:')}
    Reaction: ${message.reactionMessage.text}`;
	}
	return `${chalk.red.bold('Unknown Message Type:')} ${JSON.stringify(message, null, 2)}`;
};

const formatMessage = (info, groupInfo) => {
	const { key, message, pushName, broadcast, messageTimestamp } = info;
	const isGroup = key.remoteJid.endsWith('@g.us');
	return `
${chalk.blue.bold('Mensagem recebida:')}
${chalk.green.bold('Remote JID:')} ${key.remoteJid}
${chalk.green.bold('From Me:')} ${key.fromMe}
${chalk.green.bold('ID:')} ${key.id}
${chalk.green.bold('Participant:')} ${key.participant || 'N/A'}
${chalk.green.bold('Timestamp:')} ${new Date(messageTimestamp * 1000).toLocaleString()}
${chalk.green.bold('Push Name:')} ${pushName}
${chalk.green.bold('Broadcast:')} ${broadcast}
${isGroup ? formatGroupInfo(groupInfo) : ''}
${chalk.green.bold('Message:')}
${formatMessageContent(message)}
`;
};

module.exports = { processMessage, getMessageType };
