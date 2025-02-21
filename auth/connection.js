/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { default: makeWASocket, Browsers, makeInMemoryStore } = require("@whiskeysockets/baileys");

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const path = require("path");
const NodeCache = require("node-cache");
const chalk = require("chalk");
const os = require("os");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const fs = require("fs");
const logFilePath = path.join(__dirname, "temp", "connection.log");

const pairingCode = process.argv.includes("--code");
const RECONNECT_TIMEOUT = 5000;
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

/**
 * Loga mensagens no console e em arquivo.
 * @param {string} message - Mensagem a ser logada.
 * @param {string} [level='INFO'] - Nível do log: INFO, WARN, ERROR.
 */
function logMessage(message, level = "INFO") {
  const date = new Date().toISOString();
  let coloredMsg, plainMsg;
  // Escolhe a cor do log conforme o nível
  switch (level) {
    case "ERROR":
      coloredMsg = chalk.red(message);
      break;
    case "WARN":
      coloredMsg = chalk.yellow(message);
      break;
    default:
      coloredMsg = chalk.green(message);
  }
  plainMsg = `[${date}] ${level}: ${message}\n`;
  console.log(chalk.gray(`[${date}]`), coloredMsg);
  fs.appendFileSync(logFilePath, plainMsg); // Registra log em arquivo
}

/**
 * Estabelece conexão com o WhatsApp utilizando o baileys.
 * Gerencia reconexão, processamento de mensagens e outros eventos.
 */
async function connectToWhatsApp() {
  try {
    const connectionLogs = path.join(__dirname, "temp");
    const storePath = path.join(connectionLogs, "baileys_store.json");
    const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);

    logMessage("Iniciando a conexão com o WhatsApp...");

    const client = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      mobile: false,
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: true,
      cachedGroupMetadata: async jid => groupCache.get(jid), // Recupera cache de grupo
      patchMessageBeforeSending: patchInteractiveMessage
    });

    // Cria/ler store em memória de chats
    const store = makeInMemoryStore({});
    store.readFromFile(storePath);
    setInterval(() => {
      store.writeToFile(storePath);
    }, 10_000);
    store.bind(client.ev);
    client.ev.on("chats.upsert", () => {
      console.log("got chats", store.chats.all());
    });
    client.ev.on("contacts.upsert", () => {
      console.log("got contacts", Object.values(store.contacts));
    });

    client.ev.on("groups.update", async ([event]) => {
      const metadata = await client.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    });

    client.ev.on("group-participants.update", async event => {
      const metadata = await client.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    });

    if (pairingCode && !client.authState.creds.registered) {
      logMessage("Não registrado, iniciando emparelhamento via QR Code...", "WARN");
      try {
        await handlePairing(client);
      } catch (error) {
        logMessage("Erro durante o emparelhamento: " + error.message, "ERROR");
      }
    }

    client.ev.process(async events => {
      try {
        if (events["connection.update"]) {
          await handleConnectionUpdate(events["connection.update"], client);
        }
      } catch (error) {
        logMessage("Erro no evento connection.update: " + error.message, "ERROR");
      }
      try {
        if (events["creds.update"]) {
          logMessage("Credenciais atualizadas.");
          await saveCreds();
        }
      } catch (error) {
        logMessage("Erro ao salvar credenciais: " + error.message, "ERROR");
      }
      try {
        if (events["messages.upsert"]) {
          const upsert = events["messages.upsert"];
          require(path.join(__dirname, "..", "src", "commands", "index.js"))(upsert, client);
        }
      } catch (error) {
        logMessage("Erro ao processar mensagens: " + error.message, "ERROR");
      }

      try {
        // Processa eventos adicionais e realiza logs
        if (events["blocklist.set"]) {
          logMessage("Evento blocklist.set recebido: " + JSON.stringify(events["blocklist.set"]), "INFO");
        }
        if (events["blocklist.update"]) {
          logMessage("Evento blocklist.update recebido: " + JSON.stringify(events["blocklist.update"]), "INFO");
        }
        if (events["call"]) {
          logMessage("Evento call recebido: " + JSON.stringify(events["call"]), "INFO");
        }
        if (events["chats.delete"]) {
          logMessage("Evento chats.delete recebido: " + JSON.stringify(events["chats.delete"]), "INFO");
        }
        if (events["chats.phoneNumberShare"]) {
          logMessage("Evento chats.phoneNumberShare recebido: " + JSON.stringify(events["chats.phoneNumberShare"]), "INFO");
        }
        if (events["chats.update"]) {
          logMessage("Evento chats.update recebido: " + JSON.stringify(events["chats.update"]), "INFO");
        }
        if (events["chats.upsert"]) {
          logMessage("Evento chats.upsert recebido: " + JSON.stringify(events["chats.upsert"]), "INFO");
        }
        if (events["contacts.update"]) {
          logMessage("Evento contacts.update recebido: " + JSON.stringify(events["contacts.update"]), "INFO");
        }
        if (events["contacts.upsert"]) {
          logMessage("Evento contacts.upsert recebido: " + JSON.stringify(events["contacts.upsert"]), "INFO");
        }
        if (events["group-participants.update"]) {
          logMessage("Evento group-participants.update recebido: " + JSON.stringify(events["group-participants.update"]), "INFO");
        }
        if (events["group.join-request"]) {
          logMessage("Evento group.join-request recebido: " + JSON.stringify(events["group.join-request"]), "INFO");
        }
        if (events["groups.update"]) {
          logMessage("Evento groups.update recebido: " + JSON.stringify(events["groups.update"]), "INFO");
        }
        if (events["groups.upsert"]) {
          logMessage("Evento groups.upsert recebido: " + JSON.stringify(events["groups.upsert"]), "INFO");
        }
        if (events["labels.association"]) {
          logMessage("Evento labels.association recebido: " + JSON.stringify(events["labels.association"]), "INFO");
        }
        if (events["labels.edit"]) {
          logMessage("Evento labels.edit recebido: " + JSON.stringify(events["labels.edit"]), "INFO");
        }
        if (events["message-receipt.update"]) {
          logMessage("Evento message-receipt.update recebido: " + JSON.stringify(events["message-receipt.update"]), "INFO");
        }
        if (events["messages.delete"]) {
          logMessage("Evento messages.delete recebido: " + JSON.stringify(events["messages.delete"]), "INFO");
        }
        if (events["messages.media-update"]) {
          logMessage("Evento messages.media-update recebido: " + JSON.stringify(events["messages.media-update"]), "INFO");
        }
        if (events["messages.reaction"]) {
          logMessage("Evento messages.reaction recebido: " + JSON.stringify(events["messages.reaction"]), "INFO");
        }
        if (events["messages.update"]) {
          logMessage("Evento messages.update recebido: " + JSON.stringify(events["messages.update"]), "INFO");
        }
        if (events["messaging-history.set"]) {
          logMessage("Evento messaging-history.set recebido: " + JSON.stringify(events["messaging-history.set"]), "INFO");
        }
        if (events["presence.update"]) {
          logMessage("Evento presence.update recebido: " + JSON.stringify(events["presence.update"]), "INFO");
        }
      } catch (error) {
        logMessage("Erro ao processar eventos adicionais: " + error.message, "ERROR");
      }
    });
  } catch (error) {
    logMessage("Falha na função connectToWhatsApp: " + error.message, "ERROR");
    scheduleReconnect();
  }
}

