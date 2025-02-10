const chalk = require("chalk");

const moment = require("moment-timezone");

const yellowColor = chalk.bold.yellowBright;
const redColor = chalk.bold.redBright;
const cyanColor = chalk.bold.cyanBright;

var hora = moment.tz("America/Sao_Paulo").format("HH:mm:ss");
var data = moment.tz("America/Sao_Paulo").format("DD/MM/YYYY");

module.exports = function printMessage(info, type, nome, sender, isBot, isGroup) {
  const TipoDispositivo =
    info.key.id.length === 20
      ? redColor("iPhone")
      : info.key.id.length === 32
      ? redColor("Android")
      : info.key.id.length === 16
      ? redColor("Baileys")
      : info.key.id.length === 22
      ? redColor("Web Browser")
      : info.key.id.length === 18
      ? redColor("Desktop")
      : info.key.id.length > 21
      ? redColor("Android")
      : redColor("WhatsApp web");

  const MsgConsole = `${yellowColor("Usuário:")} ${cyanColor(nome)}
${yellowColor("Número:")} ${cyanColor(`${sender.split("@")[0]}`)}
${yellowColor("Horário:")} ${cyanColor(hora + " - " + data)}
${yellowColor("Plataforma:")} ${cyanColor(TipoDispositivo)}
${yellowColor("remoteJid:")} ${cyanColor(JSON.stringify(info.key.remoteJid, null, 2))}
${yellowColor("ID:")} ${cyanColor(JSON.stringify(info.key.id, null, 2))}`;

  if (!isBot) {
    const lineSeparator = "\n" + "-".repeat(50) + "\n";
    const header = chalk.bold.cyan("📩 MENSAGEM RECEBIDA 📩");

    let contextInfo;
    if (isGroup) {
      contextInfo = `${yellowColor("Tipo:")} ${redColor(type)} ${yellowColor(" ( em grupo )")}`;
    } else {
      contextInfo = `${yellowColor("Tipo:")} ${redColor(type)} ${yellowColor(" ( no privado )")}`;
    }

    console.log(`${lineSeparator}${header}\n${contextInfo}\n${MsgConsole}${lineSeparator}`);
  }
};
