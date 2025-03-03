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
Group Name: ${groupInfo.subject}
Group Participants: ${Array.isArray(groupInfo.participants) ? groupInfo.participants.length : 'N/A'}`;
};

const formatMessageContent = message => {
	if (message.conversation) {
		return `Conversation: ${message.conversation}`;
	}
	if (message.stickerMessage) {
		const { url, mimetype, height, width } = message.stickerMessage;
		return `Sticker Message:
    URL: ${url}
    Mimetype: ${mimetype}
    Height: ${height}
    Width: ${width}`;
	}
	if (message.extendedTextMessage) {
		return `Extended Text Message: ${message.extendedTextMessage.text}`;
	}
	if (message.imageMessage) {
		const { url, mimetype, height, width } = message.imageMessage;
		return `Image Message:
    URL: ${url}
    Mimetype: ${mimetype}
    Height: ${height}
    Width: ${width}`;
	}
	if (message.videoMessage) {
		const { url, mimetype, height, width, seconds } = message.videoMessage;
		return `Video Message:
    URL: ${url}
    Mimetype: ${mimetype}
    Height: ${height}
    Width: ${width}
    Duration: ${seconds} seconds`;
	}
	if (message.audioMessage) {
		const { url, mimetype, seconds } = message.audioMessage;
		return `Audio Message:
    URL: ${url}
    Mimetype: ${mimetype}
    Duration: ${seconds} seconds`;
	}
	if (message.documentMessage) {
		const { url, mimetype, fileName } = message.documentMessage;
		return `Document Message:
    URL: ${url}
    Mimetype: ${mimetype}
    File Name: ${fileName}`;
	}
	if (message.contactMessage) {
		const { displayName, vcard } = message.contactMessage;
		return `Contact Message:
    Name: ${displayName}
    VCard: ${vcard}`;
	}
	if (message.locationMessage) {
		const { degreesLatitude, degreesLongitude } = message.locationMessage;
		return `Location Message:
    Latitude: ${degreesLatitude}
    Longitude: ${degreesLongitude}`;
	}
	if (message.liveLocationMessage) {
		const { degreesLatitude, degreesLongitude } = message.liveLocationMessage;
		return `Live Location Message:
    Latitude: ${degreesLatitude}
    Longitude: ${degreesLongitude}`;
	}
	if (message.reactionMessage) {
		return `Reaction Message:
    Reaction: ${message.reactionMessage.text}`;
	}
	return `Unknown Message Type: ${JSON.stringify(message, null, 2)}`;
};

const formatMessage = (info, groupInfo) => {
	const { key, message, pushName, broadcast, messageTimestamp } = info;
	const isGroup = key.remoteJid.endsWith('@g.us');
	return `
Mensagem recebida:
Remote JID: ${key.remoteJid}
From Me: ${key.fromMe}
ID: ${key.id}
Participant: ${key.participant || 'N/A'}
Timestamp: ${new Date(messageTimestamp * 1000).toLocaleString()}
Push Name: ${pushName}
Broadcast: ${broadcast}
${isGroup ? formatGroupInfo(groupInfo) : ''}
Message:
${formatMessageContent(message)}
`;
};

module.exports = { processMessage, getMessageType };
