const logger = require('../utils/logger');
const { runQuery } = require('../database/processDatabase');
const config = require('../config/options.json');
const moment = require('moment-timezone');

// --- Constantes ---
const USERS_TABLE = 'users';
const COMMAND_USAGE_TABLE = 'command_usage';

const STATUS_ALLOWED = 'allowed';
const STATUS_DISABLED = 'disabled';
const STATUS_RATE_LIMITED = 'rate_limited';
const STATUS_ERROR = 'error';

/**
 * Verifica se um usuário possui status premium ativo.
 * Também lida com a expiração automática do status premium temporário.
 * @async
 * @function isUserPremium
 * @param {string} userId - O JID (identificador) do usuário no formato 'numero@s.whatsapp.net'.
 * @returns {Promise<boolean>} Retorna `true` se o usuário for premium e o status estiver válido, `false` caso contrário.
 * @throws {Error} Lança um erro se ocorrer um problema na consulta ao banco de dados.
 */
async function isUserPremium(userId) {
  if (!userId) return false;
  try {
    const query = `SELECT isPremium, premiumTemp FROM ${USERS_TABLE} WHERE sender = ?`;
    const results = await runQuery(query, [userId]);

    if (results.length === 0) {
      return false;
    }

    const user = results[0];
    const isCurrentlyPremium = user.isPremium === 1;

    if (isCurrentlyPremium && user.premiumTemp && moment(user.premiumTemp).isBefore(moment())) {
      // Premium temporário expirou, atualiza o banco de dados
      logger.info(
        `[isUserPremium] Status premium expirado para ${userId}. Atualizando banco de dados.`,
      );
      try {
        const updateQuery = `UPDATE ${USERS_TABLE} SET isPremium = 0, premiumTemp = NULL WHERE sender = ?`;
        await runQuery(updateQuery, [userId]);
        logger.info(`[isUserPremium] Status premium removido para ${userId} após expiração.`);
      } catch (updateError) {
        logger.error(
          `[isUserPremium] Falha ao atualizar status premium expirado para ${userId}:`,
          updateError,
        );
      }
      return false;
    }

    const hasValidExpiry = !user.premiumTemp || moment(user.premiumTemp).isAfter(moment());
    // Retorna true apenas se for premium (isPremium=1) E (não tiver data de expiração OU a data de expiração for futura)
    return isCurrentlyPremium && hasValidExpiry;
  } catch (error) {
    logger.error(`[isUserPremium] Erro ao verificar status premium para ${userId}:`, error);
    return false;
  }
}

/**
 * Verifica se um usuário excedeu o limite de uso para um comando específico.
 * Atualiza a contagem de uso no banco de dados se o uso for permitido.
 * @async
 * @function checkRateLimit
 * @param {string} userId - O JID do usuário.
 * @param {string} commandName - O nome do comando sendo executado (ex: 'menu', 'sticker').
 * @returns {Promise<object>} Um objeto indicando o resultado da verificação.
 *   - `{ status: 'allowed', isPremium: boolean, limit: number, currentCount: number }`: Uso permitido.
 *   - `{ status: 'disabled', message: string, isPremium: boolean, limit: 0 }`: Comando desativado.
 *   - `{ status: 'rate_limited', message: string, isPremium: boolean, limit: number, currentCount: number }`: Limite atingido.
 *   - `{ status: 'error', message: string, isPremium: boolean }`: Erro interno durante a verificação.
 * @throws {Error} Lança um erro se ocorrer um problema na consulta ao banco de dados (não capturado internamente).
 */
