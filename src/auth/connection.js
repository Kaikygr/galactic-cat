/**
 * @fileoverview Este arquivo contém a lógica de conexão e reconexão com o WhatsApp usando a biblioteca Baileys.
 * Ele gerencia eventos, autenticação e métricas de desempenho.
 */

/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const {
  default: makeWASocket,
  Browsers,
  makeInMemoryStore
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const path = require("path");
const NodeCache = require("node-cache");
const chalk = require("chalk");
const os = require("os");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const fs = require("fs");
const RateLimiter = require("./rateLimiter");

const pairingCode = process.argv.includes("--code");
const RECONNECT_TIMEOUT = 5000;
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

const RECONNECT_INITIAL_DELAY = 2000;
const RECONNECT_MAX_DELAY = 60000;
let reconnectAttempts = 0;
let metricsIntervalId = null;
const messageRateLimiter = new RateLimiter(500); // Limita a 10 mensagens por segundo
messageRateLimiter.start();

/**
 * Loga uma mensagem no console com um nível de severidade.
 * @param {string} message - A mensagem a ser logada.
 * @param {string} [level="INFO"] - O nível de severidade da mensagem.
 */
const logMessage = (message, level = "INFO") => {
  const date = new Date().toISOString();
  const colors = { INFO: chalk.green, WARN: chalk.yellow, ERROR: chalk.red };
  console.log(
    chalk.gray(`[${date}]`),
    colors[level] ? colors[level](message) : message
  );
};

/**
 * Formata um número para ter dois dígitos.
 * @param {number} s - O número a ser formatado.
 * @returns {string} O número formatado.
 */
const pad = s => (s < 10 ? "0" + s : s);

/**
 * Formata o tempo de atividade em horas, minutos e segundos.
 * @param {number} seconds - O tempo de atividade em segundos.
 * @returns {string} O tempo de atividade formatado.
 */
const formatUptime = seconds => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

/**
 * Aplica um patch em mensagens interativas.
 * @param {object} message - A mensagem a ser patchada.
 * @returns {object} A mensagem patchada.
 */
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

/**
 * Agenda uma tentativa de reconexão com um atraso exponencial.
 */
const scheduleReconnect = () => {
  reconnectAttempts++;
  const delay = Math.min(
    RECONNECT_INITIAL_DELAY * 2 ** reconnectAttempts,
    RECONNECT_MAX_DELAY
  );
  setTimeout(() => connectToWhatsApp(), delay);
};

/**
 * Reporta métricas de desempenho como tempo de atividade, uso de memória e carga do sistema.
 */
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

/**
 * Registra todos os manipuladores de eventos para o cliente do WhatsApp.
 * @param {object} client - O cliente do WhatsApp.
 * @param {function} saveCreds - Função para salvar as credenciais.
 */
const registerAllEventHandlers = (client, saveCreds) => {
  const simpleEvents = {
    "chats.upsert": () => {},
    "contacts.upsert": () => {}
  };
  Object.entries(simpleEvents).forEach(([event, handler]) =>
    client.ev.on(event, handler)
  );

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
  Object.entries(groupEvents).forEach(([event, handler]) =>
    client.ev.on(event, handler)
  );

  client.ev.process(async events => {
    const eventHandlers = {
      "connection.update": async data =>
        await handleConnectionUpdate(data, client),
      "creds.update": async data => {
        await saveCreds();
      },
      "messages.upsert": async data => {
        messageRateLimiter.enqueue(() =>
          require(path.join(
            __dirname,
            "..",
            "controllers",
            "botController.js"
          ))(data, client)
        );
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

/**
 * Manipula atualizações de conexão, incluindo abertura e fechamento de conexão.
 * @param {object} update - Os dados de atualização da conexão.
 * @param {object} client - O cliente do WhatsApp.
 */
const handleConnectionUpdate = async (update, client) => {
  try {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      logMessage("✅ Conexão aberta com sucesso. Bot disponível.");
      reconnectAttempts = 0;
      if (!metricsIntervalId) {
        metricsIntervalId = setInterval(reportMetrics, 60000);
      }
      const config = require(path.join(
        __dirname,
        "..",
        "auth",
        "data",
        "options.json"
      ));
      await client.sendMessage(config.owner.number, {
        text: "Status: Conexão aberta."
      });
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

/**
 * Conecta ao WhatsApp e registra eventos.
 */
const connectToWhatsApp = async () => {
  try {
    const connectionLogs = path.join(__dirname, "temp");
    const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);
    logMessage("Iniciando a conexão com o WhatsApp...");

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
      logMessage(
        "Não registrado, iniciando emparelhamento via QR Code...",
        "WARN"
      );
      try {
        await handlePairing(client);
      } catch (error) {}
    }
  } catch (error) {
    scheduleReconnect();
  }
};

connectToWhatsApp().catch(async error => {
  scheduleReconnect();
});
