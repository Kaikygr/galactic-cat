/**
 * @fileoverview Controller para gerenciar eventos de participantes em grupos do WhatsApp.
 * Este módulo lida com ações como entrada, saída, promoção e remoção de membros,
 * enviando mensagens personalizadas com base nas configurações do grupo.
 */

const logger = require('../utils/logger');
const { runQuery } = require('../database/processDatabase');
const axios = require('axios');
const path = require('path');
const config = require(path.join(__dirname, '../config/options.json'));

/** @constant {string} Nome da tabela de grupos no banco de dados. */
const GROUPS_TABLE_NAME = 'groups';

// Carrega os defaults do arquivo de configuração, com fallbacks internos para segurança
const groupDataDefaults = config.defaults?.groupData;
/** @constant {string} Mensagem padrão de boas-vindas. */
const DEFAULT_WELCOME_MESSAGE = groupDataDefaults?.welcomeMessage || 'Bem-vindo(a) ao {groupName}, {user}! 🎉';
/** @constant {string} Mensagem padrão de saída. */
const DEFAULT_EXIT_MESSAGE = groupDataDefaults?.exitMessage || 'Até mais, {user}! Sentiremos sua falta. 👋';
/** @constant {number} Estado padrão para a ativação de mensagens de boas-vindas (0 = desativado, 1 =ivado). */
const DEFAULT_IS_WELCOME_ENABLED = groupDataDefaults?.isWelcome ?? 0;
/** @constant {string|null} URL padrão para mídia de boas-vindas. */
const DEFAULT_WELCOME_MEDIA = groupDataDefaults?.welcomeMedia || null;
/** @constant {string|null} URL padrão para mídia de saída. */
const DEFAULT_EXIT_MEDIA = groupDataDefaults?.exitMedia || null;

/**
 * @constant {object} Enumeração para ações de participantes.
 * @property {string} ADD - Ação de adicionar participante.
 * @property {string} REMOVE - Ação de remover participante.
 * @property {string} PROMOTE - Ação de promover participante.
 * @property {string} DEMOTE - Ação de rebaixar participante.
 */
const ACTIONS = {
  ADD: 'add',
  REMOVE: 'remove',
  PROMOTE: 'promote',
  DEMOTE: 'demote',
};
/** @constant {string} Valor padrão para campos nulos ou não informados. */
const DEFAULT_NULL_VALUE = 'não informado';

/**
 * Acessa de forma segura um valor aninhado em um objeto.
 * @param {object} obj - O objeto de onde o valor será extraído.
 * @param {string} path - O caminho para a propriedade desejada (ex: 'user.name.first').
 * @param {*} [defaultValue=DEFAULT_NULL_VALUE] - O valor a ser retornado se o caminho não for encontrado ou o valor for nulo/indefinido.
 * @returns {*} O valor encontrado no caminho ou o valor padrão.
 */
const safeGet = (obj, path, defaultValue = DEFAULT_NULL_VALUE) => {
  if (!obj || typeof path !== 'string') return defaultValue;

  const pathParts = path.split(/[\.\[\]]/).filter(Boolean);

  const result = pathParts.reduce((acc, key) => {
    return acc && typeof acc === 'object' && key in acc ? acc[key] : undefined;
  }, obj);

  const finalResult = result == null ? defaultValue : result;
  if (finalResult === defaultValue && result !== defaultValue) logger.debug(`[safeGet] Path '${path}' resulted in null/undefined, returning default: ${defaultValue}`);
  return finalResult;
};

/**
 * Formata um timestamp do banco de dados para uma string de data no formato 'pt-BR'.
 * @param {string|number|Date|null} timestamp - O timestamp a ser formatado.
 * @returns {string} A data formatada ou {@link DEFAULT_NULL_VALUE} em caso de erro ou entrada inválida.
 */
const formatDbTimestamp = (timestamp) => {
  if (timestamp == null) {
    logger.debug(`[ formatDbTimestamp ] Timestamp is null, returning DEFAULT_NULL_VALUE.`);
    return DEFAULT_NULL_VALUE;
  }
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return DEFAULT_NULL_VALUE;
    }
    return date.toLocaleDateString('pt-BR');
  } catch (e) {
    logger.warn(`[ formatDbTimestamp ] Erro ao formatar timestamp: ${timestamp}`, e);
    logger.debug(`[ formatDbTimestamp ] Error details: ${e.message}`, { stack: e.stack });
    return DEFAULT_NULL_VALUE;
  }
};

