const chalk = require("chalk");
const moment = require("moment-timezone");

const yellowColor = chalk.bold.yellowBright;
const redColor = chalk.bold.redBright;
const cyanColor = chalk.bold.cyanBright;

var hora = moment.tz("America/Sao_Paulo").format("HH:mm:ss");
var data = moment.tz("America/Sao_Paulo").format("DD/MM/YYYY");
const advancedLogger = {
  info: (msg) => {
    const time = new Date().toLocaleTimeString("pt-BR");
    console.log(`[${time}] ${chalk.blue.bold("INFO")}: ${msg}`);
  },
  warn: (msg) => {
    const time = new Date().toLocaleTimeString("pt-BR");
    console.log(`[${time}] ${chalk.keyword("orange").bold("WARN")}: ${msg}`);
  },
  error: (msg) => {
    const time = new Date().toLocaleTimeString("pt-BR");
    console.log(`[${time}] ${chalk.red.bold("ERROR")}: ${msg}`);
  },
  debug: (msg) => {
    const time = new Date().toLocaleTimeString("pt-BR");
    console.log(`[${time}] ${chalk.magenta.bold("DEBUG")}: ${msg}`);
  },
  success: (msg) => {
    const time = new Date().toLocaleTimeString("pt-BR");
    console.log(`[${time}] ${chalk.green.bold("SUCCESS")}: ${msg}`);
  }
};

function logAll(message, level = "info") {
  if (advancedLogger[level]) {
    advancedLogger[level](message);
  } else {
    advancedLogger.info(message);
  }
}

function printMessage(info, type, nome, sender, isBot, isGroup) {
  let messageContent = "N/A";
  if (info.message?.conversation) {
    messageContent = info.message.conversation;
  } else if (info.message?.extendedTextMessage?.text) {
    messageContent = info.message.extendedTextMessage.text;
  }

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
${yellowColor("Texto:")} ${cyanColor(messageContent)}
${yellowColor("remoteJid:")} ${cyanColor(JSON.stringify(info.key.remoteJid, null, 2))}
${yellowColor("ID:")} ${cyanColor(JSON.stringify(info.key.id, null, 2))}`;
advancedLogger.info(`Process ID: ${process.pid} | Node version: ${process.version}`);
  if (!isBot) {
    const lineSeparator = "\n" + "-".repeat(50) + "\n";
    const header = chalk.bold.cyan("📩 MENSAGEM RECEBIDA 📩");

    let contextInfo;
    if (isGroup) {
      contextInfo = `${yellowColor("Tipo:")} ${redColor(type)} ${yellowColor(" ( em grupo )")}`;
    } else {
      contextInfo = `${yellowColor("Tipo:")} ${redColor(type)} ${yellowColor(" ( no privado )")}`;
    }

    advancedLogger.info(`${lineSeparator}${header}\n${contextInfo}\n${MsgConsole}${lineSeparator}`);
  }
}

function log(message, level = 'info') {
  const time = new Date().toLocaleTimeString("pt-BR");
  const prefix = level === "error" ? chalk.red.bold("ERROR") : chalk.blue.bold("INFO");
  console.log(`[${time}] ${prefix}: ${message}`);
}

module.exports = {
  printMessage,
  logger: advancedLogger,
  logAll,
  log
};
