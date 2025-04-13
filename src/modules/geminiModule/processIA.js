const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");
const { json } = require("stream/consumers");

require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);

const HISTORY_DIR = path.join(__dirname, "chat_history");

async function processAIResponse(prompt, imageFile = null, config = {}, sender) {
  try {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }

    const userFilePath = path.join(HISTORY_DIR, `${sender.split("@")[0]}.json`);
    let userData = { history: [], systemInstruction: "me responda sempre em ingles" };

    if (fs.existsSync(userFilePath)) {
      userData = JSON.parse(fs.readFileSync(userFilePath, "utf8"));
    }

    const systemInstruction = userData.systemInstruction || "em pt-br";

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-001",
      systemInstruction: systemInstruction,
      generationConfig: {
        temperature: 0.9,
        topP: 1,
        topK: 1,
        maxOutputTokens: 2048,
      },
    });
    console.log(JSON.stringify(model, null, 2));
    let response;

    if (imageFile) {
      try {
        const imageData = Buffer.isBuffer(imageFile) ? imageFile : await fs.promises.readFile(imageFile);

        const mimeType = Buffer.isBuffer(imageFile) ? "image/jpeg" : imageFile.endsWith(".png") ? "image/png" : "image/jpeg";

        response = await model.generateContent([
          {
            inlineData: {
              data: Buffer.from(imageData).toString("base64"),
              mimeType,
            },
          },
          prompt.parts[0].text,
        ]);
      } catch (imageError) {
        throw new Error(`Erro ao processar imagem: ${imageError.message}`);
      }
    } else {
      if (userData.history.length > 0) {
        const chat = model.startChat();
        for (const msg of userData.history) {
          if (msg.role === "user") {
            await chat.sendMessage(msg.content);
          }
        }
        response = await chat.sendMessage(prompt.parts[0].text);
      } else {
        response = await model.generateContent([prompt.parts[0].text]);
      }
    }

    const responseText = response.response.text();
    console.log("Resposta do modelo:", responseText);

    userData.history.push({ role: "user", content: prompt.parts[0].text }, { role: "model", content: responseText });

    fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));

    return {
      success: true,
      data: responseText,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro:", error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = processAIResponse;