/**
 * Busca dados de um grupo, priorizando o banco de dados e, como fallback, a API do cliente.
 * @async
 * @param {string} groupId - O ID do grupo.
 * @param {object} client - A instância do cliente Baileys.
 * @returns {Promise<object>} Um objeto contendo os dados do grupo.
 */
async function getGroupData(groupId, client) {
  try {
    const query = `
      SELECT name, owner, created_at, description, description_id,
             subject_owner, subject_time, size, \`restrict\`, announce,
             is_community, is_community_announce, join_approval_mode,
             member_add_mode, isPremium, premiumTemp,
             is_welcome, welcome_message, welcome_media,
             exit_message, exit_media
      FROM \`${GROUPS_TABLE_NAME}\` WHERE id = ?`;
    logger.debug(`[ getGroupData ] Executing query for groupId ${groupId}: ${query.replace(/\s+/g, ' ').trim()}`);
    const result = await runQuery(query, [groupId]);
    const rows = result && result.rows ? result.rows : Array.isArray(result) ? result : [];
    logger.debug(`[ getGroupData ] Query result for ${groupId}:`, rows);

    if (rows.length > 0) {
      logger.info(`[ getGroupData ] Grupo ${groupId} encontrado no DB. Nome='${safeGet(rows[0], 'name', groupId)}', EventsEnabled=${safeGet(rows[0], 'is_welcome', 0)}`);
      return rows[0];
    }
    logger.warn(`[ getGroupData ] Grupo ${groupId} não encontrado no DB. Tentando fallback via cliente.`);
    return await fetchGroupMetadataFromClient(groupId, client, 'Fallback (Não no DB)');
  } catch (dbError) {
    logger.error(`[ getGroupData ] Erro ao buscar dados do grupo ${groupId} no DB: ${dbError.message}. Usando Fallback via cliente.`, { stack: dbError.stack });
    return await fetchGroupMetadataFromClient(groupId, client, 'Fallback (Erro DB)');
  }
}

/**
 * Busca metadados de um grupo usando a API do cliente Baileys.
 * Utilizado como fallback quando os dados não são encontrados no banco de dados ou ocorrem erros.
 * @async
 * @param {string} groupId - O ID do grupo.
 * @param {object} client - A instância do cliente Baileys.
 * @param {string} reason - Uma string descritiva do motivo da chamada (para logging).
 * @returns {Promise<object>} Um objeto contendo os metadados do grupo, podendo ser um fallback mínimo em caso de erro.
 */
async function fetchGroupMetadataFromClient(groupId, client, reason) {
  try {
    const metadata = await client.groupMetadata(groupId);
    logger.debug(`[ fetchGroupMetadataFromClient ] Raw metadata for ${groupId} from client:`, metadata);
    logger.info(`[ fetchGroupMetadataFromClient ] ${reason}: Metadados obtidos para ${groupId}. Nome='${safeGet(metadata, 'subject', groupId)}'. Eventos desativados por padrão.`);
    return {
      name: safeGet(metadata, 'subject', groupId),
      owner: safeGet(metadata, 'owner', null),
      created_at: safeGet(metadata, 'creation', null),
      description: safeGet(metadata, 'desc', null),
      size: safeGet(metadata, 'size', 0),
      is_welcome: DEFAULT_IS_WELCOME_ENABLED,
      welcome_message: DEFAULT_WELCOME_MESSAGE,
      welcome_media: DEFAULT_WELCOME_MEDIA,
      exit_message: DEFAULT_EXIT_MESSAGE,
      exit_media: DEFAULT_EXIT_MEDIA,
    };
  } catch (metadataError) {
    logger.error(`[ fetchGroupMetadataFromClient ] ${reason}: Erro ao buscar metadados para ${groupId}: ${metadataError.message}. Usando dados mínimos. Eventos desativados.`);
    return {
      name: groupId,
      owner: null,
      created_at: null,
      description: null,
      size: null,
      is_welcome: DEFAULT_IS_WELCOME_ENABLED,
      welcome_message: DEFAULT_WELCOME_MESSAGE,
      welcome_media: DEFAULT_WELCOME_MEDIA,
      exit_message: DEFAULT_EXIT_MESSAGE,
      exit_media: DEFAULT_EXIT_MEDIA,
    };
  }
}

/**
 * Busca um arquivo de mídia (imagem/vídeo) de uma URL.
 * @async
 * @param {string|null} mediaUrl - A URL da mídia a ser baixada.
 * @returns {Promise<{buffer: Buffer, mime: string}|null>} Um objeto com o buffer da mídia e o tipo MIME, ou `null` se a busca falhar ou a URL for inválida.
 */
