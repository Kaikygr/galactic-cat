const chalk = require('chalk');
const { updateUserRank, updateGroupRank } = require('../db/rankings');

function logMessageInfo(info, additionalInfo) {
  const messageDate = new Date(info.messageTimestamp * 1000).toISOString();
  
  if (additionalInfo.isGroup) {
    updateUserRank(info.key.participant, info.pushName, messageDate, additionalInfo.messageType);
    updateGroupRank(
      additionalInfo.groupId,
      info.key.participant,
      additionalInfo.groupName,
      info.pushName,
      messageDate,
      additionalInfo.messageType
    );
  } else {
    updateUserRank(info.key.remoteJid, info.pushName, messageDate, additionalInfo.messageType);
  }
  
  console.log(chalk.yellow.bold('--- Mensagem Recebida ---'));
  console.log(
    chalk.yellow.bold('Remetente:'), 
    chalk.green.bold(additionalInfo.isGroup ? info.key.participant : info.key.remoteJid)
  );
  console.log(chalk.yellow.bold('Nome do Remetente:'), chalk.green.bold(info.pushName));
  console.log(chalk.yellow.bold('Mensagem:'), chalk.green.bold(info.message.conversation));
  console.log(chalk.yellow.bold('Timestamp:'), chalk.green.bold(new Date(info.messageTimestamp * 1000).toLocaleString()));
  console.log(chalk.yellow.bold('ID da Mensagem:'), chalk.green.bold(info.key.id));
  console.log(chalk.yellow.bold('Tipo de Mensagem:'), chalk.green.bold(additionalInfo.messageType));
  console.log(chalk.yellow.bold('Privado ou Grupo:'), chalk.green.bold(additionalInfo.isGroup ? 'Grupo' : 'Privado'));
  if (additionalInfo.isGroup) {
    console.log(chalk.yellow.bold('Nome do Grupo:'), chalk.green.bold(additionalInfo.groupName));
    console.log(chalk.yellow.bold('ID do Grupo:'), chalk.green.bold(additionalInfo.groupId));
  }
  console.log(chalk.yellow.bold('-------------------------\n\n'));
}

module.exports = { logMessageInfo };
