/**
 * @fileoverview Funções para gerenciar as configurações de boas-vindas e saída
 *               de grupos no banco de dados. Permite ativar/desativar as mensagens,
 *               definir textos personalizados e URLs de mídia.
 * @requires ../../../utils/logger - Módulo de logging.
 * @requires ../../../database/processDatabase - Funções para interagir com o banco de dados.
 */

const logger = require("../../../utils/logger");
const { runQuery } = require("../../../database/processDatabase");

const GROUPS_TABLE_NAME = "groups";
const MAX_MESSAGE_LENGTH = 4000; // Limite de caracteres para mensagens (exemplo)
const MAX_URL_LENGTH = 2048; // Limite de caracteres para URLs (exemplo)

// --- Funções Auxiliares ---

/**
 * Valida se o groupId fornecido é uma string não vazia.
 * Lança um erro e registra no log se for inválido.
 * @param {string} groupId - O ID do grupo a ser validado.
 * @param {string} context - O nome da função chamadora para contexto de log.
 * @throws {Error} Se o groupId for inválido.
 */
const validateGroupId = (groupId, context) => {
  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    const msg = `[${context}] ID do grupo inválido fornecido: '${groupId}'`;
    logger.error(msg);
    throw new Error(msg);
  }
};

/**
 * Executa uma query UPDATE, verifica as linhas afetadas e registra resultados/erros no log.
 * @param {object} options - Opções para a operação de atualização.
 * @param {string} options.query - A string da query SQL.
 * @param {Array<any>} options.params - Parâmetros para a query SQL.
 * @param {string} options.groupId - O ID do grupo que está sendo atualizado.
 * @param {string} options.action - Uma string identificando a ação (ex: "setWelcomeStatus") para o log.
 * @returns {Promise<object>} O objeto de resultado de runQuery.
 * @throws {Error} Se a consulta ao banco de dados falhar.
 */
const executeUpdate = async ({ query, params, groupId, action }) => {
  logger.info(`[${action}] Tentando atualização para ${groupId}. Parâmetros: ${JSON.stringify(params)}`);
  try {
    const result = await runQuery(query, params);
    if (result && (result.affectedRows === 0 || result.rowCount === 0)) {
      // Tenta buscar o grupo para saber se ele existe ou se o valor já era o mesmo
      const checkQuery = `SELECT id FROM \`${GROUPS_TABLE_NAME}\` WHERE id = ? LIMIT 1`;
      const checkResult = await runQuery(checkQuery, [groupId]);
      if (checkResult.length === 0) {
        logger.warn(`[${action}] Grupo ${groupId} não encontrado no banco de dados. Nenhuma linha afetada.`);
        throw new Error(`[${action}] Grupo ${groupId} não encontrado.`);
      } else {
        logger.warn(`[${action}] Grupo ${groupId} encontrado, mas o valor pode já ser o mesmo. Nenhuma linha afetada.`);
      }
    } else {
      logger.info(`[${action}] Atualização para ${groupId} realizada com sucesso.`);
    }
    return result;
  } catch (error) {
    logger.error(`[${action}] Erro na atualização para ${groupId}: ${error.message}`, {
      stack: error.stack,
      query,
      params,
    });
    throw error;
  }
};

/**
 * Função auxiliar genérica para definir um campo específico na tabela de grupos.
 * @param {string} groupId - O ID do grupo.
 * @param {string} fieldName - O nome da coluna a ser atualizada.
 * @param {any} value - O valor a ser definido para o campo.
 * @param {string} action - String de identificação da ação para logs.
 * @returns {Promise<void>}
 * @throws {Error} Se a validação do groupId ou a atualização do banco de dados falhar.
 */