async function fetchMedia(mediaUrl) {
  if (!mediaUrl) return null;
  logger.info(`[ fetchMedia ] Tentando buscar mídia (${mediaUrl}) via axios...`);
  logger.debug(`[ fetchMedia ] Axios GET request to: ${mediaUrl}`);
  try {
    const response = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const buffer = response.data;
    const mime = response.headers['content-type'];
    logger.debug(`[ fetchMedia ] Response status: ${response.status}, Headers:`, response.headers);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Buffer de mídia inválido ou vazio.');
    if (!mime) throw new Error('Tipo MIME não encontrado nos headers.');
    logger.info(`[ fetchMedia ] Mídia ${mediaUrl} obtida. Tipo: ${mime}, Tamanho: ${buffer.length} bytes.`);
    logger.debug(`[ fetchMedia ] Buffer (first 20 bytes as hex): ${buffer.slice(0, 20).toString('hex')}`);
    return { buffer, mime };
  } catch (mediaError) {
    let errorMsg = mediaError.message;
    if (mediaError.response) errorMsg += ` (Status: ${mediaError.response.status})`;
    else if (mediaError.request) errorMsg += ` (Sem resposta recebida)`;
    logger.error(`[ fetchMedia ] Erro ao buscar/processar mídia (${mediaUrl}): ${errorMsg}.`);
    return null;
  }
}

/**
 * Substitui placeholders em uma string de template pelos seus respectivos valores.
 * @param {string} templateString - A string de template contendo placeholders (ex: "{user}").
 * @param {object.<string, string>} replacements - Um objeto onde as chaves são os placeholders e os valores são as substituições.
 * @returns {string} A string com os placeholders substituídos.
 */
