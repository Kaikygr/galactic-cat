const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");
const config = require(path.join(__dirname, "../../config/options.json"));

require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);

const historyFilePath = path.join(__dirname, "data", "chatHistory.json");

async function generateAIContent(client, from, info, expirationMessage, sender, userName, text) {

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
           await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
        await client.sendMessage(from, { text: `*⚠️ Como usar o comando corretamente:*\n\n_Para interagir com a IA, você precisa fornecer um texto após o comando._\n\n_*Exemplo:*_\n✅ \`.cat bom dia\`\n\n_Isso iniciará ou continuará uma conversa com a IA, que mantém um histórico de até *72 horas* para lembrar o contexto._\n\n🔹 Personalização:\n\`.cat --ps [instrução]\` → Define um comportamento específico para a IA.\n\n_*Exemplo:*_\n✅ \`.cat --ps Responda como um pirata.\`\n\n\`.cat --lp\` → Apaga todo o histórico da conversa.\n\n🔹 Análises e Relatórios:\n\`.cat --me\` → Apresenta análises individualizadas do usuário que está interagindo, como perfil de uso (número de interações, dia e horário preferidos), padrões de comunicação, tempo médio de resposta, sessões e outros dados extraídos do histórico do usuário.\n\n\`.cat --all\` → Gera um relatório global agregando dados de todos os usuários, fornecendo métricas como o total de interações, usuários ativos, distribuição de mensagens por tipo, padrões de atividade (dias e horas de pico) e outros insights sobre a base completa de históricos.\n\nSe precisar de ajuda, acione o owner! 🚀`}, { quoted: info, ephemeralExpiration: expirationMessage });
 return;
        }
    } catch (err) {
        logger.error("[ GEMINI MODEL ] Erro na verificação do comando inválido:", err);
        return;
    }

    try {
        if (text.trim() === "--me") {
            let data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
            let userData = data[sender] || { history: [], systemInstruction: "Não definida" };
            let history = userData.history;
            const totalMessages = history.length;

            const userNameDisplay = userName || "Desconhecido";
            const frequency = totalMessages;
            let dayCount = {};
            let hourCount = {};
            history.filter(msg => msg.role === "user").forEach(msg => {
                let d = new Date(msg.timestamp);
                let day = d.toLocaleDateString("pt-BR", { weekday: 'long' });
                let hour = d.getHours();
                dayCount[day] = (dayCount[day] || 0) + 1;
                hourCount[hour] = (hourCount[hour] || 0) + 1;
            });
            const favoriteDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0] || ["Nenhum", 0];
            const favoriteHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0] || ["Nenhum", 0];

            let userMessages = history.filter(msg => msg.role === "user");
            let totalLength = userMessages.reduce((acc, msg) => {
                let len = msg.parts.reduce((sum, part) => sum + part.text.length, 0);
                return acc + len;
            }, 0);
            let avgLength = userMessages.length > 0 ? (totalLength / userMessages.length).toFixed(2) : "0";
            let randomMessagesCount = userMessages.filter(msg => {
                let textContent = msg.parts.map(p => p.text).join(" ").trim();
                return textContent.split(/\s+/).length < 3;
            }).length;
            let maxConsecutive = 0, currentConsecutive = 0;
            history.forEach(msg => {
                if (msg.role === "user") {
                    currentConsecutive++;
                } else if (msg.role === "model") {
                    if (currentConsecutive > maxConsecutive) { maxConsecutive = currentConsecutive; }
                    currentConsecutive = 0;
                }
            });
            if (currentConsecutive > maxConsecutive) { maxConsecutive = currentConsecutive; }

            const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
            const firstInteraction = sortedHistory[0] ? new Date(sortedHistory[0].timestamp).toLocaleString("pt-BR") : "N/A";
            const lastInteraction = sortedHistory[sortedHistory.length - 1] ? new Date(sortedHistory[sortedHistory.length - 1].timestamp).toLocaleString("pt-BR") : "N/A";

            let sessions = 0;
            let sessionStart = null;
            sortedHistory.forEach(msg => {
                if (!sessionStart) {
                    sessionStart = msg.timestamp;
                    sessions++;
                } else {
                    if (msg.timestamp - sessionStart >= 3600000) {
                        sessions++;
                        sessionStart = msg.timestamp;
                    }
                }
            });

            const midIndex = Math.floor(sortedHistory.length / 2);
            const firstHalfCount = sortedHistory.slice(0, midIndex).filter(msg => msg.role === "user").length;
            const secondHalfCount = sortedHistory.slice(midIndex).filter(msg => msg.role === "user").length;
            const engagementTrend = secondHalfCount > firstHalfCount ? "Mais engajado recentemente" : (secondHalfCount < firstHalfCount ? "Menos engajado recentemente" : "Sem variação");

            let responseTimes = [];
            for (let i = 0; i < history.length - 1; i++) {
                if (history[i].role === "user" && history[i + 1].role === "model") {
                    responseTimes.push(history[i + 1].timestamp - history[i].timestamp);
                }
            }
            const avgResponseTime = responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000).toFixed(2) + " seg" : "N/A";

            let repeatedMessages = 0;
            for (let i = 1; i < history.length; i++) {
                if (history[i].role === "user" && history[i - 1].role === "user" &&
                    history[i].parts[0].text.trim() === history[i - 1].parts[0].text.trim()) {
                    repeatedMessages++;
                }
            }

            let emojiRegex = /[\u{1F600}-\u{1F64F}]/gu;
            let totalEmojis = 0;
            userMessages.forEach(msg => {
                const count = (msg.parts.map(p => (p.text.match(emojiRegex) || [])).flat()).length;
                totalEmojis += count;
            });

            let userTimestamps = userMessages.map(msg => msg.timestamp).sort((a, b) => a - b);
            let gaps = [];
            for (let i = 1; i < userTimestamps.length; i++) {
                gaps.push(userTimestamps[i] - userTimestamps[i - 1]);
            }

            const avgInactivity = gaps.length > 0 ? (gaps.reduce((a, b) => a + b, 0) / gaps.length / 3600000).toFixed(2) + " horas" : "N/A";

            let interactionsByDay = {};
            userMessages.forEach(msg => {
                const day = new Date(msg.timestamp).toLocaleDateString("pt-BR");
                interactionsByDay[day] = (interactionsByDay[day] || 0) + 1;
            });
            const days = Object.keys(interactionsByDay).sort();
            let growth = "N/A";
            if (days.length >= 2) {
                const firstDayCount = interactionsByDay[days[0]];
                const lastDayCount = interactionsByDay[days[days.length - 1]];
                growth = firstDayCount > 0 ? (((lastDayCount - firstDayCount) / firstDayCount) * 100).toFixed(2) + "%" : "N/A";
            }

            const userStatus = frequency >= 10 ? "Ativo" : "Inativo";

            let shortCount = 0, longCount = 0;
            userMessages.forEach(msg => {
                const wordCount = msg.parts.map(p => p.text).join(" ").trim().split(/\s+/).length;
                if (wordCount < 5) shortCount++;
                else longCount++;
            });

           const analyticsMsg =
    `📊 *Analytics do Usuário:*\n\n` +
    
    `🔹 *1. Perfil de Uso:* \n` +
    `   - 👤 Nome: *${userNameDisplay}*\n` +
    `   - 🔄 Total de interações: *${frequency}*\n` +
    `   - 📅 Dia preferido: *${favoriteDay[0]}* (${favoriteDay[1]} msgs)\n` +
    `   - ⏰ Horário preferido: *${favoriteHour[0]}h* (${favoriteHour[1]} msgs)\n\n` +

    `💬 *2. Padrões de Comunicação:*\n` +
    `   - ✏️ Comprimento médio das mensagens: *${avgLength}* caracteres\n` +
    `   - 🔀 Mensagens curtas/aleatórias: *${randomMessagesCount}*\n` +
    `   - 🔥 Máximo de mensagens consecutivas: *${maxConsecutive}*\n\n` +

    `🔗 *3. Retenção e Lealdade:*\n` +
    `   - 🕰️ Primeira interação: *${firstInteraction}*\n` +
    `   - 🔚 Última interação: *${lastInteraction}*\n` +
    `   - 📌 Sessões detectadas: *${sessions}*\n` +
    `   - 📊 Tendência de engajamento: *${engagementTrend}*\n\n` +

    `📈 *4. Novas Métricas:* \n` +
    `   - ⚡ Tempo médio de resposta do bot: *${avgResponseTime}*\n` +
    `   - 🔁 Repetição de mensagens consecutivas: *${repeatedMessages}*\n` +
    `   - 😊 Total de emojis detectados: *${totalEmojis}*\n` +
    `   - ⏳ Período médio de inatividade: *${avgInactivity}*\n` +
    `   - 📊 Crescimento de interações (1º vs. último dia): *${growth}*\n` +
    `   - 🏷️ Status do usuário: *${userStatus}*\n` +
    `   - 📏 Mensagens curtas: *${shortCount}*  vs.  📝 Mensagens longas: *${longCount}*\n\n` +
    
    `🛠️ *Instrução do sistema:* _${userData.systemInstruction}_`;  


            await client.sendMessage(from, { react: { text: '📊', key: info.key } });
            await client.sendMessage(from, { text: analyticsMsg }, { quoted: info, ephemeralExpiration: expirationMessage });
            return;
        }
    } catch (error) {
        logger.error("[ GEMINI MODEL ] Erro ao processar os analytics do usuário:", error);
        await client.sendMessage(from, { react: { text: '‼️', key: info.key } });
        await client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao processar os analytics do usuário. Tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
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

                    await client.sendMessage(from, { react: { text: '🗑️', key: info.key } });
                    await client.sendMessage(from, { text: "_*🗑️ O histórico foi removido com sucesso! 🚀😊*_" }, { quoted: info, ephemeralExpiration: expirationMessage });

                } catch (writeErr) {
                    throw new Error("Falha ao salvar as alterações: " + writeErr);
                }

            } else {
                await client.sendMessage(from, { react: { text: '❓', key: info.key }});
                await client.sendMessage(from, { text: "_*❓ Não há registro de histórico para o referido a ser excluído. ℹ️*_" }, { quoted: info, ephemeralExpiration: expirationMessage });
            }
            return;
        }
    } catch (error) {
        logger.error("[ GEMINI MODEL ] Erro ao processar exclusão de histórico:", error);

        await client.sendMessage(from, { react: { text: '‼️', key: info.key }});
        await client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao tentar excluir o histórico do usuário. Por favor, tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
        await client.sendMessage(config.owner.number, { text: `*Erro ao excluir histórico do usuário:*\n\`\`\`${JSON.stringify(error, null,2)}\`\`\`` }, { quoted: info, ephemeralExpiration: expirationMessage });
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
            await client.sendMessage(from, { react: { text: '⚙️', key: info.key } });
            await client.sendMessage(from, { text: "_*🔄 Instrução do sistema para a personalidade da IA foi  atualizada com sucesso!*_" }, { quoted: info, ephemeralExpiration: expirationMessage });
            return;
        }
    } catch (error) {
        logger.error("[ GEMINI MODEL ] Erro ao atualizar instrução do sistema:", error);
        await client.sendMessage(from, { react: { text: '‼️', key: info.key } });
        client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao tentar atualizar a instrução do sistema. Por favor, tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
        client.sendMessage(config.owner.number, { text: `*Erro ao atualizar a instrução do sistema:*\n\`\`\`${JSON.stringify(error, null,2)}\`\`\`` }, { quoted: info, ephemeralExpiration: expirationMessage });
        return;
    }

    try {
        if (text.trim() === "--all") {
            let data = {};
            if (fs.existsSync(historyFilePath)) {
                data = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
            }
            let totalInteractions = 0;
            let totalUsers = 0;
            let activeUsers7 = 0;
            let activeUsers30 = 0;
            const now = Date.now();
            const oneDay = 24 * 3600000;
            const sevenDays = 7 * oneDay;
            const thirtyDays = 30 * oneDay;
            let dayCountGlobal = {};
            let hourCountGlobal = {};
            let randomGlobal = 0;
            let responseTimesGlobal = [];
            let totalEmojisGlobal = 0;
            let emojiFreq = {};
            let sessionsTotal = 0;
            let sessionLengths = [];
            let inactivityGaps = [];
            let userAvgReturnIntervals = [];
            let shortMsg = 0, mediumMsg = 0, longMsg = 0;
            let quickResponses = 0;
            let newUsers = 0, experiencedUsers = 0;
            
            for (const sender in data) {
                totalUsers++;
                const userData = data[sender];
                const history = userData.history || [];
                totalInteractions += history.length;
                if (history.length > 0) {
                    let lastMsgTs = history[history.length - 1].timestamp;
                    if ((now - lastMsgTs) <= sevenDays) { activeUsers7++; }
                    if ((now - lastMsgTs) <= thirtyDays) { activeUsers30++; }
                    if (history.length <= 3) { newUsers++; } else { experiencedUsers++; }
                }
                const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
                for (let i = 0; i < sortedHistory.length; i++) {
                    const msg = sortedHistory[i];
                    const d = new Date(msg.timestamp);
                    let dayName = d.toLocaleDateString("pt-BR", { weekday: "long" });
                    dayCountGlobal[dayName] = (dayCountGlobal[dayName] || 0) + 1;
                    let hour = d.getHours();
                    hourCountGlobal[hour] = (hourCountGlobal[hour] || 0) + 1;
                    const textContent = msg.parts.map(p => p.text).join(" ").trim();
                    const words = textContent.split(/\s+/);
                    if (words.length < 3) {
                        randomGlobal++;
                    }
                    const wordCount = words.length;
                    if (wordCount < 5) {
                        shortMsg++;
                    } else if(wordCount <=15) {
                        mediumMsg++;
                    } else {
                        longMsg++;
                    }
                    let emojiRegex = /[\u{1F600}-\u{1F64F}]/gu;
                    const emojisFound = textContent.match(emojiRegex) || [];
                    totalEmojisGlobal += emojisFound.length;
                    emojisFound.forEach(e => { emojiFreq[e] = (emojiFreq[e] || 0) + 1; });
                    if (i > 0) {
                        inactivityGaps.push(msg.timestamp - sortedHistory[i-1].timestamp);
                    }
                }
                let userSessions = 0;
                let sessionStart = null;
                let userReturnIntervals = [];
                for (let i = 0; i < sortedHistory.length; i++) {
                    const msg = sortedHistory[i];
                    if (!sessionStart) {
                        sessionStart = msg.timestamp;
                        userSessions++;
                    } else {
                        if (msg.timestamp - sessionStart >= 3600000) {
                            const sessionDuration = sortedHistory[i-1].timestamp - sessionStart;
                            sessionLengths.push(sessionDuration);
                            userReturnIntervals.push(msg.timestamp - sortedHistory[i-1].timestamp);
                            userSessions++;
                            sessionStart = msg.timestamp;
                        }
                    }
                }
                sessionsTotal += userSessions;
                if (userReturnIntervals.length > 0) {
                    const avgReturn = userReturnIntervals.reduce((a, b) => a + b, 0) / userReturnIntervals.length;
                    userAvgReturnIntervals.push(avgReturn);
                }
                for (let i = 0; i < sortedHistory.length - 1; i++) {
                    if (sortedHistory[i].role === "user" && sortedHistory[i+1].role === "model") {
                        let respTime = sortedHistory[i+1].timestamp - sortedHistory[i].timestamp;
                        responseTimesGlobal.push(respTime);
                        if (respTime/1000 < 2) { quickResponses++; }
                    }
                }
            }
            const avgResponseTimeGlobal = responseTimesGlobal.length > 0
                ? (responseTimesGlobal.reduce((a,b)=>a+b,0) / responseTimesGlobal.length / 1000).toFixed(2) + " seg"
                : "N/A";
            const quickResponseRate = responseTimesGlobal.length > 0 
                ? ((quickResponses / responseTimesGlobal.length) * 100).toFixed(2) + "%" 
                : "N/A";
            const avgInactivityGlobal = inactivityGaps.length > 0
                ? (inactivityGaps.reduce((a,b)=>a+b,0) / inactivityGaps.length / 3600000).toFixed(2) + " horas"
                : "N/A";
            const avgSessionsPerUser = totalUsers > 0 ? (sessionsTotal / totalUsers).toFixed(2) : "N/A";
            const avgSessionLength = sessionLengths.length > 0
                ? (sessionLengths.reduce((a,b)=>a+b,0)/sessionLengths.length/60000).toFixed(2) + " min"
                : "N/A";
            const avgReturnTime = userAvgReturnIntervals.length > 0
                ? (userAvgReturnIntervals.reduce((a,b)=>a+b,0)/userAvgReturnIntervals.length/3600000).toFixed(2) + " horas"
                : "N/A";
            const retentionRate = totalUsers > 0
                ? ((totalUsers - Object.values(data).filter(u => (u.history || []).length <= 1).length) / totalUsers * 100).toFixed(2) + "%"
                : "N/A";
            const avgInteractionsPerUser = totalUsers > 0 ? (totalInteractions / totalUsers).toFixed(2) : "N/A";
            const topEmojis = Object.entries(emojiFreq).sort((a,b)=>b[1]-a[1]).slice(0,3)
                .map(([emoji, count]) => `${emoji} (${count})`).join(", ") || "N/A";
            const topDay = Object.entries(dayCountGlobal).sort((a,b)=>b[1]-a[1])[0] || ["N/A", 0];
            const topHour = Object.entries(hourCountGlobal).sort((a,b)=>b[1]-a[1])[0] || ["N/A", 0];
            
          let analyticsAll =
    `📊 *Analytics Global:*\n\n` +

    `🔹 *1. Análise de Engajamento Global:*\n` +
    `   - 🔄 Total de Interações: *${totalInteractions}* mensagens\n` +
    `   - 👥 Usuários Ativos (últimos 7 dias): *${activeUsers7}*\n` +
    `   - 🔁 Retenção de Usuários (mais de 1 interação): *${retentionRate}*\n` +
    `   - 📊 Padrão de Atividade: \n` +
    `     - 📅 Dia mais ativo: *${topDay[0]}* (${topDay[1]} msgs)\n` +
    `     - ⏰ Hora mais ativa: *${topHour[0]}h* (${topHour[1]} msgs)\n\n` +

    `💬 *2. Distribuição de Mensagens por Tipo:*\n` +
    `   - 📏 Distribuição de Tamanho:\n` +
    `     - ✂️ Curtas: *${shortMsg}*\n` +
    `     - 📄 Médias: *${mediumMsg}*\n` +
    `     - 📝 Longas: *${longMsg}*\n` +
    `   - 🔀 Mensagens Aleatórias: *${randomGlobal}*\n` +
    `   - 😊 Uso de Emojis: *${totalEmojisGlobal}* (Top 3: *${topEmojis}*)\n\n` +

    `⏳ *3. Análise de Sessões e Tempo de Uso:*\n` +
    `   - 📌 Sessões por Usuário (média): *${avgSessionsPerUser}*\n` +
    `   - ⏰ Tempo Médio de Sessão: *${avgSessionLength}*\n` +
    `   - 🚫 Tempo de Inatividade Global: *${avgInactivityGlobal}*\n` +
    `   - 🔄 Tempo Médio Entre Interações: *${avgReturnTime}*\n\n` +

    `📈 *4. Análise de Retenção e Engajamento:*\n` +
    `   - 🔢 Interações Médias por Usuário: *${avgInteractionsPerUser}*\n` +
    `   - ⚡ Taxa de Respostas Rápidas (<2 seg): *${quickResponseRate}*\n` +
    `   - 🆕 Usuários Novos vs. Experientes:\n` +
    `     - ✨ Novos: *${newUsers}*\n` +
    `     - 👴 Experientes: *${experiencedUsers}*\n` +
    `   - 📅 Usuários Ativos vs. Inativos (30 dias):\n` +
    `     - ✅ Ativos: *${activeUsers30}*\n` +
    `     - ❌ Inativos: *${totalUsers - activeUsers30}*\n\n` +

    `📊 *5. Distribuição de Interações:*\n` +
    `   - ⏰ Interações por Hora/Dia da Semana:\n` +
    `     - 🔥 Picos em: *${topHour[0]}h* e *${topDay[0]}*\n` +
    `   - 📆 Distribuição de Interações por Mês: *(Não implementado)*\n\n` +

    `🚀 *6. Crescimento de Usuários Ativos:*\n` +
    `   - 📊 *(Métrica não implementada)*\n\n` +

    `📝 *7. Feedback e Qualidade de Resposta:*\n` +
    `   - ⏱️ Tempo Médio de Resposta: *${avgResponseTimeGlobal}*\n`;

            await client.sendMessage(from, { react: { text: '📊', key: info.key } });
            await client.sendMessage(from, { text: analyticsAll }, { quoted: info, ephemeralExpiration: expirationMessage });
            return;
        }
    } catch (error) {
        logger.error("[ GEMINI MODEL ] Erro ao processar analytics global:", error);
        await client.sendMessage(from, { react: { text: '‼️', key: info.key } });
        await client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao processar analytics global. Tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
        return;
    }

    let history, systemInstruction;

    if (fs.existsSync(historyFilePath)) {

        const data = fs.readFileSync(historyFilePath, "utf8");
        const historyData = JSON.parse(data);

        logger.info("[ GEMINI MODEL ] carregando historico do usuario...");

        const userRecord = historyData[sender] || { history: [], systemInstruction: null };
        const prazo = 72 * 3600 * 1000;

        userRecord.history = userRecord.history.filter(record => (Date.now() - record.timestamp) < prazo);
        history = userRecord.history;
        systemInstruction = userRecord.systemInstruction;

    } else {
        history = [];
        systemInstruction = null;
    }

    systemInstruction = systemInstruction || "Responda sempre em português de forma objetiva e direta, sem explicações desnecessárias.";
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction, });

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
        await client.sendMessage(from, { react: { text: '‼️', key: info.key } });
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
        
        await client.sendMessage(from, { react: { text: '‼️', key: info.key } });
        await client.sendMessage(from, { text: "*ℹ️ Ocorreu um erro ao tentar salvar o histórico do usuário. Por favor, tente novamente posteriormente.*" }, { quoted: info, ephemeralExpiration: expirationMessage });
        await client.sendMessage(config.owner.number, { text: `*Error: ${err.message}*` }, { quoted: info, ephemeralExpiration: expirationMessage });
        return;
    }

    await client.sendMessage(from, { react: { text: '🐈‍⬛', key: info.key }});
    await client.sendMessage(from, { text: result.response.text() }, { quoted: info, ephemeralExpiration: expirationMessage });
    return;
}

module.exports = { generateAIContent };

