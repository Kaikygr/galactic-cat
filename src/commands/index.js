/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const colors = require("ansi-colors");
const fs = require("fs-extra");
const path = require("path");
const texts = require(path.join(__dirname, "../../data/jsons/texts.json"));

const { printMessage, logger } = require(path.join(__dirname, "../temp/log/console.js"));
const { geminiAIModel } = require(path.join(__dirname, "exports.js"));

const { getGroupAdmins } = require(path.join(
  __dirname,
  "../../utils/functions.js"
));

const ConfigfilePath = path.join(__dirname, "../../auth/data/options.json");
const config = require(ConfigfilePath);

const sqlite3 = require("sqlite3").verbose();
const { exec } = require("child_process");
const db = new sqlite3.Database(
  path.join(__dirname, "../../auth/data/groups.db")
);
db.run(`CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  status TEXT,
  welcome TEXT,
  farewell TEXT,
  welcomeImage TEXT,
  farewellImage TEXT
)`);

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
      const defaultConfig = {
        id: groupId,
        status: "off",
        welcome: "",
        farewell: "",
        welcomeImage: "",
        farewellImage: ""
      };
      db.run(
        "INSERT INTO groups (id, status, welcome, farewell, welcomeImage, farewellImage) VALUES (?, ?, ?, ?, ?, ?)",
        [
          groupId,
          defaultConfig.status,
          defaultConfig.welcome,
          defaultConfig.farewell,
          defaultConfig.welcomeImage,
          defaultConfig.farewellImage
        ],
        function (err) {
          if (err) return reject(err);
          resolve(defaultConfig);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

function updateGroupConfigAsync(groupId, field, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE groups SET ${field} = ? WHERE id = ?`,
      [value, groupId],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

function waitForResponse(client, from, sender, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      for (const msg of event.messages) {
        const msgFrom = msg.key.remoteJid;
        const msgSender = msg.key.participant || msg.key.remoteJid;
        if (msgFrom === from && msgSender === sender && !msg.key.fromMe) {
          client.ev.off("messages.upsert", onMessage);
          const resposta =
            msg.message?.conversation ||
            (msg.message?.extendedTextMessage &&
              msg.message.extendedTextMessage.text) ||
            "";
          clearTimeout(timer);
          return resolve(resposta);
        }
      }
    };
    
    client.ev.on("messages.upsert", onMessage);
    const timer = setTimeout(() => {
      client.ev.off("messages.upsert", onMessage);
      reject(new Error("Timeout"));
    }, timeout);
  });
}

async function connectToWhatsApp() {
  module.exports = client = async client => {
    module.exports = upsert = async (upsert, client) => {
      async function WhatsappUpsert() {
        for (const info of upsert?.messages || []) {
          const from = info.key.remoteJid;

          if (!info.message) return;
          if (upsert.type == "append") return;

          const baileys = require("@whiskeysockets/baileys");
          const content = JSON.stringify(info.message);
          const nome = info.pushName ? info.pushName : "";
          const quoted = info.quoted ? info.quoted : info;
          const type = baileys.getContentType(info.message);

          var body =
            info.message?.conversation ||
            info.message?.viewOnceMessageV2?.message?.imageMessage?.caption ||
            info.message?.viewOnceMessageV2?.message?.videoMessage?.caption ||
            info.message?.imageMessage?.caption ||
            info.message?.videoMessage?.caption ||
            info.message?.extendedTextMessage?.text ||
            info.message?.viewOnceMessage?.message?.videoMessage?.caption ||
            info.message?.viewOnceMessage?.message?.imageMessage?.caption ||
            info.message?.documentWithCaptionMessage?.message?.documentMessage
              ?.caption ||
            info.message?.buttonsMessage?.imageMessage?.caption ||
            info.message?.buttonsResponseMessage?.selectedButtonId ||
            info.message?.listResponseMessage?.singleSelectReply
              ?.selectedRowId ||
            info.message?.templateButtonReplyMessage?.selectedId ||
            (info.message?.interactiveResponseMessage?.nativeFlowResponseMessage
              ?.paramsJson
              ? JSON.parse(
                  info.message?.interactiveResponseMessage
                    ?.nativeFlowResponseMessage?.paramsJson
                )?.id
              : null) ||
            info?.text ||
            "";

          var budy =
            type === "conversation"
              ? info.message?.conversation
              : type === "extendedTextMessage"
              ? info.message?.extendedTextMessage?.text
              : "";

          const prefixes = Array.isArray(config.prefix) ? config.prefix : [config.prefix];
          const isCmd = prefixes.some(p => body.startsWith(p));
          const usedPrefix = prefixes.find(p => body.startsWith(p)) || "";
          const comando = isCmd ? body.slice(usedPrefix.length).trim().split(/ +/).shift().toLocaleLowerCase() : null;
          const args = isCmd ? body.trim().split(/ +/).slice(1) : [];

          const isGroup = from.endsWith("@g.us");
          const sender = isGroup ? info.key.participant : info.key.remoteJid;
          const groupMetadata = isGroup ? await client.groupMetadata(from) : "";
          const groupName = isGroup ? groupMetadata.subject : "";
          const groupDesc = isGroup ? groupMetadata.desc : "";
          const groupMembers = isGroup ? groupMetadata.participants : "";
          const groupAdmins = isGroup ? getGroupAdmins(groupMembers) : "";
          const messagesC = budy
            .slice(0)
            .trim()
            .split(/ +/)
            .shift()
            .toLowerCase();
          if (!comando && body.toLowerCase().includes("cat")) {
            comando = "cat";
          }
          const text = args.join(" ");
          const mime = (quoted.info || quoted).mimetype || "";
          const sleep = async ms => {
            return new Promise(resolve => setTimeout(resolve, ms));
          };
          const mentions = (teks, memberr, id) => {
            id == null || id == undefined || id == false
              ? client.sendMessage(from, {
                  text: teks.trim(),
                  mentions: memberr
                })
              : client.sendMessage(from, {
                  text: teks.trim(),
                  mentions: memberr
                });
          };

          const isBot = info.key.fromMe ? true : false;
          const isOwner = config.owner.number.includes(sender);
          const BotNumber = client.user.id.split(":")[0] + "@s.whatsapp.net";
          const isGroupAdmins = groupAdmins.includes(sender) || false;
          const isBotGroupAdmins = groupAdmins.includes(BotNumber) || false;

          const enviar = async texto => {
            await client.sendMessage(from, { text: texto }, { quoted: info });
          };

          const typeMapping = {
            imageMessage: "Image",
            videoMessage: "Video",
            audioMessage: "Audio",
            viewOnceMessageV2: "View Once",
            stickerMessage: "Sticker",
            contactMessage: "Contact",
            locationMessage: "Location",
            productMessage: "Product"
          };

          const isMedia = [
            "imageMessage",
            "videoMessage",
            "audioMessage"
          ].includes(type);
          typeMessage = body.substr(0, 50).replace(/\n/g, "") || "Unknown";

          if (typeMapping[type]) {
            typeMessage = typeMapping[type];
          }

          const isQuotedMsg =
            type === "extendedTextMessage" && content.includes("textMessage");
          const isQuotedImage =
            type === "extendedTextMessage" && content.includes("imageMessage");
          const isQuotedVideo =
            type === "extendedTextMessage" && content.includes("videoMessage");
          const isQuotedDocument =
            type === "extendedTextMessage" &&
            content.includes("documentMessage");
          const isQuotedAudio =
            type === "extendedTextMessage" && content.includes("audioMessage");
          const isQuotedSticker =
            type === "extendedTextMessage" &&
            content.includes("stickerMessage");
          const isQuotedContact =
            type === "extendedTextMessage" &&
            content.includes("contactMessage");
          const isQuotedLocation =
            type === "extendedTextMessage" &&
            content.includes("locationMessage");
          const isQuotedProduct =
            type === "extendedTextMessage" &&
            content.includes("productMessage");

          printMessage(info, type, nome, sender, isBot, isGroup);

          switch (comando) {
            case "cat":
              if (isOwner && info.key.remoteJid !== "120363047659668203@g.us") {
                enviar(texts.cat_perm_denied);
                break;
              }
              if (!text || typeof text !== "string" || text.trim().length < 1) {
                enviar(texts.cat_invalid_input);
                break;
              }
              geminiAIModel(text)
                .then(result => {
                  logger(result, "info");
                  if (result.status === "success") {
                    enviar(result.response);
                  } else {
                    enviar(`❌ Error: ${result.message}`);
                  }
                })
                .catch(error => {
                  logger("Unexpected error:", "error");
                  enviar(texts.cat_unexpected_error);
                });
              break;

            case "grupo": {
              if (!isGroup) {
                enviar(
                  "⚠️ Prezado usuário, este comando é exclusivo para grupos."
                );
                break;
              }
              if (!isGroupAdmins) {
                enviar(
                  "⚠️ Prezado administrador, infelizmente você não possui permissão para executar esta operação."
                );
                break;
              }
              if (args.length === 0) {
                await enviar(
                  "Iniciando fluxo interativo. Digite 'sair' a qualquer momento para encerrar a configuração."
                );
                let continuar = true;
                while (continuar) {
                  const menu =
                    "📌 Opções disponíveis:\n\n" +
                    "1️⃣  Alterar status (Ativar/Desativar) ⚙️\n" +
                    "2️⃣  Modificar imagem de entrada 🖼️\n" +
                    "3️⃣  Atualizar texto de entrada ✍️\n" +
                    "4️⃣  Alterar imagem de saída 🏁\n" +
                    "5️⃣  Editar texto de saída 📝\n\n" +
                    "🔹 Digite o número da opção ou 'sair' para encerrar:";
                  await enviar(menu);
                  let opcao = (await waitForResponse(client, from, sender))
                    .trim()
                    .toLowerCase();
                  if (opcao === "sair") {
                    continuar = false;
                    await enviar("ℹ️ Fluxo interativo encerrado.");
                    break;
                  }
                  switch (opcao) {
                    case "1":
                      await enviar(
                        '⏳ Prezado usuário, informe se deseja *ativar* ou *desativar* (Responda "on" ou "off"):'
                      );
                      let status = (await waitForResponse(client, from, sender))
                        .toLowerCase()
                        .trim();
                      if (status !== "on" && status !== "off") {
                        await enviar(
                          "⚠️ Resposta inválida. A operação foi cancelada."
                        );
                        break;
                      }
                      await updateGroupConfigAsync(from, "status", status);
                      await enviar("✅ Status atualizado com êxito.");
                      break;
                    case "2":
                      await enviar(
                        "⏳ Por gentileza, informe a URL da nova imagem de entrada (a URL deve terminar com .jpg):"
                      );
                      let imgEntrada = (
                        await waitForResponse(client, from, sender)
                      ).trim();
                      if (!imgEntrada.toLowerCase().endsWith(".jpg")) {
                        await enviar(
                          "⚠️ URL inválida. A operação foi cancelada."
                        );
                        break;
                      }
                      await updateGroupConfigAsync(
                        from,
                        "welcomeImage",
                        imgEntrada
                      );
                      await enviar(
                        "✅ Imagem de entrada atualizada com êxito."
                      );
                      break;
                    case "3": {
                      const placeholdersEntrada =
                        "Utilize os seguintes *placeholders* para personalizar sua mensagem de entrada:\n" +
                        "• *#user* - menciona o usuário\n" +
                        "• *#gruponome* - nome do grupo\n" +
                        "• *#data* - data e hora completas\n" +
                        "• *#descrição* - descrição do grupo\n" +
                        "• *#usuários* - quantidade de participantes\n" +
                        "• *#hora* - hora atual\n" +
                        "• *#dataSimples* - data atual\n" +
                        "• *#qtdAdmins* - quantidade de administradores\n" +
                        "• *#botNumber* - número do bot\n" +
                        "• *#ownerNumber* - número do proprietário\n" +
                        "\nExemplo: _Olá *#user*, seja bem-vindo(a) ao *#gruponome*!_ 😊";
                      await enviar(
                        "📌 Para atualizar o texto de entrada, " +
                          placeholdersEntrada
                      );
                      await enviar(
                        "⏳ Por gentileza, digite o novo texto para a mensagem de entrada:"
                      );
                      let txtEntrada = await waitForResponse(
                        client,
                        from,
                        sender
                      );
                      await updateGroupConfigAsync(from, "welcome", txtEntrada);
                      await enviar("✅ Texto de entrada atualizado com êxito.");
                      break;
                    }
                    case "4":
                      await enviar(
                        "⏳ Por gentileza, informe a URL da nova imagem de saída (a URL deve terminar com .jpg):"
                      );
                      let imgSaida = (
                        await waitForResponse(client, from, sender)
                      ).trim();
                      if (!imgSaida.toLowerCase().endsWith(".jpg")) {
                        await enviar(
                          "⚠️ URL inválida. A operação foi cancelada."
                        );
                        break;
                      }
                      await updateGroupConfigAsync(
                        from,
                        "farewellImage",
                        imgSaida
                      );
                      await enviar("✅ Imagem de saída atualizada com êxito.");
                      break;
                    case "5": {
                      const placeholdersSaida =
                        "Utilize os seguintes *placeholders* para personalizar sua mensagem de saída:\n" +
                        "• *#user* - menciona o usuário\n" +
                        "• *#gruponome* - nome do grupo\n" +
                        "• *#data* - data e hora completas\n" +
                        "• *#descrição* - descrição do grupo\n" +
                        "• *#usuários* - quantidade de participantes\n" +
                        "• *#hora* - hora atual\n" +
                        "• *#dataSimples* - data atual\n" +
                        "• *#qtdAdmins* - quantidade de administradores\n" +
                        "• *#botNumber* - número do bot\n" +
                        "• *#ownerNumber* - número do proprietário\n" +
                        "\nExemplo: _Tchau *#user*, sentimos sua falta no *#gruponome*. Até logo!_ 😢";
                      await enviar(
                        "📌 Para atualizar o texto de saída, " +
                          placeholdersSaida
                      );
                      await enviar(
                        "⏳ Por gentileza, digite o novo texto para a mensagem de saída:"
                      );
                      let txtSaida = await waitForResponse(
                        client,
                        from,
                        sender
                      );
                      await updateGroupConfigAsync(from, "farewell", txtSaida);
                      await enviar("✅ Texto de saída atualizado com êxito.");
                      break;
                    }
                    default:
                      await enviar(
                        "⚠️ Opção inválida. Por favor, tente novamente."
                      );
                      break;
                  }
                }
                break;
              } else if (args.length >= 1) {
                const subcommand = args[0].toLowerCase();
                if (subcommand === "data") {
                  enviar(
                    "📊 Dados do grupo:\n```json\n" +
                      JSON.stringify(
                        await createOrGetGroupConfigAsync(from),
                        null,
                        2
                      ) +
                      "\n```"
                  );
                  break;
                } else if (
                  subcommand === "welcome" ||
                  subcommand === "farewell"
                ) {
                  const tipo = subcommand;
                  const acao = args[1] && args[1].toLowerCase();
                  if (acao === "on") {
                    await updateGroupConfigAsync(from, "status", "on");
                    enviar(
                      tipo === "welcome" ? texts.welcome_on : texts.farewell_on
                    );
                  } else if (acao === "off") {
                    await updateGroupConfigAsync(from, "status", "off");
                    enviar(
                      tipo === "welcome"
                        ? texts.welcome_off
                        : texts.farewell_off
                    );
                  } else if (acao === "settext") {
                    const novoTexto = args.slice(2).join(" ");
                    if (!novoTexto) {
                      enviar(texts.inform_text + tipo + ".");
                      break;
                    }
                    await updateGroupConfigAsync(from, tipo, novoTexto);
                    enviar(
                      tipo === "welcome"
                        ? texts.welcome_settext_success
                        : texts.farewell_settext_success
                    );
                  } else if (acao === "setimage") {
                    const url = args[2];
                    if (!url) {
                      enviar(texts.inform_url + tipo + ".");
                      break;
                    }
                    if (!url.toLowerCase().endsWith(".jpg")) {
                      enviar(texts.invalid_url);
                      break;
                    }
                    await updateGroupConfigAsync(from, `${tipo}Image`, url);
                    enviar(
                      tipo === "welcome"
                        ? texts.welcome_setimage_success
                        : texts.farewell_setimage_success
                    );
                  } else {
                    enviar(texts.invalid_subcommand);
                  }
                  break;
                } else {
                  enviar(texts.invalid_subcommand);
                }
              }
              break;
            }
            case "exec": {
              if (!isOwner) {
                enviar("⚠️ Acesso restrito.");
                break;
              }
              const shellCommand = args.join(" ");
              if (!shellCommand) {
                enviar("⚠️ Nenhum comando informado.");
                break;
              }
              exec(shellCommand, (error, stdout, stderr) => {
                if (error) {
                  enviar(`❌ Erro: ${error.message}`);
                  return;
                }
                if (stderr) {
                  enviar(`⚠️ stderr: ${stderr}`);
                  return;
                }
                enviar(`✅ Resultado:\n${stdout}`);
              });
              break;
            }
            
          }

        }
      }

      WhatsappUpsert().catch(async e => {
        if (String(e).includes("this.isZero")) {
          file = require.resolve("./commands/index.js");
          delete require.cache[file];
          require(file);
        } else {
          return logger(e, "error");
        }
      });
    };
  };
}

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  logger.info(`O arquivo "${__filename}" foi atualizado.`);
  delete require.cache[file];
  require(file);
});

connectToWhatsApp().catch(async e => {
  logger(`Erro no arquivo "./index.js": ${e}`, "error");
});
