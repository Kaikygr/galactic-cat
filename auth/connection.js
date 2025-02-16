/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { default: makeWASocket, useInMemoryStore, DisconnectReason, WAGroupMetadata, relayWAMessage, MediaPathMap, mentionedJid, processTime, MediaType, Browser, MessageType, Presence, Mimetype, Browsers, delay, fetchLatestBaileysVersion, MessageRetryMap, extractGroupMetadata, generateWAMessageFromContent, proto, otherOpts, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const colors = require("colors");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const path = require("path");
const os = require("os");
const fs = require("fs");
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const config = require(path.join(__dirname, "data", "options.json"));

const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

const pairingCode = process.argv.includes("--code");

const db = new sqlite3.Database(path.join(__dirname, "data", "groups.db"));
db.run(`CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  status TEXT,
  welcome TEXT,
  farewell TEXT,
  welcomeImage TEXT,
  farewellImage TEXT
)`);

const { logger } = require(path.join(__dirname, "..", "src", "temp/log/console.js"));

// Funções auxiliares assíncronas para manipular a configuração de grupo
function getGroupConfigAsync(groupId) {
	return new Promise((resolve, reject) => {
		db.get("SELECT * FROM groups WHERE id = ?", [groupId], (err, row) => {
			if (err) return reject(err);
			resolve(row);
		});
	});
}

function createOrGetGroupConfigAsync(groupId) {
	return new Promise(async (resolve, reject) => {
		try {
			let config = await getGroupConfigAsync(groupId);
			if (config) return resolve(config);
			const defaultConfig = { id: groupId, status: "off", welcome: "", farewell: "", welcomeImage: "", farewellImage: "" };
			db.run("INSERT INTO groups (id, status, welcome, farewell, welcomeImage, farewellImage) VALUES (?, ?, ?, ?, ?, ?)",
				[groupId, defaultConfig.status, defaultConfig.welcome, defaultConfig.farewell, defaultConfig.welcomeImage, defaultConfig.farewellImage],
				function(err) {
					if (err) return reject(err);
					resolve(defaultConfig);
				});
		} catch (err) {
			reject(err);
		}
	});
}

async function connectToWhatsApp() {
  const connectionLogs = path.join(__dirname, "temp");
  const { state, saveCreds } = await useMultiFileAuthState(connectionLogs);

  logger.info("🔌 Iniciando a conexão com o WhatsApp...");

  const client = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    mobile: false,
    browser: ["FireFox ( Ubuntu )", "1.0.0"],
    patchMessageBeforeSending: patchInteractiveMessage
  });
  
  if (pairingCode && !client.authState.creds.registered) {
    logger.warn("🔑 Não registrado, iniciando emparelhamento via QR Code...");
    await handlePairing(client);
  }

  client.ev.process(async events => {
    Object.entries(events).forEach(([tipo, dado]) => {
    });

    if (events["connection.update"]) {
      await handleConnectionUpdate(events["connection.update"], client);
    }

    if (events["creds.update"]) {
      logger.info("💾 Credenciais atualizadas.");
      await saveCreds();
    }

    if (events["messages.upsert"]) {
      var upsert = events["messages.upsert"];
      require(path.join(__dirname, "..", "src", "commands", "index.js"))(upsert, client);
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
    logger.info("✅ Conexão aberta com sucesso. Bot disponível.");
    const ownerJid = config.owner.number;
    const systemInfo = `Sistema: ${os.platform()} ${os.release()}
Arquitetura: ${os.arch()}
CPU: ${os.cpus()[0].model}`;
    const sessionInfo = `Olá ${config.owner.name}, o bot está ativo!
ID: ${client.user?.id || "N/A"}
Nome: ${client.user?.name || "N/A"}
Status: Conectado.
Bot: ${config.bot.name}
Versão: ${config.bot.version}
Descrição: ${config.bot.description}
GitHub: ${config.github}
${systemInfo}`;
    await client.sendMessage(ownerJid, { text: sessionInfo });
  }

  if (connection === "close") {
    logger.error("❌ Conexão fechada. Tentando reconectar...");
    if (lastDisconnect?.error) {
      logger.warn("Erro de desconexão:" + JSON.stringify(lastDisconnect.error, null, 2));
    }
    logger.warn("⏳ Tentando reconectar em breve...");
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

async function handleGroupParticipantsUpdate(event, client) {
  let grupoConfig = await createOrGetGroupConfigAsync(event.id);
  if (grupoConfig.status === "off") return;
  
  if (event.action === "add" || event.action === "remove") {
    let metadata = {};
    try {
      metadata = await client.groupMetadata(event.id);
    } catch (e) {
      logger.error("Erro ao buscar metadados do grupo: " + e.message);
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
        if (grupoConfig.welcomeImage) {
          try {
            const response = await axios.get(grupoConfig.welcomeImage, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data, 'binary');
          } catch (e) {
            logger.error("Erro ao baixar imagem de welcome: " + e.message);
          }
        }
        messageText = grupoConfig.welcome || `Olá #user, seja bem-vindo ao #gruponome!`;
      } else if (event.action === "remove") {
        if (grupoConfig.farewellImage) {
          try {
            const response = await axios.get(grupoConfig.farewellImage, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data, 'binary');
          } catch (e) {
            logger.error("Erro ao baixar imagem de farewell: " + e.message);
          }
        }
        messageText = grupoConfig.farewell || `Tchau #user, sentimos sua falta no #gruponome!`;
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
    logger.debug("Atualização de participantes não processada.");
  }
}


connectToWhatsApp().catch(async error => {
  logger.error(`🚨 Erro na conexão do WhatsApp: ${error.message}`);
  logger.error(`🔧 Stack Trace: \n${error.stack}`);
  logger.info("🔄 Tentando reconectar...");
  setTimeout(() => connectToWhatsApp(), 5000);
});
