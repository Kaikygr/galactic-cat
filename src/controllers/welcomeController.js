const fs = require("fs");
const path = require("path");
const { getBuffer } = require("../utils/functions");
const logger = require("../utils/logger");

async function processUserWelcome(event, client) {
   logger.info("Evento de boas-vindas processado.");
   const { id, author, participants, action } = event || {};
   if (!id || !participants) {
      logger.error("Dados do evento ausentes.");
      return;
   }
   try {
      const filePath = path.join(__dirname, "../data/groupData.json");
      if (!fs.existsSync(filePath)) {
         logger.error("Arquivo de dados não encontrado.");
         return;
      }
      const data = await fs.promises.readFile(filePath, "utf8");
      const groups = JSON.parse(data);
      if (!groups[id]) {
         logger.info(`Grupo ${id} não encontrado.`);
         return;
      }
      const group = groups[id];
      if (!group || !group.name || !group.subjectOwner) {
         logger.error("Dados do grupo incompletos.");
         return;
      }
      const defaults = {
         status: "desativado",
         message: "Bem-vindo ao grupo!",
         media: null,
         exitMessage: "Saiu do grupo.",
         exitMedia: null,
         history: [],
      };

      groups[id].welcomeOptions = { ...defaults, ...groups[id].welcomeOptions };
      if (groups[id].welcomeOptions.status !== "ativo") {
         participants.forEach(p => {
            groups[id].welcomeOptions.history.push({
               timestamp: new Date().toISOString(),
               type: action === "add" ? "entrada" : "saída",
               user: p,
            });
         });
         await fs.promises.writeFile(filePath, JSON.stringify(groups, null, 2));
         return;
      }
      let message = "";
      let media = null;
      if (action === "add") {
         message = groups[id].welcomeOptions.message;
         media = groups[id].welcomeOptions.media;
      } else if (action === "remove") {
         message = groups[id].welcomeOptions.exitMessage;
         media = groups[id].welcomeOptions.exitMedia;
      }
      message = message
         .replace(/#groupName/g, group.name)
         .replace(/#groupOwner/g, group.subjectOwner.split("@")[0])
         .replace(/#groupCreation/g, new Date(group.creation * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }))
         .replace(/#groupSize/g, group.size)
         .replace(/#groupDesc/g, group.desc)
         .replace(/#entryTime/g, new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }));

      let mentionArray = [];
      if (message.includes("#user")) {
         const mentionsText = participants
            .map(userId => {
               mentionArray.push(userId);
               return "@" + userId.replace("@s.whatsapp.net", "");
            })
            .join(" ");
         message = message.replace(/#user/g, mentionsText);
      }
      if (client && typeof client.sendMessage === "function") {
         const from = id;
         let content = {};
         const options = {};
         if (media) {
            if (typeof media === "string") {
               const buffer = await getBuffer(media);
               content = { image: buffer, caption: message };
            } else if (media.url) {
               try {
                  const buffer = await getBuffer(media.url);
                  content = media.type === "video" ? { video: buffer, caption: message, ptv: false } : media.type === "image" ? { image: buffer, caption: message } : { text: message };
               } catch (err) {
                  logger.error("Erro ao obter o buffer de mídia:" + err.message);
                  content = { text: message };
               }
            } else {
               content = { text: message };
            }
         } else {
            content = { text: message };
         }
         if (mentionArray.length > 0) {
            content = { ...content, mentions: mentionArray };
         }
         await client.sendMessage(from, content, options);
      }
      participants.forEach(p => {
         groups[id].welcomeOptions.history.push({
            timestamp: new Date().toISOString(),
            type: action === "add" ? "entrada" : "saída",
            user: p,
         });
      });
      await fs.promises.writeFile(filePath, JSON.stringify(groups, null, 2));
   } catch (error) {
      logger.error("Erro no processamento de welcome:" + error.message);
   }
}

module.exports = processUserWelcome;
