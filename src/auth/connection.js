const { default: makeWASocket, Browsers, makeInMemoryStore } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const NodeCache = require("node-cache");
const os = require("os");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console()]
});

const pairingCode = process.argv.includes("--code");
const RECONNECT_TIMEOUT = 5000;
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

const RECONNECT_INITIAL_DELAY = 2000;
const RECONNECT_MAX_DELAY = 60000;
let reconnectAttempts = 0;
let metricsIntervalId = null;

const pad = s => (s < 10 ? "0" + s : s);

const formatUptime = seconds => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

const patchInteractiveMessage = message => {
  return message?.interactiveMessage
    ? {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadataVersion: 2,
              deviceListMetadata: {}
            },
            ...message
          }
        }
      }
    : message;
};

const scheduleReconnect = () => {
  reconnectAttempts++;
  const delay = Math.min(RECONNECT_INITIAL_DELAY * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY);
  setTimeout(() => connectToWhatsApp(), delay);
};

const reportMetrics = () => {
  const uptime = formatUptime(process.uptime());
  const memUsage = process.memoryUsage();
  const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2);
  const rss = (memUsage.rss / 1024 / 1024).toFixed(2);
  const loadAvg = os
    .loadavg()
    .map(n => n.toFixed(2))
    .join(", ");
  const metricsMessage = `Métricas -> Uptime: ${uptime}, RSS: ${rss} MB, Total Mem: ${totalMem} MB, Load: ${loadAvg}`;
};

const registerAllEventHandlers = (client, saveCreds) => {
  const simpleEvents = {
    "chats.upsert": () => {},
    "contacts.upsert": () => {}
  };
  Object.entries(simpleEvents).forEach(([event, handler]) => client.ev.on(event, handler));

  const groupEvents = {
    "groups.update": async ([event]) => {
      const metadata = await client.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    },
    "group-participants.update": async event => {
      const metadata = await client.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    }
  };
  Object.entries(groupEvents).forEach(([event, handler]) => client.ev.on(event, handler));

  client.ev.process(async events => {
    const eventHandlers = {
      "connection.update": async data => await handleConnectionUpdate(data, client),
      "creds.update": async data => {
        await saveCreds();
      },
      "messages.upsert": async data => {
        require(path.join(__dirname, "..", "controllers", "botController.js"))(data, client);
      }
    };
    for (const [event, data] of Object.entries(events)) {
      try {
        if (eventHandlers[event]) {
          await eventHandlers[event](data);
        }
      } catch (error) {}
    }
  });
};

const handleConnectionUpdate = async (update, client) => {
  try {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      logger.info("✅ Conexão aberta com sucesso. Bot disponível.");
      reconnectAttempts = 0;
      if (!metricsIntervalId) {
        metricsIntervalId = setInterval(reportMetrics, 60000);
      }
      const config = require("../config/options.json");
      await client.sendMessage(config.owner.number, {
        text: "Status: Conexão aberta."
      });
      logger.info("Mensagem de status enviada para o proprietário.");
    }
    if (connection === "close") {
      if (metricsIntervalId) {
        clearInterval(metricsIntervalId);
        metricsIntervalId = null;
      }
      scheduleReconnect();
    }
  } catch (error) {
    scheduleReconnect();
  }
};

const connectToWhatsApp = async () => {
  try {
    const connectionLogs = path.join(__dirname, "temp");
    const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);
    logger.info("Iniciando a conexão com o WhatsApp...");

    const client = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      mobile: false,
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: true,
      cachedGroupMetadata: async jid => groupCache.get(jid),
      patchMessageBeforeSending: patchInteractiveMessage
    });

    const store = makeInMemoryStore({});
    store.bind(client.ev);
    registerAllEventHandlers(client, saveCreds);

    if (pairingCode && !client.authState.creds.registered) {
      logger.warn("Não registrado, iniciando emparelhamento via QR Code...");
      try {
        await handlePairing(client);
      } catch (error) {
        logger.error(`Erro no emparelhamento: ${error.message}`);
      }
    }
  } catch (error) {
    scheduleReconnect();
    logger.error(`Erro ao iniciar a conexão: ${error.message}`);
    process.exit(1);
  }
};

connectToWhatsApp().catch(async error => {
  scheduleReconnect();
  logger.error(`Erro ao iniciar a conexão: ${error.message}`);
  process.exit(1);
});
