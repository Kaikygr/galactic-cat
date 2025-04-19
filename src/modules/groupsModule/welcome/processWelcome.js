/**
 * @fileoverview Funções para gerenciar as configurações de boas-vindas e saída
 *               de grupos no banco de dados. Permite ativar/desativar as mensagens,
 *               definir textos personalizados e URLs de mídia.
 * @requires ../utils/logger - Módulo de logging (ajuste o caminho conforme necessário).
 * @requires ../database/processDatabase - Funções para interagir com o banco de dados (ajuste o caminho conforme necessário).
 */

const logger = require("../../../utils/logger"); // Ajuste o caminho se necessário
const { runQuery } = require("../../../database/processDatabase"); // Ajuste o caminho se necessário

// Nome da tabela de grupos no banco de dados.
const GROUPS_TABLE_NAME = "groups";

/**
 * Ativa ou desativa as mensagens de boas-vindas e saída para um grupo específico.
 * Atualiza a coluna `is_welcome` no banco de dados.
 *
 * @async
 * @function setWelcomeStatus
 * @param {string} groupId - O JID (ID) do grupo a ser modificado.
 * @param {boolean} enabled - `true` para ativar, `false` para desativar.
 * @returns {Promise<void>} Resolve em caso de sucesso, rejeita em caso de erro no banco de dados.
 * @throws {Error} Se o `groupId` for inválido ou se ocorrer um erro durante a atualização no banco de dados.
 */
