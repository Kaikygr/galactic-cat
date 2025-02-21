/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { default: makeWASocket, Browsers, makeInMemoryStore } = require("@whiskeysockets/baileys");

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const path = require("path");
const NodeCache = require("node-cache");
const chalk = require("chalk");

const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

const pairingCode = process.argv.includes("--code");
const RECONNECT_TIMEOUT = 5000;
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

function logMessage(message, level = "INFO") {
  let coloredMsg;
  switch(level) {
    case "ERROR":
      coloredMsg = chalk.red(message);
      break;
    case "WARN":
      coloredMsg = chalk.yellow(message);
      break;
    default:
      coloredMsg = chalk.green(message);
  }
  console.log(chalk.gray(`[${new Date().toISOString()}]`), coloredMsg);
}

async function connectToWhatsApp() {
  try {
    const connectionLogs = path.join(__dirname, "temp");
    const storePath = path.join(connectionLogs, 'baileys_store.json'); // novo caminho para o arquivo
    const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);

    logMessage("Iniciando a conexão com o WhatsApp...");

    const client = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      mobile: false,
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: true,
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      patchMessageBeforeSending: patchInteractiveMessage
    });

    // INÍCIO: Inicialização do store em memória com arquivo na pasta "temp"
    const store = makeInMemoryStore({});
    store.readFromFile(storePath);
    setInterval(() => {
      store.writeToFile(storePath);
    }, 10_000);
    store.bind(client.ev);
    client.ev.on('chats.upsert', () => {
      console.log('got chats', store.chats.all());
    });
    client.ev.on('contacts.upsert', () => {
      console.log('got contacts', Object.values(store.contacts));
    });
    // FIM: Inicialização do store em memória

    // Atualiza o cache quando ocorrer alterações de grupos e participantes
    client.ev.on('groups.update', async ([event]) => {
      const metadata = await client.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    });

    client.ev.on('group-participants.update', async (event) => {
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
      // Tratamentos adicionais para eventos do Baileys
      try {
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

function scheduleReconnect() {
  logMessage("⏳ Tentando reconectar em breve...", "WARN");
  setTimeout(() => connectToWhatsApp(), RECONNECT_TIMEOUT);
}

async function handleConnectionUpdate(update, client) {
  try {
    const { connection, lastDisconnect } = update;
    const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode;

    if (connection === "open") {
      logMessage("✅ Conexão aberta com sucesso. Bot disponível.");
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
