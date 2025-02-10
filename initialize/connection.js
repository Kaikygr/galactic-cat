/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, DisconnectReason, WAGroupMetadata, relayWAMessage, MediaPathMap, mentionedJid, processTime, MediaType, Browser, MessageType, Presence, Mimetype, Browsers, delay, fetchLatestBaileysVersion, MessageRetryMap, extractGroupMetadata, generateWAMessageFromContent, proto, otherOpts, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const colors = require("colors");
const pino = require("pino");
const { Boom } = require("@hapi/boom");

const pairingCode = process.argv.includes("--code");

async function connectToWhatsApp() {
  // Define o caminho para salvar os logs de conexão
  const connectionLogs = "./initialize/auth";
  const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);

  console.log(colors.cyan("🔌 Iniciando a conexão com o WhatsApp..."));

  // Cria uma instância do cliente WhatsApp
  const client = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    mobile: false,
    browser: ["FireFox ( Ubuntu )", "1.0.0"],
    patchMessageBeforeSending: patchInteractiveMessage
  });

  // Verifica se o emparelhamento via QR Code é necessário
  if (pairingCode && !client.authState.creds.registered) {
    console.log(colors.yellow("🔑 Não registrado, iniciando emparelhamento via QR Code..."));
    await handlePairing(client);
  }

  // Processa eventos do cliente e mostra todos os tipos de eventos em formato JSON
  client.ev.process(async events => {
    // Log de todos os tipos de eventos com JSON stringfy
    Object.entries(events).forEach(([tipo, dado]) => {
      console.log(colors.blue(`\n\nEvento: ${tipo}`), JSON.stringify(dado, null, 2));
    });

    if (events["connection.update"]) {
      await handleConnectionUpdate(events["connection.update"], client);
    }

    if (events["creds.update"]) {
      console.log(colors.magenta("💾 Credenciais atualizadas."));
      await saveCreds();
    }

    if (events["messages.upsert"]) {
      var upsert = events["messages.upsert"];
      require("./../commands/index")(upsert, client);
    }
  });
}

// Função para modificar mensagens interativas antes de enviá-las
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

// Função para lidar com atualizações de conexão
async function handleConnectionUpdate(update, client) {
  const { connection, lastDisconnect } = update;
  const shouldReconnect = new Boom(lastDisconnect?.error)?.output.statusCode;

  if (connection === "open") {
    console.log(colors.green("✅ Conexão aberta com sucesso. Bot disponível."));
  }

  if (connection === "close" && shouldReconnect) {
    console.log(colors.red("❌ Conexão fechada. Tentando reconectar..."));
    console.log(colors.yellow("⏳ Tentando reconectar em breve..."));
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

// Inicia a conexão com o WhatsApp e trata erros
connectToWhatsApp().catch(async error => {
  console.error(colors.red.bold(`🚨 Erro na conexão do WhatsApp: ${error.message}`));
  console.error(colors.yellow(`🔧 Stack Trace: \n${error.stack}`));
  console.log(colors.magenta("🔄 Tentando reconectar..."));
  setTimeout(() => connectToWhatsApp(), 5000);
});
