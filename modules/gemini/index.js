/* eslint-disable no-undef */
// Módulo Gemini - Integra a API Google Generative AI para criação de conteúdo com base em entrada de texto.
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DATA_DIR = path.resolve(__dirname, "data"); // Diretório onde o arquivo de configuração é armazenado.
const CONFIG_PATH = path.join(DATA_DIR, "config.json"); // Caminho completo para o arquivo de configuração.

let cachedConfig = null;

// Função para garantir que o diretório de dados exista.
const ensureDirectory = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Diretório criado para armazenar a configuração.
  }
};

// Carrega a configuração do arquivo ou cria um padrão se inexistente.
const loadConfig = () => {
  ensureDirectory();

  if (cachedConfig) return cachedConfig;

  // Se o arquivo de configuração não existir, cria com valores padrão.
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      apiKey: "", // Chave de API necessária para acessar a API do Google Generative AI.
      model: "gemini-pro", // Modelo de AI utilizado.
      safetySettings: [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }
      ]
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
    // Configuração padrão criada e salva.
    cachedConfig = defaultConfig;
    return defaultConfig;
  }

  try {
    // Lê e analisa o arquivo de configuração.
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return cachedConfig;
  } catch (error) {
    // Retorna um objeto de erro se houver falha ao interpretar a configuração.
    return { status: "error", message: "Failed to parse the configuration file. Please check its format." };
  }
};

/**
 * Processa o texto enviado e retorna a resposta gerada pela AI.
 *
 * @param {string} text - Texto de entrada para gerar conteúdo. Deve conter ao menos um caractere.
 * @returns {Promise<Object>} Objeto com o status e a resposta ou mensagem de erro.
 */
const geminiAIModel = async text => {
  const config = loadConfig();

  if (config.status === "error") {
    // Retorna o erro de configuração, se houver.
    return config;
  }

  try {
    // Verifica se a chave de API foi configurada.
    if (!config.apiKey || config.apiKey.trim() === "") {
      return { status: "error", message: "The API key (apiKey) is not set in the configuration file." };
    }

    // Valida se o texto de entrada é válido.
    if (!text || typeof text !== "string" || text.trim().length < 1) {
      return { status: "error", message: "The text must contain at least one character." };
    }

    // Inicializa o cliente da API utilizando a chave fornecida.
    const genAI = new GoogleGenerativeAI(config.apiKey);
    // Obtém o modelo generativo configurado com os parâmetros definidos.
    const model = genAI.getGenerativeModel({ model: config.model, safetySettings: config.safetySettings });

    if (!model) {
      // Retorna erro se o modelo não for inicializado corretamente.
      return { status: "error", message: "Failed to initialize the AI model. Please check the model configuration." };
    }

    // Chama a API para gerar o conteúdo com base no texto de entrada.
    const result = await model.generateContent(text);
    if (!result || !result.response) {
      return { status: "error", message: "The AI model returned an empty response." };
    }

    // Processa a resposta para normalizar a formatação removendo repetições de caracteres especiais.
    const response = result.response.text().replace(/([*#])\1+/g, "$1");
    return { status: "success", response };
  } catch (error) {
    // Loga e retorna qualquer erro ocorrido durante a execução.
    console.error(error);
    return { status: "error", message: `An error occurred while processing the request: ${error.message}` };
  }
};

// Exporta a função principal para uso em outros módulos.
module.exports = geminiAIModel;
