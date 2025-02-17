/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { default: makeWASocket } = require("@whiskeysockets/baileys");

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const path = require("path");

const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

const pairingCode = process.argv.includes("--code");

async function connectToWhatsApp() {
  const connectionLogs = path.join(__dirname, "temp");
  const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);

  console.log("Iniciando a conexão com o WhatsApp...");

  const client = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    mobile: false,
    browser: ["FireFox", "1.2.0"],
    patchMessageBeforeSending: patchInteractiveMessage
  });

  if (pairingCode && !client.authState.creds.registered) {
    console.log("Não registrado, iniciando emparelhamento via QR Code...");
    await handlePairing(client);
  }

  client.ev.process(async events => {
    if (events["connection.update"]) {
      await handleConnectionUpdate(events["connection.update"], client);
    }

    if (events["creds.update"]) {
      console.log("Credenciais atualizadas.");
      await saveCreds();
    }

    if (events["messages.upsert"]) {
      var upsert = events["messages.upsert"];
      require(path.join(__dirname, "..", "src", "commands", "index.js"))(
        upsert,
        client
      );
    }
  });
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

async function handleConnectionUpdate(update, client) {
  const { connection, lastDisconnect } = update;
  const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode;

  if (connection === "open") {
    console.log("✅ Conexão aberta com sucesso. Bot disponível.");
  }

  if (connection === "close") {
    console.log("❌ Conexão fechada. Tentando reconectar...");
    if (lastDisconnect?.error) {
      console.log(
        "Erro de desconexão:" + JSON.stringify(lastDisconnect.error, null, 2)
      );
    }
    console.log("⏳ Tentando reconectar em breve...");
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

connectToWhatsApp().catch(async error => {
  console.log(`🚨 Erro na conexão do WhatsApp: ${error.message}`);
  console.log(`🔧 Stack Trace: \n${error.stack}`);
  console.log("🔄 Tentando reconectar...");
  setTimeout(() => connectToWhatsApp(), 5000);
});