const setWelcomeStatus = async (groupId, enabled) => {
  // Validação básica do ID do grupo
  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    const errorMsg = "[setWelcomeStatus] ID do grupo inválido fornecido.";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  // Validação do tipo do parâmetro 'enabled'
  if (typeof enabled !== "boolean") {
    const errorMsg = `[setWelcomeStatus] Parâmetro 'enabled' deve ser booleano, recebido: ${typeof enabled}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Converte o booleano para o formato do banco (1 para true, 0 para false)
  const newState = enabled ? 1 : 0;
  const query = `UPDATE \`${GROUPS_TABLE_NAME}\` SET \`is_welcome\` = ? WHERE \`id\` = ?`;
  const params = [newState, groupId];

  logger.info(`[setWelcomeStatus] Tentando atualizar status de boas-vindas para ${groupId}: ${enabled ? "ATIVADO" : "DESATIVADO"}`);

  try {
    // Executa a query de atualização
    const result = await runQuery(query, params);

    // Verifica se alguma linha foi realmente afetada (indica que o grupo existe)
    // A propriedade exata pode variar (affectedRows, rowCount), ajuste se necessário
    if (result && (result.affectedRows === 0 || result.rowCount === 0)) {
      logger.warn(`[setWelcomeStatus] Grupo ${groupId} não encontrado ou status já era ${newState}. Nenhuma linha afetada.`);
      // Você pode optar por lançar um erro aqui se o grupo *deveria* existir
      // throw new Error(`Grupo ${groupId} não encontrado.`);
    } else {
      logger.info(`[setWelcomeStatus] Status de boas-vindas para ${groupId} atualizado com sucesso.`);
    }
  } catch (error) {
    logger.error(`[setWelcomeStatus] Erro ao atualizar status de boas-vindas para ${groupId}: ${error.message}`, { stack: error.stack, query, params });
    // Relança o erro para que a chamada da função possa tratá-lo
    throw error;
  }
};

/**
 * Define a mensagem de boas-vindas personalizada para um grupo específico.
 * Atualiza a coluna `welcome_message` no banco de dados.
 *
 * @async
 * @function setWelcomeMessage
 * @param {string} groupId - O JID (ID) do grupo a ser modificado.
 * @param {string | null} message - O novo template da mensagem de boas-vindas. Use placeholders como {user}, {groupName}, etc. Passar `null` ou string vazia pode limpar a mensagem (depende da sua lógica de uso, aqui definimos como string vazia).
 * @returns {Promise<void>} Resolve em caso de sucesso, rejeita em caso de erro no banco de dados.
 * @throws {Error} Se o `groupId` for inválido ou se ocorrer um erro durante a atualização no banco de dados.
 */
const setWelcomeMessage = async (groupId, message) => {
  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    const errorMsg = "[setWelcomeMessage] ID do grupo inválido fornecido.";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Garante que o valor seja uma string (mesmo que vazia se for null/undefined)
  const messageToSet = message == null ? "" : String(message);
  const query = `UPDATE \`${GROUPS_TABLE_NAME}\` SET \`welcome_message\` = ? WHERE \`id\` = ?`;
  const params = [messageToSet, groupId];

  logger.info(`[setWelcomeMessage] Tentando atualizar mensagem de boas-vindas para ${groupId}.`);

  try {
    const result = await runQuery(query, params);
    if (result && (result.affectedRows === 0 || result.rowCount === 0)) {
      logger.warn(`[setWelcomeMessage] Grupo ${groupId} não encontrado ou mensagem já era a mesma. Nenhuma linha afetada.`);
      // throw new Error(`Grupo ${groupId} não encontrado.`);
    } else {
      logger.info(`[setWelcomeMessage] Mensagem de boas-vindas para ${groupId} atualizada com sucesso.`);
    }
  } catch (error) {
    logger.error(`[setWelcomeMessage] Erro ao atualizar mensagem de boas-vindas para ${groupId}: ${error.message}`, { stack: error.stack, query, params });
    throw error;
  }
};

/**
 * Define a URL da mídia de boas-vindas para um grupo específico.
 * Atualiza a coluna `welcome_media` no banco de dados.
 * Se a URL for vazia, nula ou indefinida, define a coluna como NULL no banco.
 *
 * @async
 * @function setWelcomeMedia
 * @param {string} groupId - O JID (ID) do grupo a ser modificado.
 * @param {string | null | undefined} mediaUrl - A URL da imagem/vídeo a ser enviada na boas-vindas, ou null/vazio para remover.
 * @returns {Promise<void>} Resolve em caso de sucesso, rejeita em caso de erro no banco de dados.
 * @throws {Error} Se o `groupId` for inválido ou se ocorrer um erro durante a atualização no banco de dados.
 */
const setWelcomeMedia = async (groupId, mediaUrl) => {
  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    const errorMsg = "[setWelcomeMedia] ID do grupo inválido fornecido.";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Define como NULL se a URL for vazia, nula ou indefinida, caso contrário, usa a string.
  const urlToSet = mediaUrl && String(mediaUrl).trim() !== "" ? String(mediaUrl).trim() : null;
  const query = `UPDATE \`${GROUPS_TABLE_NAME}\` SET \`welcome_media\` = ? WHERE \`id\` = ?`;
  const params = [urlToSet, groupId];

  logger.info(`[setWelcomeMedia] Tentando atualizar mídia de boas-vindas para ${groupId}: ${urlToSet ? urlToSet : "NENHUMA"}`);

  try {
    const result = await runQuery(query, params);
    if (result && (result.affectedRows === 0 || result.rowCount === 0)) {
      logger.warn(`[setWelcomeMedia] Grupo ${groupId} não encontrado ou mídia já era a mesma. Nenhuma linha afetada.`);
      // throw new Error(`Grupo ${groupId} não encontrado.`);
    } else {
      logger.info(`[setWelcomeMedia] Mídia de boas-vindas para ${groupId} atualizada com sucesso.`);
    }
  } catch (error) {
    logger.error(`[setWelcomeMedia] Erro ao atualizar mídia de boas-vindas para ${groupId}: ${error.message}`, { stack: error.stack, query, params });
    throw error;
  }
};

/**
 * Define a mensagem de saída personalizada para um grupo específico.
 * Atualiza a coluna `exit_message` no banco de dados.
 *
 * @async
 * @function setExitMessage
 * @param {string} groupId - O JID (ID) do grupo a ser modificado.
 * @param {string | null} message - O novo template da mensagem de saída. Use placeholders como {user}, {groupName}, etc. Passar `null` ou string vazia pode limpar a mensagem.
 * @returns {Promise<void>} Resolve em caso de sucesso, rejeita em caso de erro no banco de dados.
 * @throws {Error} Se o `groupId` for inválido ou se ocorrer um erro durante a atualização no banco de dados.
 */
const setExitMessage = async (groupId, message) => {
  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    const errorMsg = "[setExitMessage] ID do grupo inválido fornecido.";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const messageToSet = message == null ? "" : String(message);
  const query = `UPDATE \`${GROUPS_TABLE_NAME}\` SET \`exit_message\` = ? WHERE \`id\` = ?`;
  const params = [messageToSet, groupId];

  logger.info(`[setExitMessage] Tentando atualizar mensagem de saída para ${groupId}.`);

  try {
    const result = await runQuery(query, params);
    if (result && (result.affectedRows === 0 || result.rowCount === 0)) {
      logger.warn(`[setExitMessage] Grupo ${groupId} não encontrado ou mensagem já era a mesma. Nenhuma linha afetada.`);
      // throw new Error(`Grupo ${groupId} não encontrado.`);
    } else {
      logger.info(`[setExitMessage] Mensagem de saída para ${groupId} atualizada com sucesso.`);
    }
  } catch (error) {
    logger.error(`[setExitMessage] Erro ao atualizar mensagem de saída para ${groupId}: ${error.message}`, { stack: error.stack, query, params });
    throw error;
  }
};

/**
 * Define a URL da mídia de saída para um grupo específico.
 * Atualiza a coluna `exit_media` no banco de dados.
 * Se a URL for vazia, nula ou indefinida, define a coluna como NULL no banco.
 *
 * @async
 * @function setExitMedia
 * @param {string} groupId - O JID (ID) do grupo a ser modificado.
 * @param {string | null | undefined} mediaUrl - A URL da imagem/vídeo a ser enviada na saída, ou null/vazio para remover.
 * @returns {Promise<void>} Resolve em caso de sucesso, rejeita em caso de erro no banco de dados.
 * @throws {Error} Se o `groupId` for inválido ou se ocorrer um erro durante a atualização no banco de dados.
 */
const setExitMedia = async (groupId, mediaUrl) => {
  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    const errorMsg = "[setExitMedia] ID do grupo inválido fornecido.";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const urlToSet = mediaUrl && String(mediaUrl).trim() !== "" ? String(mediaUrl).trim() : null;
  const query = `UPDATE \`${GROUPS_TABLE_NAME}\` SET \`exit_media\` = ? WHERE \`id\` = ?`;
  const params = [urlToSet, groupId];

  logger.info(`[setExitMedia] Tentando atualizar mídia de saída para ${groupId}: ${urlToSet ? urlToSet : "NENHUMA"}`);

  try {
    const result = await runQuery(query, params);
    if (result && (result.affectedRows === 0 || result.rowCount === 0)) {
      logger.warn(`[setExitMedia] Grupo ${groupId} não encontrado ou mídia já era a mesma. Nenhuma linha afetada.`);
      // throw new Error(`Grupo ${groupId} não encontrado.`);
    } else {
      logger.info(`[setExitMedia] Mídia de saída para ${groupId} atualizada com sucesso.`);
    }
  } catch (error) {
    logger.error(`[setExitMedia] Erro ao atualizar mídia de saída para ${groupId}: ${error.message}`, { stack: error.stack, query, params });
    throw error;
  }
};

/**
 * Exporta as funções para serem utilizadas em outros módulos (ex: comandos do bot).
 * @module groupSettingsController
 */
module.exports = {
  /**
   * @see setWelcomeStatus
   */
  setWelcomeStatus,
  /**
   * @see setWelcomeMessage
   */
  setWelcomeMessage,
  /**
   * @see setWelcomeMedia
   */
  setWelcomeMedia,
  /**
   * @see setExitMessage
   */
  setExitMessage,
  /**
   * @see setExitMedia
   */
  setExitMedia,
};
