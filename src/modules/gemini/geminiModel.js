const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");

require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);

const historyFilePath = path.join(__dirname, "chatHistory.json");

/* função responsável por carregar o histórico de conversas do usuário
a partir do arquivo chatHistory.json. Caso o arquivo não exista, a função
retorna um objeto vazio. */
function loadChatHistory(userId) {
  if (fs.existsSync(historyFilePath)) {
    const data = fs.readFileSync(historyFilePath, "utf8");
    const historyData = JSON.parse(data);
    logger.info("[ GEMINI MODEL ] carregando historico do usuario...");
    return historyData[userId] || { history: [], systemInstruction: null };
  }
  return { history: [], systemInstruction: null };
}

/* função responsável por salvar o histórico de conversas do usuário no
arquivo chatHistory.json. O histórico é salvo em um objeto com a chave
sendo o id do usuário e o valor sendo um objeto com as chaves history e
systemInstruction. */
function saveChatHistory(userId, history, systemInstruction) {
  let data = {};
  if (fs.existsSync(historyFilePath)) {
    data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
  }
  data[userId] = { history, systemInstruction };
  logger.info("[ GEMINI MODEL ] salvando historico do usuario...");
  fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));
}

/* função responsável por deletar o histórico de conversas do usuário
a partir do arquivo chatHistory.json. */
function deleteUserHistory(userId) {
  if (fs.existsSync(historyFilePath)) {
    const data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
    delete data[userId];
    logger.warn("[ GEMINI MODEL ] deletando historico do usuario...");
    fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));
  }
}

/* função responsável por gerar o conteúdo de resposta do modelo de IA
a partir de um prompt fornecido pelo usuário. O prompt é enviado para o
modelo de IA, que gera uma resposta com base no histórico de conversas
do usuário e na instrução do sistema. */
async function generateAIContent(sender, prompt) {
  const helpText = `
*👋 Bem-vindo ao módulo Gemini!*

Este módulo permite que você interaja com um modelo de IA generativo de forma personalizada. Veja os comandos disponíveis:  

🔹 *\`.cat <texto>\`*
Gera uma resposta de IA com base no seu histórico e na personalidade definida.  

🔹 *\`--ps <texto>\`*
Define uma instrução de sistema personalizada para o modelo de IA. Use este comando para ajustar a personalidade ou o comportamento da IA conforme desejar.  

> *Exemplo:*
> \`.cat --ps Você é um comediante brasileiro famoso por suas piadas rápidas e inteligentes.\`  

🔹 *\`--lp\`*
Limpa todo o histórico de interações e instruções personalizadas do usuário. ⚠️ *Essa ação é irreversível!*  

> *Exemplo:*
> \`.cat Apague meu histórico --lp\`  

📌 *Nota:* Após usar \`--ps\`, execute o comando novamente para aplicar as alterações.  

🚀 *Aproveite a experiência com o módulo Gemini!*`;

  if (typeof prompt !== "string" || prompt.trim() === "") {
    return helpText;
  }

  if (prompt.includes("--help")) {
    return helpText;
  }

  let { history, systemInstruction } = loadChatHistory(sender);
  history = history || [];
  systemInstruction = systemInstruction || "Responda sempre em português de forma objetiva e direta, sem explicações desnecessárias.";

  const psIndex = prompt.indexOf("--ps");
  if (psIndex !== -1) {
    const userInstruction = prompt.substring(psIndex + 4).trim();
    if (userInstruction) {
      systemInstruction = userInstruction;
      prompt = prompt.substring(0, psIndex).trim();
    }
    saveChatHistory(sender, history, systemInstruction);
    return "✅ Instrução do sistema atualizada com sucesso! Chame o comando novamente para aplicar as atualizações. 🚀";
  }

  const lpIndex = prompt.indexOf("--lp");
  if (lpIndex !== -1) {
    deleteUserHistory(sender);
    return "✅ Histórico do usuário apagado com sucesso! 🚮 Chame o comando novamente para aplicar as atualizações. 😉";
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction,
  });

  history.push({ role: "user", parts: [{ text: prompt }] });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(prompt);
  logger.info("[ GEMINI MODEL ] gerando resposta do modelo...");

  history.push({ role: "model", parts: [{ text: result.response.text() }] });
  saveChatHistory(sender, history, systemInstruction);

  return result.response.text();
}

module.exports = { generateAIContent };
