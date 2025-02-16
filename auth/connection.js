/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { default: makeWASocket, useInMemoryStore, DisconnectReason, WAGroupMetadata, relayWAMessage, MediaPathMap, mentionedJid, processTime, MediaType, Browser, MessageType, Presence, Mimetype, Browsers, delay, fetchLatestBaileysVersion, MessageRetryMap, extractGroupMetadata, generateWAMessageFromContent, proto, otherOpts, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const colors = require("colors");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const config = require("./data/options.json");
const os = require("os");
const fs = require("fs");
const path = require("path");
const axios = require('axios');

const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

const pairingCode = process.argv.includes("--code");

const groupConfigPath = path.join(__dirname, "data","groupConfig.json");
if (!fs.existsSync(groupConfigPath)) {
  fs.writeFileSync(groupConfigPath, JSON.stringify({}, null, 2));
}

let groupConfigs = {};
try {
  groupConfigs = JSON.parse(fs.readFileSync(groupConfigPath, "utf8"));
} catch (error) {
  console.log("Nenhuma configuração de grupos encontrada, usando mensagens genéricas.");
}

async function connectToWhatsApp() {
  const connectionLogs = "./auth/temp";
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
      require("../src/commands/index")(upsert, client);
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
    const ownerJid = config.owner.number;
    const systemInfo = `Sistema: ${os.platform()} ${os.release()}
Arquitetura: ${os.arch()}
CPU: ${os.cpus()[0].model}`;
    const sessionInfo = `Olá ${config.owner.name}, o bot está ativo!
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
  if (!groupConfigs[event.id]) {
    groupConfigs[event.id] = {
      status: "off",
      welcome: "",
      farewell: "",
      welcomeImage: "",
      farewellImage: ""
    };
    fs.writeFileSync(groupConfigPath, JSON.stringify(groupConfigs, null, 2));
  }
  
  const groupCfg = groupConfigs[event.id];
  if (groupCfg.status === "off") return;
  
  if (event.action === "add" || event.action === "remove") {
    let metadata = {};
    try {
      metadata = await client.groupMetadata(event.id);
    } catch (e) {
      console.log("Erro ao buscar metadados do grupo:", e.message);
      metadata = { subject: "grupo", desc: "", participants: [] };
    }
    const adminCount = Array.isArray(metadata.participants)
      ? metadata.participants.filter(p => p.admin).length
      : 0;
    const botNumber = client.user?.id.split(":")[0] + "@s.whatsapp.net";
    
    for (const participant of event.participants) {
      let messageText = "";
      let imageBuffer = null;
      
      if (event.action === "add") {
        if (groupCfg.welcomeImage) {
          try {
            const response = await axios.get(groupCfg.welcomeImage, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data, 'binary');
          } catch (e) {
            console.log("Erro ao baixar imagem de welcome:", e.message);
          }
        }
        messageText = groupCfg.welcome || `Olá #user, seja bem-vindo ao #gruponome!`;
      } else if (event.action === "remove") {
        if (groupCfg.farewellImage) {
          try {
            const response = await axios.get(groupCfg.farewellImage, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data, 'binary');
          } catch (e) {
            console.log("Erro ao baixar imagem de farewell:", e.message);
          }
        }
        messageText = groupCfg.farewell || `Tchau #user, sentimos sua falta no #gruponome!`;
      }
      
      const finalMessageText = messageText
        .replace(/#user/g, "@" + participant.split("@")[0])
        .replace(/#gruponome/g, metadata.subject || "")
        .replace(/#data/g, new Date().toLocaleString("pt-BR"))
        .replace(/#descrição/g, metadata.desc || "")
        .replace(/#usuários/g, metadata.participants.length)
        .replace(/#hora/g, new Date().toLocaleTimeString("pt-BR"))
        .replace(/#dataSimples/g, new Date().toLocaleDateString("pt-BR"))
        .replace(/#qtdAdmins/g, adminCount)
        .replace(/#botNumber/g, botNumber)
        .replace(/#ownerNumber/g, config.owner.number);
      
      if (imageBuffer) {
        await client.sendMessage(event.id, { image: imageBuffer, caption: finalMessageText, mentions: [participant] });
      } else {
        await client.sendMessage(event.id, { text: finalMessageText, mentions: [participant] });
      }
    }
  } else {
    console.log("a")
  }
}


connectToWhatsApp().catch(async error => {
  console.error(colors.red.bold(`🚨 Erro na conexão do WhatsApp: ${error.message}`));
  console.error(colors.yellow(`🔧 Stack Trace: \n${error.stack}`));
  console.log(colors.magenta("🔄 Tentando reconectar..."));
  setTimeout(() => connectToWhatsApp(), 5000);
});
