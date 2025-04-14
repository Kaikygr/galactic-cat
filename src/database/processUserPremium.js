// /home/kaiky/Área de trabalho/dev/src/database/processUserPremium.js
const { runQuery } = require("./processDatabase");
const moment = require("moment-timezone");
const logger = require("../utils/logger");

// Function to parse duration string (e.g., "30d", "24h", "60m")
function parseDuration(durationStr) {
  const durationMatch = durationStr.toLowerCase().match(/^(\d+)\s*(d|h|m|days|horas|minutos)?$/);
  if (!durationMatch) {
    throw new Error("Formato de duração inválido. Use números seguidos por 'd', 'h', ou 'm' (ex: 30d, 24h, 60m).");
  }

  const value = parseInt(durationMatch[1], 10);
  const unit = (durationMatch[2] || "d").charAt(0); // Default to days if no unit

  switch (unit) {
    case "d":
      return moment.duration(value, "days");
    case "h":
      return moment.duration(value, "hours");
    case "m":
      return moment.duration(value, "minutes");
    default:
      throw new Error(`Unidade de duração inválida: ${unit}. Use 'd', 'h', ou 'm'.`);
  }
}

async function processPremiumStatus(userId, durationStr, client, originalInfo, replyJid, expiration) {
  try {
    if (!userId || !userId.includes("@s.whatsapp.net")) {
      throw new Error(`ID de usuário inválido fornecido: ${userId}. Certifique-se que é um JID completo.`);
    }

    const duration = parseDuration(durationStr);
    const expiryDate = moment().add(duration);
    const expiryTimestamp = expiryDate.format("YYYY-MM-DD HH:mm:ss");

    // Ensure user exists in the users table first (important for foreign key in command_usage)
    const userCheck = await runQuery("SELECT sender FROM users WHERE sender = ?", [userId]);
    if (userCheck.length === 0) {
      logger.info(`[processPremiumStatus] User ${userId} not found in users table. Inserting.`);
      // Attempt to get pushName if possible, otherwise use placeholder
      // This part is tricky without direct access to the 'info' object related to the *target* user
      // We might need to fetch it or use a default. Using "Premium User" for now.
      await runQuery("INSERT INTO users (sender, pushName, isPremium, premiumTemp) VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE pushName=VALUES(pushName)", [userId, "Usuario Premium", expiryTimestamp]);
      logger.info(`[processPremiumStatus] New user ${userId} inserted.`);
    }

    const query = `
            INSERT INTO users (sender, isPremium, premiumTemp)
            VALUES (?, 1, ?)
            ON DUPLICATE KEY UPDATE
                isPremium = 1,
                premiumTemp = VALUES(premiumTemp)
        `;

    await runQuery(query, [userId, expiryTimestamp]);

    const successMsg = `✅ Usuário \`\`\`${userId.split("@")[0]}\`\`\` agora é Premium!\nExpira em: ${expiryDate.tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm")} (${duration.humanize(true)})`;
    logger.info(`[processPremiumStatus] ${successMsg}`);

    // Send confirmation back to the owner/admin who issued the command
    if (client && originalInfo && replyJid) {
      await client.sendMessage(replyJid, { text: successMsg }, { quoted: originalInfo, ephemeralExpiration: expiration });

      // Optionally, notify the user who received premium status
      try {
        await client.sendMessage(userId, { text: `🎉 Parabéns! Você recebeu status Premium no bot!\nSeu acesso expira em: ${expiryDate.tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm")}` });
      } catch (notifyError) {
        logger.warn(`[processPremiumStatus] Falha ao notificar usuário ${userId} sobre status premium: ${notifyError.message}`);
        await client.sendMessage(replyJid, { text: `⚠️ Não foi possível notificar o usuário ${userId.split("@")[0]} diretamente.` }, { quoted: originalInfo, ephemeralExpiration: expiration });
      }
    }
  } catch (error) {
    logger.error(`[processPremiumStatus] Erro ao processar status premium para ${userId}:`, error);
    // Re-throw the error so the calling function (botController) can catch it and notify the sender
    throw error;
  }
}

module.exports = { processPremiumStatus };
