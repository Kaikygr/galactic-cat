// /home/kaiky/Área de trabalho/dev/src/controllers/rateLimitController.js
const logger = require("../utils/logger");
const { runQuery } = require("../database/processDatabase");
const config = require("../config/options.json");
const moment = require("moment-timezone");

// isUserPremium function remains the same...
async function isUserPremium(userId) {
  // ... (keep existing implementation)
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

    // Check for expired premium status
    if (isCurrentlyPremium && user.premiumTemp && moment(user.premiumTemp).isBefore(moment())) {
      logger.info(`[isUserPremium] Premium status expired for user ${userId}. Updating database.`);
      try {
        const updateQuery = `UPDATE users SET isPremium = 0, premiumTemp = NULL WHERE sender = ?`;
        await runQuery(updateQuery, [userId]);
      } catch (updateError) {
        logger.error(`[isUserPremium] Failed to update expired premium status for ${userId}:`, updateError);
      }
      return false; // Return false as premium has expired
    }

    // Valid premium if isPremium is 1 AND (premiumTemp is NULL OR premiumTemp is in the future)
    const hasValidExpiry = !user.premiumTemp || moment(user.premiumTemp).isAfter(moment());
    return isCurrentlyPremium && hasValidExpiry;
  } catch (error) {
    logger.error(`[isUserPremium] Error checking premium status for ${userId}:`, error);
    return false; // Default to false on error
  }
}

/**
 * Checks command rate limits and returns detailed status.
 *
 * @param {string} userId - The user's ID.
 * @param {string} commandName - The command name.
 * @returns {Promise<{status: 'allowed' | 'rate_limited' | 'disabled' | 'error', message?: string, isPremium: boolean, currentCount?: number, limit?: number}>}
 *          - status: The outcome of the check.
 *          - message: Optional message (e.g., for rate limit).
 *          - isPremium: Whether the user was premium during the check.
 *          - currentCount: The usage count *before* this attempt (if applicable).
 *          - limit: The limit applied during this check (if applicable).
 */
async function checkRateLimit(userId, commandName) {
  let isPremium = false; // Initialize isPremium
  try {
    isPremium = await isUserPremium(userId); // Determine premium status first
    const commandLimits = config.commandLimits?.[commandName] || config.commandLimits?.default;

    if (!commandLimits) {
      logger.warn(`[checkRateLimit] No rate limit config for '${commandName}' or default. Allowing.`);
      // Still return the basic structure even if allowed by default
      return { status: "allowed", isPremium };
    }

    const limits = isPremium ? commandLimits.premium : commandLimits.nonPremium;
    const applicableLimit = limits?.limit; // Store the specific limit value
    const windowMinutes = limits?.windowMinutes;

    // Case 1: No limits defined or limit is negative (unlimited)
    if (!limits || applicableLimit < 0) {
      return { status: "allowed", isPremium, limit: -1 }; // Indicate unlimited
    }

    // Case 2: Command explicitly disabled (limit is 0)
    if (applicableLimit === 0) {
      logger.info(`[checkRateLimit] Command '${commandName}' is disabled (limit 0). User: ${userId}`);
      return {
        status: "disabled",
        message: `❌ Desculpe, o comando \`${commandName}\` está temporariamente desativado.`,
        isPremium,
        limit: 0,
      };
    }

    // Case 3: Rate limiting applies (limit > 0)
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
      currentCount = usageData[0].usage_count_window || 0; // Ensure it's a number
      windowStart = usageData[0].window_start_timestamp ? moment(usageData[0].window_start_timestamp) : null;
    }

    // Check if window expired or doesn't exist
    if (!windowStart || now.diff(windowStart) > windowMillis) {
      // Start new window
      const upsertQuery = `
        INSERT INTO command_usage (user_id, command_name, usage_count_window, window_start_timestamp, last_used_timestamp)
        VALUES (?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE
          usage_count_window = 1,
          window_start_timestamp = VALUES(window_start_timestamp),
          last_used_timestamp = VALUES(last_used_timestamp)
      `;
      await runQuery(upsertQuery, [userId, commandName, now.toDate(), now.toDate()]);
      logger.info(`[checkRateLimit] User ${userId} used ${commandName}. Count reset/started. (Limit: ${applicableLimit}/${windowMinutes}m, Premium: ${isPremium})`);
      // Return count *before* this execution (which was 0 in the new/reset window)
      return { status: "allowed", isPremium, currentCount: 0, limit: applicableLimit };
    } else {
      // Within existing window
      if (currentCount >= applicableLimit) {
        // Rate limited
        const remainingMillis = windowMillis - now.diff(windowStart);
        const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
        const message = `⚠️ *Limite de Uso Atingido* ⚠️

Olá! Detectamos que você utilizou o comando \`!${commandName}\` ${currentCount} vezes ${isPremium ? "(Usuário Premium)" : ""}, atingindo assim o limite permitido de *${applicableLimit} uso(s)* dentro do período de *${windowMinutes} minuto(s)*.

⏳ Para garantir estabilidade, segurança e uma boa experiência para todos os usuários, impomos essa limitação temporária. Você poderá utilizar este comando novamente em aproximadamente *${remainingMinutes} minuto(s)*.

💎 *Quer mais liberdade?* Usuários Premium possuem limites ampliados, acesso prioritário, comandos exclusivos e suporte personalizado. Se você deseja continuar utilizando sem restrições ou tem interesse em planos personalizados com recursos adicionais, entre em contato com o desenvolvedor!

📞 *Fale com o desenvolvedor:* Converse com *Kaiky Brito* diretamente no WhatsApp pelo link:
👉 https://wa.me/message/C4CZHIMQU66PD1

Agradecemos pela compreensão e pelo uso do nosso serviço. 🚀`;

        logger.warn(`[checkRateLimit] User ${userId} rate limited for ${commandName}. Count: ${currentCount}/${applicableLimit} (Premium: ${isPremium})`);
        return { status: "rate_limited", message: message, isPremium, currentCount, limit: applicableLimit };
      } else {
        // Allowed, increment count
        const updateQuery = `
          UPDATE command_usage
          SET usage_count_window = usage_count_window + 1, last_used_timestamp = ?
          WHERE user_id = ? AND command_name = ?
        `;
        await runQuery(updateQuery, [now.toDate(), userId, commandName]);
        logger.info(`[checkRateLimit] User ${userId} used ${commandName}. Count: ${currentCount + 1}/${applicableLimit} (Limit: ${applicableLimit}/${windowMinutes}m, Premium: ${isPremium})`);
        // Return count *before* incrementing
        return { status: "allowed", isPremium, currentCount, limit: applicableLimit };
      }
    }
  } catch (error) {
    logger.error(`[checkRateLimit] Error checking rate limit for user ${userId}, command ${commandName}:`, error);
    // Return error status, include isPremium if determined before error
    return {
      status: "error",
      message: "❌ Ocorreu um erro interno ao verificar seus limites de uso. Tente novamente mais tarde.",
      isPremium: isPremium, // Include premium status determined before the error
    };
  }
}

module.exports = {
  checkRateLimit,
  isUserPremium,
};
