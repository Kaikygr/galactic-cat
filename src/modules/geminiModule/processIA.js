const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs").promises;
const path = require("path");
const logger = require("../../utils/logger");
require("dotenv").config();

// Verifica se a API key está definida
if (!process.env.GEMINI_APIKEY) {
  throw new Error("GEMINI_APIKEY não está definida nas variáveis de ambiente");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);

// Diretório onde o histórico do chat será armazenado
const HISTORY_DIR = path.join(__dirname, "chat_history");
// Permissões para arquivos e diretórios
const FILE_PERMISSIONS = 0o600;
const DIR_PERMISSIONS = 0o700;

/**
 * Remove caracteres especiais do ID do remetente para criar um nome de arquivo seguro.
 * @param {string} sender - Identificador do remetente (ex: número do WhatsApp).
 * @returns {string} - Remetente sanitizado.
 */
const sanitizeSender = sender => {
  return sender.split("@")[0].replace(/[^a-zA-Z0-9]/g, "_");
};

/**
 * Valida o formato do prompt recebido.
 * @param {Object} prompt - Objeto do prompt com estrutura esperada.
 * @throws {Error} - Se o formato estiver inválido.
 */
const validatePrompt = prompt => {
  if (!prompt?.parts?.[0]?.text) {
    throw new Error("Formato de prompt inválido");
  }
};

/**
 * Valida o tipo de arquivo de imagem suportado.
 * @param {Buffer|string|null} imageFile - Buffer da imagem ou caminho para o arquivo.
 * @throws {Error} - Se o tipo de imagem for inválido.
 */
const validateImageFile = imageFile => {
  if (imageFile && !Buffer.isBuffer(imageFile) && !imageFile.match(/\.(jpg|jpeg|png)$/i)) {
    throw new Error("Formato de imagem não suportado");
  }
};

/**
 * Inicializa ou carrega os dados do usuário, incluindo histórico e instruções do sistema.
 * @param {string} userFilePath - Caminho para o arquivo JSON do usuário.
 * @returns {Promise<Object>} - Dados do usuário (histórico e instruções).
 */
async function initializeUserData(userFilePath) {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true, mode: DIR_PERMISSIONS });

    try {
      const data = await fs.readFile(userFilePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      // Arquivo não existe ou está corrompido, retorna dados padrão
      return {
        history: [],
        systemInstruction: "Você e um assistente virtual em português brasileiro. Seja educado, claro e útil. Responda sempre em português, a menos que o usuário peça outra língua.",
      };
    }
  } catch (error) {
    logger.error(`Erro ao inicializar dados: ${error.message}`);
    throw new Error("Erro ao acessar sistema de arquivos");
  }
}

/**
 * Processa uma imagem junto com o prompt usando o modelo generativo.
 * @param {Buffer|string} imageFile - Caminho do arquivo ou buffer da imagem.
 * @param {Object} prompt - Prompt com instruções de texto.
 * @param {Object} model - Instância do modelo generativo.
 * @returns {Promise<Object>} - Resposta gerada pelo modelo.
 */
async function handleImageProcessing(imageFile, prompt, model) {
  try {
    const imageData = Buffer.isBuffer(imageFile) ? imageFile : await fs.readFile(imageFile);

    const mimeType = Buffer.isBuffer(imageFile) ? "image/jpeg" : imageFile.endsWith(".png") ? "image/png" : "image/jpeg";

    return await model.generateContent([
      {
        inlineData: {
          data: Buffer.from(imageData).toString("base64"),
          mimeType,
        },
      },
      prompt.parts[0].text,
    ]);
  } catch (error) {
    logger.error("Erro no processamento da imagem:", error);
    throw new Error("Falha ao processar imagem");
  }
}

/**
 * Processa a resposta da IA com base em um prompt e opcionalmente uma imagem.
 * Também gerencia o histórico do usuário.
 *
 * @param {Object} prompt - Objeto contendo o prompt no formato `{ parts: [{ text: string }] }`.
 * @param {Buffer|string|null} [imageFile=null] - Arquivo de imagem ou `null`.
 * @param {Object} [config={}] - Configurações opcionais futuras.
 * @param {string} sender - ID do remetente, usado para associar histórico.
 * @returns {Promise<Object>} - Objeto com sucesso, dados/erro e timestamp.
 */
async function processAIResponse(prompt, imageFile = null, config = {}, sender) {
  try {
    validatePrompt(prompt);
    validateImageFile(imageFile);
    const sanitizedSender = sanitizeSender(sender);

    const userFilePath = path.join(HISTORY_DIR, `${sanitizedSender}.json`);
    const userData = await initializeUserData(userFilePath);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-001",
      systemInstruction: userData.systemInstruction,
    });

    let response;

    if (imageFile) {
      // Prompt com imagem
      response = await handleImageProcessing(imageFile, prompt, model);
    } else {
      // Apenas texto
      if (userData.history.length > 0) {
        const chat = model.startChat();
        for (const msg of userData.history.filter(m => m.role === "user")) {
          await chat.sendMessage(msg.content);
        }
        response = await chat.sendMessage(prompt.parts[0].text);
      } else {
        response = await model.generateContent([prompt.parts[0].text]);
      }
    }

    const responseText = response.response.text();

    // Atualiza histórico
    userData.history.push({ role: "user", content: prompt.parts[0].text }, { role: "model", content: responseText });

    // Mantém histórico limitado a 50 interações
    if (userData.history.length > 50) {
      userData.history = userData.history.slice(-50);
    }

    await fs.writeFile(userFilePath, JSON.stringify(userData, null, 2), { mode: FILE_PERMISSIONS });

    return {
      success: true,
      data: responseText,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro:", error);
    return {
      success: false,
      error: "Erro ao processar solicitação:" + error,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Atualiza a instrução do sistema para um usuário específico.
 * @param {string} sender - ID do remetente.
 * @param {string} newInstruction - Nova instrução do sistema.
 * @returns {Promise<Object>} - Resultado da operação.
 */
async function updateUserSystemInstruction(sender, newInstruction) {
  try {
    // Validações de entrada
    if (!sender || typeof sender !== "string") {
      throw new Error("Sender inválido");
    }
    if (!newInstruction || typeof newInstruction !== "string" || newInstruction.length > 500) {
      throw new Error("Instrução inválida ou muito longa");
    }

    const sanitizedSender = sanitizeSender(sender);
    const userFilePath = path.join(HISTORY_DIR, `${sanitizedSender}.json`);

    await fs.mkdir(HISTORY_DIR, { recursive: true, mode: DIR_PERMISSIONS });

    // Reseta os dados do usuário com o novo systemInstruction e histórico vazio
    const userData = {
      history: [], // Limpa todo o histórico
      systemInstruction: newInstruction,
    };

    // Salva as alterações
    await fs.writeFile(userFilePath, JSON.stringify(userData, null, 2), { mode: FILE_PERMISSIONS });

    logger.info(`SystemInstruction atualizada e histórico limpo para usuário: ${sanitizedSender}`);
    return {
      success: true,
      message: "Instrução do sistema atualizada e histórico limpo com sucesso",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Erro ao atualizar systemInstruction: ${error.message}`);
    return {
      success: false,
      error: "Erro ao atualizar instrução do sistema" + error,
      timestamp: new Date().toISOString(),
    };
  }
}

// Adicione a exportação da nova função
module.exports = {
  processAIResponse,
  updateUserSystemInstruction,
};
