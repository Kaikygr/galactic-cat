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
          await client.sendMessage(
            from,
            {
              text: `_🗑️ *O histórico de conversa foi removido com sucesso!*_\n\n✅ Para que as novas instruções ou personalizações sejam aplicadas corretamente, por favor, utilize o comando novamente.\n\nSe precisar de ajuda, estou por aqui! 🚀😊`,
            },
            { quoted: info, ephemeralExpiration: expirationMessage }
          );
        } catch (writeErr) {
          throw new Error("Falha ao salvar as alterações: " + writeErr);
        }
      } else {
        await client.sendMessage(from, { react: { text: "❓", key: info.key } });
        await client.sendMessage(
          from,
          {
            text: `_❓ *Não foi encontrado nenhum histórico associado que possa ser removido.*_\n\nℹ️ Caso deseje iniciar uma nova conversa ou definir instruções personalizadas, utilize os comandos apropriados. Estou à disposição para ajudar!`,
          },
          { quoted: info, ephemeralExpiration: expirationMessage }
        );
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
