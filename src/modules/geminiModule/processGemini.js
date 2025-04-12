const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");
const config = require(path.join(__dirname, "../../config/options.json"));
const { runQuery } = require("../../database/processDatabase");

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
          text: `*⚠️ Orientações para o uso correto do comando:*\n\n_Para interagir com a IA, é necessário fornecer um texto logo após o comando._\n\n_*Exemplo:*_\n✅ \`.cat bom dia\`\n\n_Essa ação iniciará ou continuará uma conversa com a IA, que mantém o contexto por até *72 horas*._\n\n🔹 *Personalização de comportamento:*\n\`.cat --ps [instrução]\` → Define um estilo ou comportamento específico para a IA.\n\n_*Exemplo:*_\n✅ \`.cat --ps Responda como um pirata.\`\n\n🧹 *Dica de eficiência:*\nPara garantir uma personalização mais precisa, siga esta ordem:\n1. ✅ \`.cat --lp\` → Limpa o histórico da conversa\n2. ✅ \`.cat --ps [instrução personalizada]\`\n\n📚 *Documentação completa do comando:*\nAcesse nossa Wiki para mais detalhes, exemplos e dicas de uso:\n🔗 https://github.com/Kaikygr/galactic-cat/wiki/Comandos#cat\n\nCaso tenha dúvidas ou precise de suporte, entre em contato com o owner. 🚀`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );

      return;
    }
  } catch (erro) {
    logger.error("[ GEMINI MODEL ] Erro na verificação do comando inválido:", erro);
    return;
  }

  let globalData = {};
  try {
    if (fs.existsSync(historyFilePath)) {
      const fileContent = fs.readFileSync(historyFilePath, "utf8");
      globalData = fileContent ? JSON.parse(fileContent) : {};
    }
  } catch (err) {
    logger.error("[ GEMINI MODEL ] Falha ao ler o histórico para verificação de limite:", err);
  }
  if (!globalData[sender]) {
    globalData[sender] = { systemInstruction: null, history: [], totalChamados: 0, datasChamados: [] };
  }

  const currentProfile = globalData[sender];

  let isPremium = false;
  try {
    const result = await runQuery("SELECT isPremium FROM users WHERE sender = ?", [sender]);
    if (result.length > 0) {
      isPremium = result[0].isPremium;
    } else {
      await client.sendMessage(from, { react: { text: "⏳", key: info.key } });

      await client.sendMessage(
        from,
        {
          text: `*⚠️ Limite diário atingido: 10 comandos em 24h!*\n\n` + `🕒 Aguarde *${hrs}h ${min}m ${sec}s* para usar novamente.\n\n` + `✨ *Assine o plano Premium* e aproveite:\n` + `• Comandos ilimitados\n` + `• Recursos e funções exclusivas\n` + `• Acesso antecipado a atualizações\n` + `• Suporte prioritário\n\n` + `🚀 Esta é uma forma de melhorar cada vez mais a experiência dos usuários e garantir um serviço mais estável e completo.\n\n` + `📩 *Fale com o proprietário para assinar seu plano Premium!*`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      return;
    }
  } catch (err) {
    logger.error("[ GEMINI MODEL ] Erro ao verificar status premium:", err);
  }

  if (!isPremium) {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const recentCalls = currentProfile.datasChamados.filter(date => new Date(date).getTime() > cutoff);
    if (recentCalls.length >= 10) {
      const earliest = Math.min(...recentCalls.map(date => new Date(date).getTime()));
      const resetTime = earliest + 24 * 3600 * 1000;
      const remainingMs = resetTime - Date.now();
      const sec = Math.floor(remainingMs / 1000) % 60;
      const min = Math.floor(remainingMs / (1000 * 60)) % 60;
      const hrs = Math.floor(remainingMs / (1000 * 60 * 60));
      await client.sendMessage(from, { react: { text: "⏳", key: info.key } });

      await client.sendMessage(
        from,
        {
          text: `*⚠️ Limite diário atingido: 10 comandos em 24h!*\n\n` + `🕒 Aguarde *${hrs}h ${min}m ${sec}s* para usar novamente.\n\n` + `✨ *Assine o plano Premium* e aproveite:\n` + `• Comandos ilimitados\n` + `• Recursos e funções exclusivas\n` + `• Acesso antecipado a atualizações\n` + `• Suporte prioritário\n\n` + `🚀 Esta é uma forma de melhorar cada vez mais a experiência dos usuários e garantir um serviço mais estável e completo.\n\n` + `📩 *Fale com o proprietário para assinar seu plano Premium!*`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );

      return;
    }
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

      if (data[sender]) {
        data[sender].history = [];
        data[sender].totalChamados = (data[sender].totalChamados || 0) + 1;
        data[sender].datasChamados = data[sender].datasChamados || [];
        data[sender].datasChamados.push(new Date().toISOString());
        logger.info("[ GEMINI MODEL ] Histórico do usuário limpo, mantendo as demais preferências...");
      } else {
        data[sender] = {
          systemInstruction: null,
          history: [],
          totalChamados: 1,
          datasChamados: [new Date().toISOString()],
        };
        logger.info("[ GEMINI MODEL ] Perfil do usuário criado com histórico vazio.");
      }

      try {
        fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));
        await client.sendMessage(from, { react: { text: "🗑️", key: info.key } });
        await client.sendMessage(
          from,
          {
            text: `_🗑️ *O histórico de conversa foi removido com sucesso!*_\n\n✅ As configurações do perfil foram preservadas.\n\nSe precisar de ajuda, estou por aqui! 🚀😊`,
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
      } catch (writeErr) {
        throw new Error("Falha ao salvar as alterações: " + writeErr);
      }
      return;
    }
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro ao processar exclusão de histórico:", error);

    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    await client.sendMessage(
      from,
      {
        text: `*‼️ Não foi possível excluir o histórico do usuário no momento.*\n\nℹ️ Por favor, tente novamente mais tarde. Caso o problema persista, entre em contato com o suporte.`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    await client.sendMessage(
      config.owner.number,
      {
        text: `*⚠️ Erro ao tentar excluir o histórico de um usuário:*\n\`\`\`${JSON.stringify(error, null, 2)}\`\`\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    return;
  }

  try {
    if (text.startsWith("--ps ")) {
      const instructionText = text.slice(5);
      let data = {};

      if (fs.existsSync(historyFilePath)) {
        try {
          data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
        } catch (readErr) {
          throw new Error("Falha ao ler o histórico: " + readErr);
        }
      }

      if (data[sender]) {
        data[sender].systemInstruction = instructionText;
        data[sender].totalChamados = (data[sender].totalChamados || 0) + 1;
        data[sender].datasChamados = data[sender].datasChamados || [];
        data[sender].datasChamados.push(new Date().toISOString());
      } else {
        data[sender] = {
          systemInstruction: instructionText,
          history: [],
          totalChamados: 1,
          datasChamados: [new Date().toISOString()],
        };
      }

      logger.info("[ GEMINI MODEL ] Atualizando instrução do sistema...");
      fs.writeFileSync(historyFilePath, JSON.stringify(data, null, 2));
      await client.sendMessage(from, { react: { text: "⚙️", key: info.key } });
      await client.sendMessage(
        from,
        {
          text: `_⚙️ *A instrução do sistema referente à personalidade da IA foi atualizada com sucesso!*_\n\n✅ Utilize o comando novamente para que a nova configuração seja aplicada corretamente.`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
      return;
    }
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro ao atualizar instrução do sistema:", error);
    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    await client.sendMessage(
      from,
      {
        text: `*‼️ Ocorreu um erro ao tentar atualizar a instrução do sistema.*\n\nℹ️ Por favor, tente novamente mais tarde. Se o problema persistir, entre em contato com o suporte.`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    await client.sendMessage(
      config.owner.number,
      {
        text: `*⚠️ Erro ao atualizar a instrução do sistema de um usuário:*\n\`\`\`${JSON.stringify(error, null, 2)}\`\`\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    return;
  }

  let history, systemInstruction;
  let userRecord = {};

  if (fs.existsSync(historyFilePath)) {
    const fileContent = fs.readFileSync(historyFilePath, "utf8");
    const historyData = JSON.parse(fileContent);

    logger.info("[ GEMINI MODEL ] Carregando perfil do usuário...");

    userRecord = historyData[sender] || { systemInstruction: null, history: [], totalChamados: 0, datasChamados: [] };
    history = userRecord.history;
    systemInstruction = userRecord.systemInstruction;
    userRecord.totalChamados = (userRecord.totalChamados || 0) + 1;
    userRecord.datasChamados = userRecord.datasChamados || [];
    userRecord.datasChamados.push(new Date().toISOString());
  } else {
    userRecord = { systemInstruction: null, history: [], totalChamados: 1, datasChamados: [new Date().toISOString()] };
    history = userRecord.history;
    systemInstruction = null;
  }

  systemInstruction = systemInstruction || "Responda sempre em português de forma objetiva e direta, sem explicações desnecessárias.";

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction });

  history.push({ role: "user", content: text });

  const historyForAPI = history.map(({ role, content }) => ({ role, parts: [{ text: content }] }));
  const chat = model.startChat({ history: historyForAPI });
  let result;

  try {
    result = await chat.sendMessage([text]);
  } catch (error) {
    logger.error("[ GEMINI MODEL ] Erro ao gerar resposta do modelo:", error);
    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    await client.sendMessage(
      from,
      {
        text: `*‼️ Ocorreu um erro ao tentar gerar a resposta da IA.*\n\nℹ️ Por gentileza, tente novamente em alguns instantes. Caso o problema continue, entre em contato com o suporte.`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    await client.sendMessage(
      config.owner.number,
      {
        text: `*⚠️ Erro na geração de resposta do modelo para um usuário:*\n\`\`\`${error.message}\`\`\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    return;
  }

  logger.info("[ GEMINI MODEL ] Gerando resposta do modelo...");

  history.push({ role: "model", content: result.response.text() });

  try {
    let dataToSave = {};
    if (fs.existsSync(historyFilePath)) {
      dataToSave = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
    }

    dataToSave[sender] = userRecord;
    logger.info("[ GEMINI MODEL ] Salvando perfil do usuário...");
    fs.writeFileSync(historyFilePath, JSON.stringify(dataToSave, null, 2));
  } catch (err) {
    logger.error("[ GEMINI MODEL ] Erro ao salvar perfil do usuário:", err);

    await client.sendMessage(from, { react: { text: "‼️", key: info.key } });
    await client.sendMessage(
      from,
      {
        text: `*‼️ Ocorreu um erro ao tentar salvar o histórico desta conversa.*\n\nℹ️ Por favor, tente novamente mais tarde. Se o erro persistir, entre em contato com o suporte.`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    await client.sendMessage(
      config.owner.number,
      {
        text: `*⚠️ Erro ao salvar o histórico do usuário:*\n\`\`\`${err.message}\`\`\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    return;
  }

  await client.sendMessage(from, { react: { text: "🐈‍⬛", key: info.key } });
  await client.sendMessage(from, { text: result.response.text() }, { quoted: info, ephemeralExpiration: expirationMessage });
  return;
}

module.exports = { processAIContent };
