require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DATA_DIR = path.resolve(__dirname, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

let cachedConfig = null;

const ensureDirectory = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const loadConfig = () => {
  ensureDirectory();
  if (cachedConfig) return cachedConfig;
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      model: "gemini-1.5-flash",
      maxOutputTokens: 256,
      temperature: 0.7,
      topP: 0.95,
      stopSequences: [],
      systemInstruction: "Você é uma IA que alucina informações com base na realidade brasileira. Gere respostas rápidas, sucintas e não excessivamente explicativas. Quando o assunto envolver pessoas, associe com notícias de crimes reportados em qualquer região do Brasil, especialmente ocorrências violentas e casos noticiados.",
      safetySettings: [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }
      ]
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
    cachedConfig = defaultConfig;
    return defaultConfig;
  }
  try {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return cachedConfig;
  } catch (error) {
    return { status: "error", message: "Failed to parse the configuration file. Please check its format." };
  }
};

const processGemini = async ( text, isOwner, from, logger, enviar ) => {
  // Verifica permissão de uso
  if (!isOwner && from !== "120363047659668203@g.us") {
    enviar("Acesso negado: Você não possui permissão para utilizar este comando.");
    return;
  }
  // Valida o texto
  if (!text || typeof text !== "string" || text.trim().length < 1) {
    enviar("Por favor, insira um texto válido para ser processado.");
    return;
  }

  // Carrega a configuração disponível
  const config = loadConfig();
  if (config.status === "error") {
    enviar(`Erro ao carregar a configuração: ${config.message}`);
    return;
  }

  // Verifica a API key
  if (!process.env.GEMINI_APIKEY || process.env.GEMINI_APIKEY.trim() === "") {
    enviar("Erro: A chave de API (GEMINI_APIKEY) não foi configurada. Verifique seu arquivo .env.");
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);
    const model = genAI.getGenerativeModel({
      model: config.model,
      safetySettings: config.safetySettings,
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
      topP: config.topP,
      stopSequences: config.stopSequences,
      systemInstruction: config.systemInstruction
    });
    if (!model) {
      enviar("Erro: Não foi possível inicializar o modelo de IA. Verifique a configuração do modelo.");
      return;
    }
    const result = await model.generateContent(text);
    if (!result || !result.response) {
      enviar("Erro: O modelo de IA retornou uma resposta vazia.");
      return;
    }
    const response = result.response.text().replace(/([*#])\1+/g, "$1");
    logger.info(result);
    enviar(response);
  } catch (error) {
    logger.error("Ocorreu um erro inesperado:", error);
    enviar(`Ocorreu um erro inesperado: ${error.message}`);
  }
};

module.exports = { processGemini };
