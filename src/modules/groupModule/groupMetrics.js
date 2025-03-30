const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");

const ConfigfilePath = path.join("./../../config/options.json");
const config = require(ConfigfilePath);

const groupDataPath = path.join(__dirname, "../../data/groupData.json");

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function calculateTimeDifferenceInSeconds(date1, date2) {
  return Math.abs(new Date(date2) - new Date(date1)) / 1000;
}

function getTimePeriod(hour) {
  if (hour >= 6 && hour < 12) return "manhã";
  if (hour >= 12 && hour < 18) return "tarde";
  if (hour >= 18 && hour < 24) return "noite";
  return "madrugada";
}

function calculateTotalParticipants(group) {
  return group.size;
}

function calculateActiveParticipants(group) {
  return Object.values(group.participants).filter(p => p.occurrences > 0).length;
}

function calculateInactiveParticipants(totalParticipants, activeParticipants) {
  return totalParticipants - activeParticipants;
}

function calculateTotalMessages(group) {
  return Object.values(group.participants).reduce((sum, p) => sum + p.occurrences, 0);
}

function calculateEngagement(totalMessages, activeParticipants) {
  return (totalMessages / activeParticipants).toFixed(0);
}

function calculateHourlyActivity(timestamps) {
  return timestamps.reduce((acc, ts) => {
    const hour = ts.getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {});
}

function calculatePeakHours(timestamps) {
  return timestamps.reduce((acc, ts) => {
    const period = getTimePeriod(ts.getHours());
    acc[period] = (acc[period] || 0) + 1;
    return acc;
  }, {});
}

function calculateAverageResponseTime(group, activeParticipants) {
  return (
    Object.values(group.participants).reduce((totalTime, participant) => {
      const timestamps = participant.timestamps.map(ts => new Date(ts)).sort((a, b) => a - b);
      const timeDiffs = timestamps.slice(1).map((ts, i) => calculateTimeDifferenceInSeconds(timestamps[i], ts));
      const avgTime = timeDiffs.length ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length : 0;
      return totalTime + avgTime;
    }, 0) / activeParticipants
  );
}

function calculateMessagesAndPeakActivityPerDay(timestamps) {
  const messagesPerDay = timestamps.reduce((acc, ts) => {
    const day = ts.toLocaleString("pt-BR", { weekday: "long" });
    acc[day] = acc[day] || { total: 0, hourlyActivity: {} };
    acc[day].total += 1;
    const hour = ts.getHours();
    acc[day].hourlyActivity[hour] = (acc[day].hourlyActivity[hour] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(messagesPerDay).reduce((acc, [day, data]) => {
    const peakHour = Object.entries(data.hourlyActivity).sort(([, a], [, b]) => b - a)[0];
    acc[day] = {
      totalMessages: data.total,
      peakHour: peakHour[0],
      peakMessages: peakHour[1],
    };
    return acc;
  }, {});
}

function calculateParticipationFrequencyRanking(group, totalMessages) {
  return Object.entries(group.participants).reduce((acc, [id, participant]) => {
    acc[id] = {
      frequency: ((participant.occurrences / totalMessages) * 100).toFixed(2) + "%",
      occurrences: participant.occurrences,
      mostUsedType: Object.entries(participant.messageTypes).sort(([, a], [, b]) => b.count - a.count)[0][0],
      peakHours: participant.timestamps.reduce((acc, ts) => {
        const hour = new Date(ts).getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {}),
    };
    return acc;
  }, {});
}

function calculateGrowthHistory(growthHistory) {
  if (!growthHistory || growthHistory.length < 2) return "Sem dados suficientes para calcular o crescimento.";

  const sortedHistory = growthHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const initialSize = sortedHistory[0].size;
  const finalSize = sortedHistory[sortedHistory.length - 1].size;
  const growth = finalSize - initialSize;

  return {
    initialSize,
    finalSize,
    growth,
    percentage: ((growth / initialSize) * 100).toFixed(2) + "%",
  };
}

async function processGroupMetrics(client, info, from, expirationMessage) {
  try {
    let groupData;
    try {
      groupData = JSON.parse(fs.readFileSync(groupDataPath, "utf-8"));
    } catch (e) {
      throw new Error("❌ Erro: Falha ao ler ou processar o arquivo groupData.json. Verifique se o arquivo existe e está corretamente formatado.");
    }

    const group = groupData[from];
    if (!group) {
      throw new Error("⚠️ Aviso: O grupo especificado não foi encontrado. Certifique-se de que o ID do grupo está correto.");
    }

    const totalParticipants = calculateTotalParticipants(group);
    const activeParticipants = calculateActiveParticipants(group);
    const inactiveParticipants = calculateInactiveParticipants(totalParticipants, activeParticipants);
    const totalMessages = calculateTotalMessages(group);
    const engagement = calculateEngagement(totalMessages, activeParticipants);

    const timestamps = Object.values(group.participants).flatMap(p => p.timestamps.map(ts => new Date(ts)));
    const hourlyActivity = calculateHourlyActivity(timestamps);
    const peakHour = Object.entries(hourlyActivity).sort((a, b) => b[1] - a[1])[0];
    const peakHours = calculatePeakHours(timestamps);
    const averageResponseTime = calculateAverageResponseTime(group, activeParticipants);
    const messagesAndPeakActivityPerDay = calculateMessagesAndPeakActivityPerDay(timestamps);
    const participationFrequencyRanking = calculateParticipationFrequencyRanking(group, totalMessages);

    const top5ParticipationRanking = Object.entries(participationFrequencyRanking)
      .sort(([, a], [, b]) => parseFloat(b.frequency) - parseFloat(a.frequency))
      .slice(0, 5);

    const growthData = calculateGrowthHistory(group.growthHistory);

    const metrics = `
📊 *Métricas do Grupo: ${group.name}* 📊

👥 *Participantes Totais:* ${totalParticipants}
✅ *Participantes Ativos:* ${activeParticipants}
❌ *Participantes Inativos:* ${inactiveParticipants}

💬 *Total de Mensagens:* ${totalMessages}
📈 *Engajamento Médio:* ${engagement} mensagens por participante ativo
⏰ *Pico de Atividade Geral:* ${peakHour[0]}h com ${peakHour[1]} mensagens

📆 *Atividade por Dia da Semana:*
${Object.entries(messagesAndPeakActivityPerDay)
  .map(([day, { totalMessages, peakHour, peakMessages }]) => `- ${day}: ${totalMessages} mensagens (Pico: ${peakHour}h com ${peakMessages} mensagens)`)
  .join("\n")}

🕒 *Horários de Pico:*
${Object.entries(peakHours)
  .map(([period, count]) => `- ${period}: ${count} mensagens`)
  .join("\n")}

⏳ *Tempo Médio de Resposta entre membros:* ${formatDuration(averageResponseTime)}

📈 *Crescimento do Grupo:*
- Tamanho Inicial: ${growthData.initialSize}
- Tamanho Final: ${growthData.finalSize}
- Crescimento: ${growthData.growth} membros (${growthData.percentage})

📊 *Top 5 Ranking de Frequência de Participação:*
${top5ParticipationRanking
  .map(([id, data]) => {
    const peakHour = Object.entries(data.peakHours).sort(([, a], [, b]) => b - a)[0];
    return `
  • @${id.split("@")[0]}:
  • 📊 Frequência: ${data.frequency}
  • 💬 Mensagens: ${data.occurrences}
  • ⏰ Horário de Pico: ${peakHour[0]}h (${peakHour[1]} mensagens)`;
  })
  .join("\n")}`;

    await client.sendMessage(
      from,
      {
        text: metrics.trim(),
        mentions: top5ParticipationRanking.map(([id]) => id),
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } catch (error) {
    logger.error("Erro ao processar métricas do grupo:", error);

    await client.sendMessage(
      from,
      {
        text: "❌ *Ocorreu um erro ao calcular as métricas do grupo. O problema já foi reportado ao proprietário. 🚨*",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    await client.sendMessage(
      config.owner.number,
      {
        text: `⚠️ *Erro ao calcular as métricas do grupo* ⚠️\n\n*Grupo:* ${from}\n*Erro:* ${error.message}`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
    return;
  }
}

async function processUserMetrics(client, info, from, expirationMessage, userId) {
  try {
    let groupData;
    try {
      groupData = JSON.parse(fs.readFileSync(groupDataPath, "utf-8"));
    } catch (e) {
      throw new Error("❌ Erro: Falha ao ler ou processar o arquivo groupData.json. Verifique se o arquivo existe e está corretamente formatado.");
    }

    const group = groupData[from];
    if (!group) {
      throw new Error("⚠️ Aviso: O grupo especificado não foi encontrado. Certifique-se de que o ID do grupo está correto.");
    }

    const user = group.participants[userId];
    if (!user) {
      throw new Error("⚠️ Aviso: O usuário especificado não foi encontrado no grupo.");
    }

    const totalMessages = user.occurrences;
    const messageTypes = Object.entries(user.messageTypes)
      .map(([type, data]) => `- ${type}: ${data.count} mensagens`)
      .join("\n");

    const daysAndHours = user.timestamps.reduce((acc, ts) => {
      const date = new Date(ts);
      const day = date.toLocaleString("pt-BR", { weekday: "long" });
      const hour = date.getHours();
      acc[day] = acc[day] || {};
      acc[day][hour] = (acc[day][hour] || 0) + 1;
      return acc;
    }, {});

    const peakByDay = Object.entries(daysAndHours)
      .map(([day, hours]) => {
        const [peakHour, count] = Object.entries(hours).sort(([, a], [, b]) => b - a)[0];
        return `- ${day}: ${count} mensagens no pico às ${peakHour}h`;
      })
      .join("\n");

    const participationPercentage = ((totalMessages / calculateTotalMessages(group)) * 100).toFixed(2);

    const participationRanking =
      Object.entries(group.participants)
        .sort(([, a], [, b]) => b.occurrences - a.occurrences)
        .findIndex(([id]) => id === userId) + 1;

    const timestamps = user.timestamps.map(ts => new Date(ts));
    const timeDiffs = timestamps.slice(1).map((ts, i) => calculateTimeDifferenceInSeconds(timestamps[i], ts));
    const averageTimeBetweenMessages = timeDiffs.length ? formatDuration(timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length) : "N/A";

    const joinDate = new Date(Math.min(...timestamps)).toLocaleDateString("pt-BR");

    const messagesPerWeek = (totalMessages / ((Date.now() - new Date(group.creation * 1000)) / (1000 * 60 * 60 * 24 * 7))).toFixed(0);
    const messagesPerMonth = (totalMessages / ((Date.now() - new Date(group.creation * 1000)) / (1000 * 60 * 60 * 24 * 30))).toFixed(0);

    const messagesPerDay = (totalMessages / ((Date.now() - new Date(group.creation * 1000)) / (1000 * 60 * 60 * 24))).toFixed(0);

    const interruptions = timeDiffs.filter(diff => diff > 24 * 60 * 60).length;

    const metrics = `
📊 *Métricas do Usuário: ${user.pushName || "Desconhecido"}* 📊

👤 *ID do Usuário:* @${userId.split("@")[0]}
💬 *Total de Mensagens:* ${totalMessages}
⏰ *Horário de Pico por Dia da Semana:*
${peakByDay}

🔢 *Participação Relativa no Grupo:* ${participationPercentage}%
🏅 *Ranking no Grupo:* ${participationRanking}º de ${Object.keys(group.participants).length} usuários

⏳ *Tempo Médio entre Mensagens:* ${averageTimeBetweenMessages}
📆 *Data de Entrada no Grupo:* ${joinDate}

🏆 *Média de Mensagens por Dia:* ${messagesPerDay}
📈 *Média de Mensagens por Semana:* ${messagesPerWeek}
📈 *Média de Mensagens por Mês:* ${messagesPerMonth}

❌ *Interrupções na Participação:* ${interruptions} períodos sem mensagens por mais de 24 horas.
`;

    await client.sendMessage(
      from,
      {
        text: metrics.trim(),
        mentions: [userId],
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } catch (error) {
    logger.error("Erro ao processar métricas do usuário:", error);

    await client.sendMessage(
      from,
      {
        text: "❌ *Ocorreu um erro ao calcular as métricas do usuário. O problema já foi reportado ao proprietário. 🚨*",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );

    await client.sendMessage(
      config.owner.number,
      {
        text: `⚠️ *Erro ao calcular as métricas do usuário* ⚠️\n\n*Grupo:* ${from}\n*Usuário:* ${userId}\n*Erro:* ${error.message}`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
    return;
  }
}

module.exports = { processGroupMetrics, processUserMetrics };