async function checkRateLimit(userId, commandName) {
  let isPremium = false;
  try {
    // 1. Verifica o status premium do usuário
    isPremium = await isUserPremium(userId);

    // 2. Obtém as configurações de limite para o comando (ou o padrão)
    const commandLimits = config.commandLimits?.[commandName] || config.commandLimits?.default;

    if (!commandLimits) {
      logger.warn(
        `[checkRateLimit] Nenhuma configuração de limite encontrada para '${commandName}' ou padrão. Permitindo uso.`,
      );
      return { status: STATUS_ALLOWED, isPremium, limit: -1, currentCount: 0 }; // Retorna -1 para indicar sem limite configurado
    }

    // 3. Determina os limites aplicáveis (premium vs nonPremium)
    const limits = isPremium ? commandLimits.premium : commandLimits.nonPremium;

    // Se não houver configuração específica para o tipo de usuário (premium/nonPremium)
    if (!limits) {
      logger.warn(
        `[checkRateLimit] Nenhuma configuração de limite ${
          isPremium ? 'premium' : 'nonPremium'
        } encontrada para '${commandName}'. Permitindo uso.`,
      );
      return { status: STATUS_ALLOWED, isPremium, limit: -1, currentCount: 0 };
    }

    const applicableLimit = limits?.limit;
    const windowMinutes = limits?.windowMinutes;

    if (!limits || applicableLimit < 0) {
      return { status: 'allowed', isPremium, limit: -1 };
    }
    // 4. Verifica se o comando está desabilitado (limite 0)
    if (applicableLimit === 0) {
      logger.info(
        `[checkRateLimit] Comando '${commandName}' está desativado (limite 0). Usuário: ${userId}`,
      );
      return {
        status: STATUS_DISABLED,
        status: 'disabled',
        message: `❌ Desculpe, o comando \`${commandName}\` está temporariamente desativado.`,
        isPremium,
        limit: 0,
      };
    }

    // 5. Prepara dados para consulta de uso
    const now = moment();
    const windowMillis = windowMinutes * 60 * 1000;

    const selectQuery = `
      SELECT usage_count_window, window_start_timestamp FROM ${COMMAND_USAGE_TABLE}
      WHERE user_id = ? AND command_name = ? LIMIT 1
    `;
    const usageData = await runQuery(selectQuery, [userId, commandName]);

    let currentCount = 0;
    let windowStart = null;

    if (usageData.length > 0) {
      // Dados de uso anteriores encontrados
      currentCount = usageData[0].usage_count_window || 0;
      windowStart = usageData[0].window_start_timestamp
        ? moment(usageData[0].window_start_timestamp)
        : null;
    }

    if (!windowStart || now.diff(windowStart) > windowMillis) {
      // 6a. Janela de tempo expirou ou é o primeiro uso na janela
      const upsertQuery = `
        INSERT INTO ${COMMAND_USAGE_TABLE} (user_id, command_name, usage_count_window, window_start_timestamp, last_used_timestamp)
        VALUES (?, ?, 1, ?, ?) -- Começa/reseta contagem para 1
        ON DUPLICATE KEY UPDATE
          usage_count_window = 1,
          window_start_timestamp = VALUES(window_start_timestamp),
          last_used_timestamp = VALUES(last_used_timestamp)
      `;
      await runQuery(upsertQuery, [userId, commandName, now.toDate(), now.toDate()]);
      logger.info(
        `[checkRateLimit] Usuário ${userId} usou ${commandName}. Contagem iniciada/resetada. (Limite: ${applicableLimit}/${windowMinutes}m, Premium: ${isPremium})`,
      );
      // Retorna 0 como currentCount porque este é o *primeiro* uso na *nova* janela
      return { status: STATUS_ALLOWED, isPremium, currentCount: 0, limit: applicableLimit };
    } else {
      // 6b. Dentro da janela de tempo ativa
      if (currentCount >= applicableLimit) {
        // Limite atingido
        const remainingMillis = windowMillis - now.diff(windowStart);
        const remainingMinutes = Math.max(1, Math.ceil(remainingMillis / (60 * 1000))); // Garante pelo menos 1 minuto
        const message = `⚠️ *Limite de Uso Atingido* ⚠️

Olá! Detectamos que você utilizou o comando \`.${commandName}\` ${currentCount} vezes ${
          isPremium ? '(Usuário Premium)' : ''
        }, atingindo assim o limite permitido de *${applicableLimit} uso(s)* dentro do período de *${windowMinutes} minuto(s)*.

⏳ Para garantir estabilidade, segurança e uma boa experiência para todos os usuários, impomos essa limitação temporária. Você poderá utilizar este comando novamente em aproximadamente *${remainingMinutes} minuto(s)*.

💎 *Quer mais liberdade?* Usuários Premium possuem limites ampliados, acesso prioritário, comandos exclusivos e suporte personalizado. Se você deseja continuar utilizando sem restrições ou tem interesse em planos personalizados com recursos adicionais, entre em contato com o desenvolvedor!

📞 *Fale com o desenvolvedor:* Converse com *Kaiky Brito* diretamente pelo link:
👉 https://bit.ly/m/Kaally

Agradecemos pela compreensão e pelo uso do nosso serviço. 🚀`;
        logger.warn(
          `[checkRateLimit] Usuário ${userId} atingiu o limite para ${commandName}. Contagem: ${currentCount}/${applicableLimit} (Premium: ${isPremium})`,
        );
        // Retorna o estado atual antes do incremento que seria bloqueado
        return {
          status: 'rate_limited',
          message: message,
          isPremium,
          currentCount,
          limit: applicableLimit,
        };
      } else {
        // Ainda há usos permitidos na janela
        const updateQuery = `
          UPDATE ${COMMAND_USAGE_TABLE}
          SET usage_count_window = usage_count_window + 1, last_used_timestamp = ?
          WHERE user_id = ? AND command_name = ?
        `;
        await runQuery(updateQuery, [now.toDate(), userId, commandName]);
        logger.info(
          `[checkRateLimit] Usuário ${userId} usou ${commandName}. Contagem: ${
            currentCount + 1
          }/${applicableLimit} (Limite: ${applicableLimit}/${windowMinutes}m, Premium: ${isPremium})`,
        );
        // Retorna o estado *antes* do incremento atual
        return { status: STATUS_ALLOWED, isPremium, currentCount, limit: applicableLimit };
      }
    }
  } catch (error) {
    // 7. Tratamento de erro geral
    logger.error(
      `[checkRateLimit] Erro ao verificar limite de uso para usuário ${userId}, comando ${commandName}:`,
      error,
    );
    // Retorna um status de erro genérico para o usuário
    return {
      status: 'error',
      message:
        '❌ Ocorreu um erro interno ao verificar seus limites de uso. Tente novamente mais tarde.',
      isPremium: isPremium,
    };
  }
}

module.exports = {
  checkRateLimit,
  isUserPremium,
};
