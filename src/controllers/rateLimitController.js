// /home/kaiky/Área de trabalho/dev/src/controllers/rateLimitController.js
const logger = require("../utils/logger");
const { runQuery } = require("../database/processDatabase");
const config = require("../config/options.json");
const moment = require("moment-timezone");

/**
 * Checks if a user is currently premium.
 * @param {string} userId - The user's ID (sender).
 * @returns {Promise<boolean>} - True if the user is premium, false otherwise.
 */
async function isUserPremium(userId) {
  if (!userId) return false;
  try {
    const query = `
      SELECT isPremium, premiumTemp
      FROM users
      WHERE sender = ?
    `;
    const results = await runQuery(query, [userId]);

    if (results.length === 0) {
      return false;
    }

    const user = results[0];
    const isCurrentlyPremium = user.isPremium === 1;
    const hasValidExpiry = !user.premiumTemp || moment(user.premiumTemp).isAfter(moment());

    if (isCurrentlyPremium && user.premiumTemp && moment(user.premiumTemp).isBefore(moment())) {
      logger.info(`[isUserPremium] Premium status expired for user ${userId}. Updating database.`);
      try {
        const updateQuery = `UPDATE users SET isPremium = 0, premiumTemp = NULL WHERE sender = ?`;
        await runQuery(updateQuery, [userId]);
      } catch (updateError) {
        logger.error(`[isUserPremium] Failed to update expired premium status for ${userId}:`, updateError);
      }
      return false;
    }

    return isCurrentlyPremium && hasValidExpiry;
  } catch (error) {
    logger.error(`[isUserPremium] Error checking premium status for ${userId}:`, error);
    return false;
  }
}

/**
 * Checks if a user has exceeded the command usage limit within the defined time window.
 * Updates the usage count if the command is allowed.
 *
 * @param {string} userId - The user's ID (sender).
 * @param {string} commandName - The name of the command being executed.
 * @returns {Promise<{allow: boolean, message?: string}>} - Object indicating if the command is allowed and an optional message.
 */
async function checkRateLimit(userId, commandName) {
  try {
    const isPremium = await isUserPremium(userId);
    const commandLimits = config.commandLimits?.[commandName] || config.commandLimits?.default;

    if (!commandLimits) {
      logger.warn(`[checkRateLimit] No rate limit configuration found for command '${commandName}' or default. Allowing.`);
      return { allow: true };
    }

    const limits = isPremium ? commandLimits.premium : commandLimits.nonPremium;

    if (!limits || limits.limit < 0) {
      return { allow: true };
    }
    if (limits.limit === 0) {
      return { allow: false, message: `❌ Desculpe, o comando \`${commandName}\` está temporariamente desativado.` }; // Explicitly disabled
    }

    const { limit, windowMinutes } = limits;
    const now = moment();
    const windowMillis = windowMinutes * 60 * 1000;

    const selectQuery = `
      SELECT usage_count_window, window_start_timestamp
      FROM command_usage
      WHERE user_id = ? AND command_name = ?
    `;
    const usageData = await runQuery(selectQuery, [userId, commandName]);

    let currentCount = 0;
    let windowStart = null;

    if (usageData.length > 0) {
      currentCount = usageData[0].usage_count_window;
      windowStart = moment(usageData[0].window_start_timestamp);
    }

    if (!windowStart || now.diff(windowStart) > windowMillis) {
      const upsertQuery = `
        INSERT INTO command_usage (user_id, command_name, usage_count_window, window_start_timestamp, last_used_timestamp)
        VALUES (?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE
          usage_count_window = 1,
          window_start_timestamp = VALUES(window_start_timestamp),
          last_used_timestamp = VALUES(last_used_timestamp)
      `;
      await runQuery(upsertQuery, [userId, commandName, now.toDate(), now.toDate()]);
      logger.info(`[checkRateLimit] User ${userId} used command ${commandName}. Count reset/started. (Limit: ${limit}/${windowMinutes}m)`);
      return { allow: true };
    } else {
      if (currentCount >= limit) {
        const remainingMillis = windowMillis - now.diff(windowStart);
        const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
        const message = `⚠️ *Limite de Uso Atingido* ⚠️

Olá! Detectamos que você utilizou o comando \`!${commandName}\` ${currentCount} vezes ${isPremium ? "(Usuário Premium)" : ""}, atingindo assim o limite permitido de *${limit} uso(s)* dentro do período de *${windowMinutes} minuto(s)*.

⏳ Para garantir estabilidade, segurança e uma boa experiência para todos os usuários, impomos essa limitação temporária. Você poderá utilizar este comando novamente em aproximadamente *${remainingMinutes} minuto(s)*.

💎 *Quer mais liberdade?* Usuários Premium possuem limites ampliados, acesso prioritário, comandos exclusivos e suporte personalizado. Se você deseja continuar utilizando sem restrições ou tem interesse em planos personalizados com recursos adicionais, entre em contato com o desenvolvedor!

📞 *Fale com o desenvolvedor:* Converse com *Kaiky Brito* diretamente no WhatsApp pelo link:
👉 https://wa.me/message/C4CZHIMQU66PD1

Agradecemos pela compreensão e pelo uso do nosso serviço. 🚀`;

        logger.warn(`[checkRateLimit] User ${userId} rate limited for command ${commandName}. Count: ${currentCount}/${limit}`);
        return { allow: false, message: message };
      } else {
        const updateQuery = `
          UPDATE command_usage
          SET usage_count_window = usage_count_window + 1, last_used_timestamp = ?
          WHERE user_id = ? AND command_name = ?
        `;
        await runQuery(updateQuery, [now.toDate(), userId, commandName]);
        logger.info(`[checkRateLimit] User ${userId} used command ${commandName}. Count: ${currentCount + 1}/${limit} (Limit: ${limit}/${windowMinutes}m)`);
        return { allow: true };
      }
    }
  } catch (error) {
    logger.error(`[checkRateLimit] Error checking rate limit for user ${userId}, command ${commandName}:`, error);
    return { allow: false, message: "❌ Ocorreu um erro interno ao verificar seus limites de uso. Tente novamente mais tarde." };
  }
}

module.exports = {
  checkRateLimit,
  isUserPremium,
};
