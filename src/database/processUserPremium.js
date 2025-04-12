const { runQuery } = require("./processDatabase");
const logger = require("../utils/logger");

function formatPhoneNumber(phone) {
  const numbers = phone.replace(/\D/g, "");
  return `${numbers}@s.whatsapp.net`;
}

async function processPremiumStatus(sender, duration, client) {
  try {
    const formattedSender = formatPhoneNumber(sender);

    const durationMap = {
      minute: "MINUTE",
      hour: "HOUR",
      day: "DAY",
      week: "WEEK",
      month: "MONTH",
      year: "YEAR",
    };

    const [amount, unit] = duration.split(" ");
    const mysqlUnit = durationMap[unit.toLowerCase()];

    if (!mysqlUnit) {
      throw new Error("Formato de duração inválido. Use: quantidade + (minute|hour|day|week|month|year)");
    }

    const updateQuery = `
      UPDATE users 
      SET isPremium = 1,
          premiumTemp = DATE_ADD(NOW(), INTERVAL ? ${mysqlUnit})
      WHERE sender = ?
    `;

    await runQuery(updateQuery, [amount, formattedSender]);

    const selectQuery = `
      SELECT pushName, DATE_FORMAT(premiumTemp, '%d/%m/%Y às %H:%i') as endDate
      FROM users
      WHERE sender = ?
    `;

    const [userData] = await runQuery(selectQuery, [formattedSender]);

    const welcomeMessage = `
╭────ꕥ *PREMIUM ATIVADO* ꕥ────
│
│ 🎉 *Bem-vindo(a) ao clube Premium,*
│ ✨ *${userData.pushName}!*
│
│ 📅 Seu acesso premium está ativo
│ e expira em:
│ 🗓️ *${userData.endDate}*
│
│ 🌟 Aproveite todos os recursos
│ exclusivos disponíveis para você!
│
╰─────ꕥ *GALACTIC CAT* ꕥ─────
    `.trim();

    logger.info(`[ processPremiumStatus ] ✅ Status premium atualizado para ${sender} por ${duration}`);
    return client.sendMessage(formattedSender, {
      text: welcomeMessage,
      mentions: [formattedSender],
    });
  } catch (err) {
    logger.error(`[ processPremiumStatus ] ❌ Erro ao atualizar status premium: ${err}`);
    throw err;
  }
}

module.exports = { processPremiumStatus };
