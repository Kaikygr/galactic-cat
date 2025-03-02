require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DATA_DIR = path.resolve(__dirname, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const OPTIONS_PATH = path.join(DATA_DIR, "options.json");

let cachedConfig = null;
let cachedOptions = null;

const ensureDirectory = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const loadConfig = () => {
  ensureDirectory();
  if (cachedConfig) return cachedConfig;
  const options = loadOptions();
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      model: "gemini-1.5-flash",
      maxOutputTokens: 256,
      temperature: 0.7,
      topP: 0.95,
      stopSequences: [],
      systemInstruction: options.systemInstruction,
      safetySettings: options.safetySettings
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

const loadOptions = () => {
  if (cachedOptions) return cachedOptions;
  if (!fs.existsSync(OPTIONS_PATH)) {
    return { status: "error", message: "Arquivo de opções não encontrado." };
  }
  try {
    cachedOptions = JSON.parse(fs.readFileSync(OPTIONS_PATH, "utf8"));
    return cachedOptions;
  } catch (error) {
    return { status: "error", message: "Falha ao analisar o arquivo de opções. Verifique o formato do arquivo." };
  }
};

/**
 * Processes Gemini content by validating input, loading configurations, and generating a response using GoogleGenerativeAI.
 *
 * This async function validates the provided text input, loads the necessary options and configurations,
 * and verifies that a valid Gemini API key is available in the environment variables. It then initializes
 * a GoogleGenerativeAI model based on these configurations and generates content based on the input text.
 * Throughout the process, it reports status and error messages to both the user and the owner, and logs
 * relevant information.
 *
 * @async
 * @param {string} text - The input text to be processed.
 * @param {object} logger - An object for logging messages, with methods such as error and info.
 * @param {function(string): void} userMessageReport - Callback function for reporting messages to the user.
 * @param {function(string): void} ownerReport - Callback function for reporting messages to the owner or administrator.
 * @returns {Promise<void>} A promise that resolves when processing is complete.
 *
 * @throws {Error} Will throw an unexpected error if the content generation process fails.
 */
const processGemini = async (text, logger, userMessageReport, ownerReport) => {
  const options = loadOptions();

  if (options.status === "error") {
    userMessageReport(options.message);
    ownerReport(options.message);
    logger.error(options.message);
    return;
  }

  if (!text || typeof text !== "string" || text.trim().length < 1) {
    logger.info(options.invalidInputLog, text);
    userMessageReport(options.invalidInput);
    return;
  }

  const config = loadConfig();
  if (config.status === "error") {
    userMessageReport(options.configLoadError);
    ownerReport(config.message);
    logger.error(options.configLoadErrorLog, config.message);
    return;
  }

  if (!process.env.GEMINI_APIKEY || process.env.GEMINI_APIKEY.trim() === "") {
    userMessageReport(options.apiKeyError);
    ownerReport(options.apiKeyError);
    logger.error(options.apiKeyErrorLog);
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
      userMessageReport(options.modelLoadError);
      ownerReport(options.modelLoadError);
      logger.error(options.modelLoadErrorLog);
      return;
    }

    const result = await model.generateContent(text);
    if (!result || !result.response) {
      userMessageReport(options.requestProcessingError);
      ownerReport(options.requestProcessingError);
      logger.error(options.requestProcessingErrorLog);
      return;
    }

    const response = result.response.text().replace(/([*#])\1+/g, "$1");
    userMessageReport(response);
  } catch (error) {
    logger.error(options.unexpectedErrorLog, error);
    userMessageReport(options.unexpectedError);
    ownerReport(`${options.unexpectedErrorLog} ${error.message}`);
  }
};

module.exports = { processGemini };