const applyReplacements = (templateString, replacements) => {
  if (!templateString) return '';
  logger.debug('[ applyReplacements ] Applying replacements. Template:', templateString, 'Replacements:', replacements);
  const regex = new RegExp(
    Object.keys(replacements)
      .map((key) => key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|'),
    'g',
  );
  const result = templateString.replace(regex, (matched) => replacements[matched] || matched);
  logger.debug('[ applyReplacements ] Result:', result);
  return result;
};

/**
 * Processa atualizações de participantes em um grupo (entrada, saída, promoção, remoção).
 * Envia mensagens personalizadas se configurado para o grupo.
 * @async
 * @param {object} event - O objeto do evento de atualização de participante do Baileys.
 * @param {string} event.id - O JID (ID do WhatsApp) do grupo.
 * @param {string} event.action - A ação realizada ('add', 'remove', 'promote', 'demote').
 * @param {string[]} event.participants - Um array com os JIDs dos participantes envolvidos na ação.
 * @param {object} client - A instância do cliente Baileys.
 * @returns {Promise<void>}
 */
const processParticipantUpdate = async (event, client) => {
  const { id: groupId, action, participants } = event;
  logger.info(`[ processParticipantUpdate ] Evento: ${groupId}. Ação: ${action}. Participantes: ${participants.join(', ')}`);
  logger.debug('[ processParticipantUpdate ] Received event object:', event);
  try {
    const groupInfo = await getGroupData(groupId, client);
    logger.debug('[ processParticipantUpdate ] Group info retrieved:', groupInfo);
    const groupDisplayName = safeGet(groupInfo, 'name', 'grupo');
    const groupDesc = safeGet(groupInfo, 'description');
    const groupOwnerJid = safeGet(groupInfo, 'owner');
    const groupOwnerNumber = groupOwnerJid !== DEFAULT_NULL_VALUE ? groupOwnerJid.split('@')[0] : DEFAULT_NULL_VALUE;
    const groupCreatedAtFormatted = formatDbTimestamp(safeGet(groupInfo, 'created_at', null));
    const groupSize = safeGet(groupInfo, 'size', DEFAULT_NULL_VALUE).toString();
    const eventMessagesEnabled = safeGet(groupInfo, 'is_welcome', 0) === 1;

    logger.debug(`[ processParticipantUpdate ] Group Details: Name='${groupDisplayName}', Desc='${groupDesc}', Owner='${groupOwnerNumber}', Created='${groupCreatedAtFormatted}', Size='${groupSize}', EventsEnabled=${eventMessagesEnabled}`);
    logger.info(`[ processParticipantUpdate ] Ação '${action}' detectada para ${groupId} (${groupDisplayName}).`);

    if (eventMessagesEnabled) {
      logger.info(`[ processParticipantUpdate ] Mensagens de evento ativadas para ${groupId}. Processando envio para ${participants.length} participante(s)...`);

      for (const participant of participants) {
        try {
          let messageOptions = {};
          let logSuffix = '';
          let captionText = '';
          let mediaUrl = null;

          const participantId = participant.split('@')[0];
          const participantMention = `@${participantId}`;

          const replacements = {
            '{groupName}': groupDisplayName,
            '{user}': participantMention,
            '{desc}': groupDesc,
            '{ownerNumber}': groupOwnerNumber,
            '{createdAt}': groupCreatedAtFormatted,
            '{size}': groupSize,
          };
          logger.debug(`[ processParticipantUpdate ] Replacements for participant ${participant}:`, replacements);

          switch (action) {
            case ACTIONS.ADD:
              logSuffix = 'boas-vindas';
              captionText = applyReplacements(safeGet(groupInfo, 'welcome_message', DEFAULT_WELCOME_MESSAGE), replacements);
              mediaUrl = safeGet(groupInfo, 'welcome_media', null);
              break;
            case ACTIONS.REMOVE:
              logSuffix = 'despedida';
              captionText = applyReplacements(safeGet(groupInfo, 'exit_message', DEFAULT_EXIT_MESSAGE), replacements);
              mediaUrl = safeGet(groupInfo, 'exit_media', null);
              break;
            case ACTIONS.PROMOTE:
              logSuffix = 'promoção';
              captionText = `${participantMention} foi promovido(a) a admin no grupo ${groupDisplayName}!`;
              break;
            case ACTIONS.DEMOTE:
              logSuffix = 'rebaixamento';
              captionText = `${participantMention} não é mais admin no grupo ${groupDisplayName}.`;
              break;
            default:
              logger.warn(`[ processParticipantUpdate ] Ação desconhecida '${action}' para ${participant} em ${groupId}. Pulando.`);
              continue;
          }
          logger.debug(`[ processParticipantUpdate ] For participant ${participant}, action ${action}: captionText='${captionText}', mediaUrl='${mediaUrl}'`);

          messageOptions.mentions = [participant];

          if (mediaUrl && (action === ACTIONS.ADD || action === ACTIONS.REMOVE)) {
            const mediaData = await fetchMedia(mediaUrl);
            if (mediaData) {
              const { buffer, mime } = mediaData;
              if (mime.startsWith('image/')) messageOptions.image = buffer;
              else if (mime.startsWith('video/')) messageOptions.video = buffer;
              else logger.warn(`[ processParticipantUpdate ] Tipo MIME não suportado (${mime}) para mídia ${mediaUrl}. Enviando apenas texto.`);

              if (messageOptions.image || messageOptions.video) messageOptions.caption = captionText;
              else messageOptions.text = captionText;
            } else {
              messageOptions.text = captionText;
            }
          } else {
            messageOptions.text = captionText;
          }

          logger.debug(`[ processParticipantUpdate ] Final messageOptions for ${participant} in ${groupId}:`, messageOptions);
          if (messageOptions.text || messageOptions.caption || messageOptions.image || messageOptions.video) {
            await client.sendMessage(groupId, messageOptions);
            logger.info(`[ processParticipantUpdate ] Mensagem de ${logSuffix} enviada para ${participant} em ${groupId} ${messageOptions.image || messageOptions.video ? '(com mídia)' : '(apenas texto)'}.`);
          } else {
            logger.warn(`[ processParticipantUpdate ] Opções de mensagem vazias ou inválidas para ${action} do participante ${participant} em ${groupId}. Nenhuma mensagem enviada. Options:`, messageOptions);
          }
        } catch (sendError) {
          logger.error(`[ processParticipantUpdate ] Erro ao enviar mensagem de ${action} para ${participant} em ${groupId}: ${sendError.message}`, { stack: sendError.stack });
        }
      }
    } else {
      logger.info(`[ processParticipantUpdate ] Mensagens de evento desativadas (is_welcome=${safeGet(groupInfo, 'is_welcome', 'N/A')}) para ${groupId}. Nenhuma mensagem de '${action}' será enviada.`);
    }
  } catch (error) {
    logger.error(`[ processParticipantUpdate ] Erro GERAL ao processar evento para grupo ${groupId} (Ação: ${action}): ${error.message}`, { stack: error.stack });
  }
};

/**
 * @module groupEventsController
 * @description Exporta a função principal para processar eventos de participantes.
 */
module.exports = {
  processParticipantUpdate,
};