/**
 * Ajusta mensagens interativas para compatibilidade.
 * @param {Object} message - Objeto da mensagem.
 * @returns {Object} - Mensagem modificada se interativa ou a original.
 */
function patchInteractiveMessage(message) {
  if (message?.interactiveMessage) {
    return {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadataVersion: 2,
            deviceListMetadata: {}
          },
          ...message
        }
      }
    };
  }
  return message;
}

/**
 * Agenda uma nova tentativa de conexão.
 */
function scheduleReconnect() {
  logMessage("⏳ Tentando reconectar em breve...", "WARN");
  setTimeout(() => connectToWhatsApp(), RECONNECT_TIMEOUT);
}

/**
 * Processa os updates de conexão e gerencia envio de notificações.
 * @param {Object} update - Evento de atualização da conexão.
 * @param {Object} client - Instância do cliente WhatsApp.
 */
async function handleConnectionUpdate(update, client) {
  try {
    const { connection, lastDisconnect } = update;
    const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode;

    if (connection === "open") {
      logMessage("✅ Conexão aberta com sucesso. Bot disponível.");

      // Função para formatar uptime
      const formatUptime = seconds => {
        const pad = s => (s < 10 ? "0" + s : s);
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
      };

      const config = require(path.join(__dirname, "..", "auth", "data", "options.json"));
      const botInfo = `Nome: ${config.bot.name}\nVersão: ${config.bot.version}\nDescrição: ${config.bot.description}`;
      const systemInfo = `Plataforma: ${process.platform}\nArquitetura: ${process.arch}\nNode: ${process.version}`;

      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2);
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(2);
      const processMem = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
      const memoryInfo = `Memória Total: ${totalMem} MB\nMemória Disponível: ${freeMem} MB\nUso do Processo: ${processMem} MB`;

      const uptimeInfo = `Uptime do Sistema: ${formatUptime(os.uptime())}\nUptime do Processo: ${formatUptime(process.uptime())}`;

      const cpus = os.cpus();
      const cpuInfo = `CPU: ${cpus[0].model}\nCores: ${cpus.length}\nLoad Average: ${os
        .loadavg()
        .map(n => n.toFixed(2))
        .join(", ")}`;

      const hostname = os.hostname();
      let ipAddress = "Indisponível";
      const networkInterfaces = os.networkInterfaces();
      for (const iface of Object.values(networkInterfaces)) {
        for (const alias of iface) {
          if (alias.family === "IPv4" && !alias.internal) {
            ipAddress = alias.address;
            break;
          }
        }
        if (ipAddress !== "Indisponível") break;
      }
      const hostInfo = `Hostname: ${hostname}\nIP: ${ipAddress}`;

      const completeMessage = `Status da Conexão: Aberta\n\n${botInfo}\n\n${systemInfo}\n\n${memoryInfo}\n\n${uptimeInfo}\n\n${cpuInfo}\n\n${hostInfo}`;

      // Notifica o dono da conexão aberta
      await client.sendMessage(config.owner.number, { text: `Conexão aberta com sucesso.\n${completeMessage}` });
    }

    if (connection === "close") {
      logMessage("❌ Conexão fechada. Tentando reconectar...", "WARN");
      if (lastDisconnect?.error) {
        logMessage("Erro de desconexão: " + JSON.stringify(lastDisconnect.error, null, 2), "ERROR");
      }
      scheduleReconnect();
    }
  } catch (error) {
    logMessage("Erro no handleConnectionUpdate: " + error.message, "ERROR");
    scheduleReconnect();
  }
}

connectToWhatsApp().catch(async error => {
  logMessage("🚨 Erro na conexão do WhatsApp: " + error.message, "ERROR");
  logMessage("🔧 Stack Trace: \n" + error.stack, "ERROR");
  logMessage("🔄 Tentando reconectar...", "WARN");
  scheduleReconnect();
});
