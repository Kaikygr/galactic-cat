/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { default: makeWASocket, useInMemoryStore, DisconnectReason, WAGroupMetadata, relayWAMessage, MediaPathMap, mentionedJid, processTime, MediaType, Browser, MessageType, Presence, Mimetype, Browsers, delay, fetchLatestBaileysVersion, MessageRetryMap, extractGroupMetadata, generateWAMessageFromContent, proto, otherOpts, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const colors = require("colors");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const options = require("../commands/data/options.json");
const os = require("os");

const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

const pairingCode = process.argv.includes("--code");

async function connectToWhatsApp() {
  const connectionLogs = "./initialize/auth";
  const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);

  console.log(colors.cyan("🔌 Iniciando a conexão com o WhatsApp..."));

  const client = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    mobile: false,
    browser: ["FireFox ( Ubuntu )", "1.0.0"],
    patchMessageBeforeSending: patchInteractiveMessage
  });
  
  if (pairingCode && !client.authState.creds.registered) {
    console.log(colors.yellow("🔑 Não registrado, iniciando emparelhamento via QR Code..."));
    await handlePairing(client);
  }

  client.ev.process(async events => {
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
    
    if (events["group-participants.update"]) {
      const gpUpdate = events["group-participants.update"];
      if (Array.isArray(gpUpdate)) {
        for (const event of gpUpdate) {
          await handleGroupParticipantsUpdate(event, client);
        }
      } else {
        await handleGroupParticipantsUpdate(gpUpdate, client);
      }
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
    console.log(colors.green("✅ Conexão aberta com sucesso. Bot disponível."));
    const ownerJid = options.owner.number;
    const systemInfo = `Sistema: ${os.platform()} ${os.release()}
Arquitetura: ${os.arch()}
CPU: ${os.cpus()[0].model}`;
    const sessionInfo = `Olá ${options.owner.name}, o bot está ativo!
ID: ${client.user?.id || "N/A"}
Nome: ${client.user?.name || "N/A"}
Status: Conectado.
${systemInfo}`;
    await client.sendMessage(ownerJid, { text: sessionInfo });
  }

  if (connection === "close") {
    console.log(colors.red("❌ Conexão fechada. Tentando reconectar..."));
    if (lastDisconnect?.error) {
      console.log(colors.yellow("Erro de desconexão:"), JSON.stringify(lastDisconnect.error, null, 2));
    }
    console.log(colors.yellow("⏳ Tentando reconectar em breve..."));
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

async function handleGroupParticipantsUpdate(event, client) {
  if (event.action === "add" || event.action === "remove") {
    for (const participant of event.participants) {
      let messageText = "";
      if (event.action === "add") {
        messageText = `Olá @${participant.split("@")[0]}, seja bem-vindo ao grupo!`;
      } else if (event.action === "remove") {
        messageText = `Tchau @${participant.split("@")[0]}, sentimos sua falta!`;
      }
      await client.sendMessage(event.id, { text: messageText, mentions: [participant] });
    }
  } else {
    if (event.author !== options.owner.number) {
      const message = `Evento de grupo para outros usuários:
ID: ${event.id}
Action: ${event.action}
Participantes: ${event.participants.join(", ")}
Author: ${event.author || "N/A"}`;
      if (options.others && options.others.number) {
        await client.sendMessage(options.others.number, { text: message });
      } else {
        console.log(colors.magenta("Sessão Outros Usuários:"), message);
      }
    }
  }
}

connectToWhatsApp().catch(async error => {
  console.error(colors.red.bold(`🚨 Erro na conexão do WhatsApp: ${error.message}`));
  console.error(colors.yellow(`🔧 Stack Trace: \n${error.stack}`));
  console.log(colors.magenta("🔄 Tentando reconectar..."));
  setTimeout(() => connectToWhatsApp(), 5000);
});