const setGroupField = async (groupId, fieldName, value, action) => {
  validateGroupId(groupId, action); // Garante que o ID do grupo é válido

  // Validação básica do nome do campo (evita SQL injection se fieldName viesse de input externo)
  // Neste caso, fieldName é definido internamente, então é seguro.
  if (!fieldName || typeof fieldName !== "string" || !/^[a-zA-Z0-9_]+$/.test(fieldName)) {
    const errorMsg = `[${action}] Nome de campo inválido fornecido para setGroupField: ${fieldName}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const query = `UPDATE \`${GROUPS_TABLE_NAME}\` SET \`${fieldName}\` = ? WHERE \`id\` = ?`;
  const params = [value, groupId]; // O valor já deve vir preparado pela função chamadora
  await executeUpdate({ query, params, groupId, action });
};

// --- Funções Principais ---

/**
 * Define o status da mensagem de boas-vindas (ativado/desativado) para um grupo.
 * (Mantida separada por lidar com booleano -> inteiro)
 * @param {string} groupId - O ID do grupo.
 * @param {boolean} enabled - True para ativar, false para desativar.
 * @returns {Promise<void>}
 * @throws {Error} Se a validação ou atualização do banco de dados falhar.
 */
const setWelcomeStatus = async (groupId, enabled) => {
  const action = "setWelcomeStatus";
  validateGroupId(groupId, action);

  if (typeof enabled !== "boolean") {
    const errorMsg = `[${action}] Parâmetro 'enabled' deve ser booleano para ${groupId}, recebido: ${typeof enabled}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const newState = enabled ? 1 : 0;
  const query = `UPDATE \`${GROUPS_TABLE_NAME}\` SET \`is_welcome\` = ? WHERE \`id\` = ?`;
  const params = [newState, groupId];

  await executeUpdate({ query, params, groupId, action });
};

/**
 * Define a mensagem de boas-vindas personalizada para um grupo.
 * @param {string} groupId - O ID do grupo.
 * @param {string | null} message - O modelo da mensagem de boas-vindas, ou null para limpar.
 * @returns {Promise<void>}
 * @throws {Error} Se a validação ou atualização do banco de dados falhar.
 */
const setWelcomeMessage = async (groupId, message) => {
  const action = "setWelcomeMessage";

  // Validação específica do valor 'message'
  if (message !== null && typeof message !== "string") {
    const errorMsg = `[${action}] Mensagem inválida para ${groupId}: deve ser uma string ou null. Recebido: ${typeof message}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (message && message.length > MAX_MESSAGE_LENGTH) {
    const errorMsg = `[${action}] Mensagem muito longa para ${groupId} (${message.length} caracteres). Limite: ${MAX_MESSAGE_LENGTH}.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Prepara o valor para o banco de dados
  const messageToSet = message === null ? null : String(message);

  // Chama a função genérica
  await setGroupField(groupId, "welcome_message", messageToSet, action);
};

/**
 * Define a URL de mídia de boas-vindas personalizada para um grupo.
 * @param {string} groupId - O ID do grupo.
 * @param {string | null} mediaUrl - A URL da mídia, ou null/vazio para limpar.
 * @returns {Promise<void>}
 * @throws {Error} Se a validação ou atualização do banco de dados falhar.
 */
const setWelcomeMedia = async (groupId, mediaUrl) => {
  const action = "setWelcomeMedia";

  // Validação específica do valor 'mediaUrl'
  if (mediaUrl !== null && typeof mediaUrl !== "string") {
    const errorMsg = `[${action}] URL de mídia inválida para ${groupId}: deve ser uma string ou null. Recebido: ${typeof mediaUrl}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (mediaUrl && mediaUrl.length > MAX_URL_LENGTH) {
    const errorMsg = `[${action}] URL de mídia muito longa para ${groupId} (${mediaUrl.length} caracteres). Limite: ${MAX_URL_LENGTH}.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  // Nota: A validação de formato de URL (http/https) é feita em welcomeCommands.js

  // Prepara o valor para o banco de dados (define como NULL se vazio/null/undefined)
  const urlToSet = mediaUrl && String(mediaUrl).trim() !== "" ? String(mediaUrl).trim() : null;

  // Chama a função genérica
  await setGroupField(groupId, "welcome_media", urlToSet, action);
};

/**
 * Define a mensagem de saída personalizada para um grupo.
 * @param {string} groupId - O ID do grupo.
 * @param {string | null} message - O modelo da mensagem de saída, ou null para limpar.
 * @returns {Promise<void>}
 * @throws {Error} Se a validação ou atualização do banco de dados falhar.
 */
const setExitMessage = async (groupId, message) => {
  const action = "setExitMessage";

  // Validação específica do valor 'message'
  if (message !== null && typeof message !== "string") {
    const errorMsg = `[${action}] Mensagem inválida para ${groupId}: deve ser uma string ou null. Recebido: ${typeof message}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (message && message.length > MAX_MESSAGE_LENGTH) {
    const errorMsg = `[${action}] Mensagem muito longa para ${groupId} (${message.length} caracteres). Limite: ${MAX_MESSAGE_LENGTH}.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Prepara o valor para o banco de dados
  const messageToSet = message === null ? null : String(message);

  // Chama a função genérica
  await setGroupField(groupId, "exit_message", messageToSet, action);
};

/**
 * Define a URL de mídia de saída personalizada para um grupo.
 * @param {string} groupId - O ID do grupo.
 * @param {string | null} mediaUrl - A URL da mídia, ou null/vazio para limpar.
 * @returns {Promise<void>}
 * @throws {Error} Se a validação ou atualização do banco de dados falhar.
 */
const setExitMedia = async (groupId, mediaUrl) => {
  const action = "setExitMedia";

  // Validação específica do valor 'mediaUrl'
  if (mediaUrl !== null && typeof mediaUrl !== "string") {
    const errorMsg = `[${action}] URL de mídia inválida para ${groupId}: deve ser uma string ou null. Recebido: ${typeof mediaUrl}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (mediaUrl && mediaUrl.length > MAX_URL_LENGTH) {
    const errorMsg = `[${action}] URL de mídia muito longa para ${groupId} (${mediaUrl.length} caracteres). Limite: ${MAX_URL_LENGTH}.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  // Nota: A validação de formato de URL (http/https) é feita em welcomeCommands.js

  // Prepara o valor para o banco de dados (define como NULL se vazio/null/undefined)
  const urlToSet = mediaUrl && String(mediaUrl).trim() !== "" ? String(mediaUrl).trim() : null;

  // Chama a função genérica
  await setGroupField(groupId, "exit_media", urlToSet, action);
};

/**
 * Exporta as funções para serem utilizadas em outros módulos.
 */
module.exports = {
  setWelcomeStatus,
  setWelcomeMessage,
  setWelcomeMedia,
  setExitMessage,
  setExitMedia,
};
