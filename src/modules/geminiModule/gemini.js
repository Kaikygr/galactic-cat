const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");
const config = require(path.join(__dirname, "../../config/options.json"));

require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);

const historyFilePath = path.join(__dirname, "data", "chatHistory.json");

async function processAIContent(client, from, info, expirationMessage, sender, userName, text) {
  try {
    const historyDir = path.dirname(historyFilePath);
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    if (!fs.existsSync(historyFilePath)) {
      fs.writeFileSync(historyFilePath, JSON.stringify({}, null, 2));
    }
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro ao garantir existência do histórico:", error);
  }

  try {
    if (text.trim() === "" || text.trim() === "--hp") {
      await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
      await client.sendMessage(
        from,
        {
          text: `*⚠️ Como usar o comando corretamente:*\n\n_Para interagir com a IA, você precisa fornecer um texto após o comando._\n\n_*Exemplo:*_\n✅ \`.cat bom dia\`\n\n_Isso iniciará ou continuará uma conversa com a IA, que mantém um histórico de até *72 horas* para lembrar o contexto._\n\n🔹 Personalização:\n\`.cat --ps [instrução]\` → Define um comportamento específico para a IA.\n\n_*Exemplo:*_\n✅ \`.cat --ps Responda como um pirata.\`\n\n🧹 *Dica de eficiência:*\nPara garantir uma personalização mais precisa, use antes o comando:\n✅ \`.cat --lp\` → Limpa o histórico da conversa\nE em seguida:\n✅ \`.cat --ps [instrução personalizada]\`\n\nSe precisar de ajuda, acione o owner! 🚀`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );

      return;
    }
  } catch (err) {
    logger.error("[ GEMINI MODEL ] Erro na verificação do comando inválido:", err);
    return;
  }

  try {
    if (text.trim() === "--lp") {
      let data = {};

      if (fs.existsSync(historyFilePath)) {
        try {
          const fileContent = fs.readFileSync(historyFilePath, "utf8");
          data = fileContent ? JSON.parse(fileContent) : {};
        } catch (jsonErr) {
          throw new Error("Falha ao ler o histórico: " + jsonErr);
        }
      }

      if (data && data[sender]) {
        delete data[sender];
        logger.info("[ GEMINI MODEL ] Excluindo histórico do usuário...");

        try {
          fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));

          await client.sendMessage(from, { react: { text: "🗑️", key: info.key } });
          await client.sendMessage(from, { text: "_*🗑️ O histórico foi removido com sucesso! 🚀😊*_" }, { quoted: info, ephemeralExpiration: expirationMessage });
        } catch (writeErr) {
          throw new Error("Falha ao salvar as alterações: " + writeErr);
        }
      } else {
        await client.sendMessage(from, { react: { text: "❓", key: info.key } });
        await client.sendMessage(from, { text: "_*❓ Não há registro de histórico para o referido a ser excluído. ℹ️*_" }, { quoted: info, ephemeralExpiration: expirationMessage });
      }
      return;
    }
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro ao processar exclusão de histórico:", error);

    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    await client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao tentar excluir o histórico do usuário. Por favor, tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
    await client.sendMessage(config.owner.number, { text: `*Erro ao excluir histórico do usuário:*\n\`\`\`${JSON.stringify(error, null, 2)}\`\`\`` }, { quoted: info, ephemeralExpiration: expirationMessage });
    return;
  }

  try {
    if (text.startsWith("--ps ")) {
      const instructionText = text.slice(5);
      let data = {};

      if (fs.existsSync(historyFilePath)) {
        data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
      }

      let userHistory = [];
      if (data[sender]) {
        userHistory = data[sender].history || [];
      }

      data[sender] = { history: userHistory, systemInstruction: instructionText };

      logger.info("[ GEMINI MODEL ] atualizando instrução do sistema...");

      fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));
      await client.sendMessage(from, { react: { text: "⚙️", key: info.key } });
      await client.sendMessage(from, { text: "_*🔄 Instrução do sistema para a personalidade da IA foi  atualizada com sucesso!*_" }, { quoted: info, ephemeralExpiration: expirationMessage });
      return;
    }
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro ao atualizar instrução do sistema:", error);
    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao tentar atualizar a instrução do sistema. Por favor, tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
    client.sendMessage(config.owner.number, { text: `*Erro ao atualizar a instrução do sistema:*\n\`\`\`${JSON.stringify(error, null, 2)}\`\`\`` }, { quoted: info, ephemeralExpiration: expirationMessage });
    return;
  }

  let history, systemInstruction;

  if (fs.existsSync(historyFilePath)) {
    const data = fs.readFileSync(historyFilePath, "utf8");
    const historyData = JSON.parse(data);

    logger.info("[ GEMINI MODEL ] carregando historico do usuario...");

    const userRecord = historyData[sender] || { history: [], systemInstruction: null };
    const prazo = 72 * 3600 * 1000;

    userRecord.history = userRecord.history.filter(record => Date.now() - record.timestamp < prazo);
    history = userRecord.history;
    systemInstruction = userRecord.systemInstruction;
  } else {
    history = [];
    systemInstruction = null;
  }

  systemInstruction = systemInstruction || "Responda sempre em português de forma objetiva e direta, sem explicações desnecessárias.";

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction });

  let now = Date.now();
  let formattedNow = new Date(now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  history.push({ role: "user", name: userName, parts: [{ text: text }], timestamp: now, formattedTimestamp: formattedNow });

  const historyForAPI = history.map(({ timestamp, name, formattedTimestamp, ...msg }) => msg);
  const chat = model.startChat({ history: historyForAPI });
  let result;

  try {
    result = await chat.sendMessage([text]);
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro ao gerar resposta do modelo:", error);
    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    await client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao tentar gerar a resposta do modelo. Por favor, tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
    await client.sendMessage(config.owner.number, { text: `*Erro na geração do modelo: ${error.message}*` }, { quoted: info, ephemeralExpiration: expirationMessage });
    return;
  }

  logger.info("[ GEMINI MODEL ] gerando resposta do modelo...");

  now = Date.now();
  formattedNow = new Date(now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  history.push({ role: "model", parts: [{ text: result.response.text() }], timestamp: now, formattedTimestamp: formattedNow });

  try {
    let dataToSave = {};
    if (fs.existsSync(historyFilePath)) {
      dataToSave = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
    }

    dataToSave[sender] = { history, systemInstruction };
    logger.info("[ GEMINI MODEL ] salvando historico do usuario...");
    fs.writeFileSync(historyFilePath, JSON.stringify(dataToSave, null, 2));
  } catch (err) {
    logger.error("[ GEMINI MODEL ] Erro ao salvar historico do usuario:", err);

    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    await client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao tentar salvar o histórico do usuário. Por favor, tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
    await client.sendMessage(config.owner.number, { text: `*Error: ${err.message}*` }, { quoted: info, ephemeralExpiration: expirationMessage });
    return;
  }

  await client.sendMessage(from, { react: { text: "🐈‍⬛", key: info.key } });
  await client.sendMessage(from, { text: result.response.text() }, { quoted: info, ephemeralExpiration: expirationMessage });
  return;
}

module.exports = { processAIContent };
