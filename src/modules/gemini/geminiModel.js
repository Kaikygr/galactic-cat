/**
 * Carrega o histórico de chat para um usuário a partir de um arquivo JSON.
 *
 * Esta função lê o arquivo do histórico, faz o parse dos dados,
 * e filtra quaisquer mensagens com mais de 72 horas. Se nenhum histórico for encontrado,
 * retorna um objeto padrão com um histórico vazio e uma instrução de sistema nula.
 *
 * @param {string} userId - O identificador único do usuário.
 * @returns {{ history: Array<Object>, systemInstruction: (string|null) }} O histórico do usuário e a instrução do sistema.
 */

/**
 * Salva o histórico de chat e a instrução do sistema para um usuário em um arquivo JSON.
 *
 * Esta função atualiza o arquivo de histórico com o histórico atual e a instrução do sistema para o usuário.
 *
 * @param {string} userId - O identificador único do usuário.
 * @param {Array<Object>} history - Um array de objetos de mensagem representando o histórico da conversa.
 * @param {(string|null)} systemInstruction - A instrução do sistema a ser usada nas interações subsequentes.
 */

/**
 * Gera conteúdo de IA processando o prompt de um usuário através do modelo do Google Generative AI.
 *
 * Esta função carrega o histórico de chat do usuário, adiciona o novo prompt junto com o timestamp atual,
 * envia o prompt para o modelo generativo e então anexa a resposta recebida ao histórico.
 * Por fim, salva o histórico atualizado.
 *
 * @param {string} sender - O identificador único do usuário que envia o prompt.
 * @param {string} userName - O nome do usuário.
 * @param {string} prompt - O texto do prompt que será processado pela IA.
 * @returns {Promise<string>} Uma promessa que resolve para o texto da resposta gerada pela IA.
 */

/**
 * Deleta o histórico de chat para um usuário a partir do arquivo JSON.
 *
 * Esta função verifica se o histórico do usuário existe e o remove do arquivo.
 *
 * @param {string} userId - O identificador único do usuário cujo histórico será deletado.
 * @returns {Promise<string>} Uma promessa que resolve para uma mensagem de sucesso indicando que o histórico foi deletado.
 */

/**
 * Atualiza a instrução do sistema para um usuário.
 *
 * Esta função carrega o histórico atual, atualiza a instrução do sistema,
 * e então salva o histórico atualizado de volta no arquivo JSON.
 *
 * @param {string} sender - O identificador único do usuário.
 * @param {string} instructionText - A nova instrução do sistema para a conversa.
 * @returns {Promise<string>} Uma promessa que resolve para uma mensagem de sucesso indicando que a instrução do sistema foi atualizada.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");

require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);

const historyFilePath = path.join(__dirname, "chatHistory.json");

function loadChatHistory(userId) {
  if (fs.existsSync(historyFilePath)) {
    const data = fs.readFileSync(historyFilePath, "utf8");
    const historyData = JSON.parse(data);
    logger.info("[ GEMINI MODEL ] carregando historico do usuario...");
    const userRecord = historyData[userId] || { history: [], systemInstruction: null };
    const prazo = 72 * 3600 * 1000;
    userRecord.history = userRecord.history.filter(record => (Date.now() - record.timestamp) < prazo);
    return userRecord;
  }
  return { history: [], systemInstruction: null };
}

function saveChatHistory(userId, history, systemInstruction) {
  let data = {};
  if (fs.existsSync(historyFilePath)) {
    data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
  }
  data[userId] = { history, systemInstruction };
  logger.info("[ GEMINI MODEL ] salvando historico do usuario...");
  fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));
}

async function generateAIContent(sender, userName, prompt) {
  let { history, systemInstruction } = loadChatHistory(sender);
  history = history || [];
  systemInstruction = systemInstruction || "Responda sempre em português de forma objetiva e direta, sem explicações desnecessárias.";

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction,
  });

  let now = Date.now();
  let formattedNow = new Date(now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  history.push({ role: "user", name: userName, parts: [{ text: prompt }], timestamp: now, formattedTimestamp: formattedNow });
  
  const historyForAPI = history.map(({ timestamp, name, formattedTimestamp, ...msg }) => msg);

  const chat = model.startChat({ history: historyForAPI });
  const result = await chat.sendMessage(prompt);
  logger.info("[ GEMINI MODEL ] gerando resposta do modelo...");

  now = Date.now();
  formattedNow = new Date(now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  history.push({ role: "model", parts: [{ text: result.response.text() }], timestamp: now, formattedTimestamp: formattedNow });
  saveChatHistory(sender, history, systemInstruction);

  return result.response.text();
}

async function deleteUserHistory(userId) {
  if (fs.existsSync(historyFilePath)) {
    const data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
    if (data[userId]) {
      delete data[userId];
      logger.info("[ GEMINI MODEL ] deletando histórico do usuário...");
      fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));
    }
  }
  return "Histórico do usuário deletado com sucesso!";
}

async function updateUserSystemInstruction(sender, instructionText) {
  const { history } = loadChatHistory(sender);
  saveChatHistory(sender, history, instructionText);
  return "Instrução do sistema atualizada com sucesso!";
}

module.exports = { generateAIContent, deleteUserHistory, updateUserSystemInstruction };
