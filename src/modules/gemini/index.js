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
      systemInstruction: "Você é uma IA que alucina informações com base na realidade brasileira. Gere respostas rápidas, sucintas e não excessivamente explicativas.",
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
    return { status: "error", message: "Falha ao analisar o arquivo de configuração. Verifique o formato do arquivo." };
  }
};

const processGemini = async (text, logger, userMessageReport, ownerReport) => {
  if (!text || typeof text !== "string" || text.trim().length < 1) {
    logger.info("parseGemini: Texto de entrada inválido:", text);
    userMessageReport("Por favor, insira um texto válido para ser feita a geração de conteúdo.");
    return;
  }

  const config = loadConfig();
  if (config.status === "error") {
    userMessageReport("Erro: Não foi possível carregar as configurações. O responsável foi notificado.");
    ownerReport(config.message);
    logger.error("Erro ao carregar a configuração dos parâmetros da API.", config.message);
    return;
  }

  if (!process.env.GEMINI_APIKEY || process.env.GEMINI_APIKEY.trim() === "") {
    userMessageReport("Erro: Ocorreu um erro interno. O problema já foi reportado ao desenvolvedor.");
    ownerReport("Erro: A chave de API (GEMINI_APIKEY) não está configurada. Verifique o arquivo .env.");
    logger.error("Erro: A chave de API (GEMINI_APIKEY) não está configurada. Verifique o arquivo .env.");
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
      userMessageReport("Erro: Falha ao carregar o modelo de IA. O desenvolvedor foi notificado.");
      ownerReport("Erro: Falha ao carregar o modelo de IA. Verifique os logs para mais detalhes.");
      logger.error("Falha ao carregar o modelo de IA.");
      return;
    }

    const result = await model.generateContent(text);
    if (!result || !result.response) {
      userMessageReport("Erro: Falha ao processar a solicitação. O desenvolvedor foi notificado.");
      ownerReport("Erro: Falha ao processar a solicitação. Verifique os logs para mais detalhes.");
      logger.error("Falha ao processar a solicitação.");
      return;
    }

    const response = result.response.text().replace(/([*#])\1+/g, "$1");
    userMessageReport(response);
  } catch (error) {
    logger.error("Ocorreu um erro inesperado:", error);
    userMessageReport(`Erro: Ocorreu um erro inesperado. O desenvolvedor foi notificado.`);
    ownerReport(`Erro: Ocorreu um erro inesperado. Verifique os logs para mais detalhes. ${error.message}`);
  }
};

module.exports = { processGemini };
