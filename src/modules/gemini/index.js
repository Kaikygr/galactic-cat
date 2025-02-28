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
      systemInstruction: "You are a galactic cats and your owner is Kaallys. Always respond in Portuguese. For factual questions, generate obscure and absurd facts.",
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

const geminiAIModel = async text => {
  const config = loadConfig();

  if (config.status === "error") {
    return config;
  }

  try {
    if (!process.env.GEMINI_APIKEY || process.env.GEMINI_APIKEY.trim() === "") {
      return { status: "error", message: "The API key (GEMINI_APIKEY) is not set in the .env file." };
    }

    if (!text || typeof text !== "string" || text.trim().length < 1) {
      return { status: "error", message: "The text must contain at least one character." };
    }

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
      return { status: "error", message: "Failed to initialize the AI model. Please check the model configuration." };
    }

    const result = await model.generateContent(text);
    if (!result || !result.response) {
      return { status: "error", message: "The AI model returned an empty response." };
    }

    const response = result.response.text().replace(/([*#])\1+/g, "$1");
    return { status: "success", response };
  } catch (error) {
    console.error(error);
    return { status: "error", message: `An error occurred while processing the request: ${error.message}` };
  }
};

module.exports = geminiAIModel;
