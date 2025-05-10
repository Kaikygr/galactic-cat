const logger = require('../utils/logger');
const { runQuery } = require('../database/processDatabase');
const axios = require('axios');

const GROUPS_TABLE_NAME = 'groups';
const DEFAULT_WELCOME_MESSAGE = 'Bem-vindo(a) ao {groupName}, {user}! 🎉';
const DEFAULT_EXIT_MESSAGE = 'Até mais, {user}! Sentiremos sua falta. 👋';
const DEFAULT_NULL_VALUE = 'não informado';

const safeGet = (obj, path, defaultValue = DEFAULT_NULL_VALUE) => {
  if (!obj || typeof path !== 'string') return defaultValue;

  const pathParts = path.split(/[\.\[\]]/).filter(Boolean);

  const result = pathParts.reduce((acc, key) => {
    return acc && typeof acc === 'object' && key in acc ? acc[key] : undefined;
  }, obj);

  return result == null ? defaultValue : result;
};

const formatDbTimestamp = (timestamp) => {
  if (timestamp == null) {
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
    return DEFAULT_NULL_VALUE;
  }
};

async function checkAndEnsureWelcomeColumns() {
  const columnsToCheck = ['is_welcome', 'welcome_message', 'welcome_media', 'exit_message', 'exit_media'];
  let columnsFound = [];

  try {
    const checkQuery = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() -- Verifica apenas no banco de dados atual
        AND TABLE_NAME = ?           -- Na tabela especificada (groups)
        AND COLUMN_NAME IN (?, ?, ?, ?, ?); -- Verifica apenas as colunas da lista
    `;
    const checkResult = await runQuery(checkQuery, [GROUPS_TABLE_NAME, ...columnsToCheck]);
    columnsFound = checkResult.map((row) => row.COLUMN_NAME);
    const missingColumns = columnsToCheck.filter((col) => !columnsFound.includes(col));

    if (missingColumns.length > 0) {
      logger.warn(`[ checkAndEnsureWelcomeColumns ] 🔄 Colunas ausentes: ${missingColumns.join(', ')}. Adicionando...`);

      for (const column of missingColumns) {
        let alterQuery = '';
        if (column === 'is_welcome') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`is_welcome\` TINYINT(1) DEFAULT 0;`;
        else if (column === 'welcome_message') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`welcome_message\` TEXT;`;
        else if (column === 'welcome_media') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`welcome_media\` TEXT DEFAULT NULL;`;
        else if (column === 'exit_message') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`exit_message\` TEXT;`;
        else if (column === 'exit_media') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`exit_media\` TEXT DEFAULT NULL;`;

        try {
          logger.info(`[ checkAndEnsureWelcomeColumns ] 🔄 Executando: ${alterQuery.trim()}`);
          await runQuery(alterQuery, []);
          logger.info(`[ checkAndEnsureWelcomeColumns ] ✅ Coluna '${column}' adicionada.`);
        } catch (alterError) {
          if (alterError.code === 'ER_DUP_FIELDNAME') {
            logger.warn(`[ checkAndEnsureWelcomeColumns ] 🔄 Coluna '${column}' já existe.`);
          } else {
            logger.error(`[ checkAndEnsureWelcomeColumns ] ❌ Erro ao adicionar '${column}': ${alterError.message}`, { stack: alterError.stack });
            throw alterError;
          }
        }
      }
      logger.info(`[ checkAndEnsureWelcomeColumns ] ✅ Colunas verificadas/adicionadas. Interrompendo evento.`);
      return false;
    } else {
      return true;
    }
  } catch (error) {
    logger.error(`[ checkAndEnsureWelcomeColumns ] ❌ Erro: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

const processParticipantUpdate = async (event, client) => {
  const { id, action, participants } = event;

  logger.info(`[ processParticipantUpdate ] ⚙️ Evento: ${id}. Ação: ${action}. Participantes: ${participants.join(', ')}`);

  try {
    const canContinue = await checkAndEnsureWelcomeColumns();
    if (!canContinue) {
      logger.info(`[ processParticipantUpdate ] ⚙️ Interrompido ${id} (verificação colunas).`);
      return;
    }

    let groupInfo = null;
    try {
      const query = `
        SELECT
          \`name\`, \`owner\`, \`created_at\`, \`description\`, \`description_id\`,
          \`subject_owner\`, \`subject_time\`, \`size\`, \`restrict\`, \`announce\`,
          \`is_community\`, \`is_community_announce\`, \`join_approval_mode\`,
          \`member_add_mode\`, \`isPremium\`, \`premiumTemp\`,
          \`is_welcome\`, \`welcome_message\`, \`welcome_media\`,
          \`exit_message\`, \`exit_media\`
        FROM \`${GROUPS_TABLE_NAME}\`
        WHERE \`id\` = ?
      `;
      const params = [id];
      const result = await runQuery(query, params);
      const rows = result && result.rows ? result.rows : Array.isArray(result) ? result : [];

      if (rows.length > 0) {
        groupInfo = rows[0];
        logger.info(`[ processParticipantUpdate ] 🔄 Grupo ${id}: Nome='${safeGet(groupInfo, 'name', id)}', EventsEnabled=${safeGet(groupInfo, 'is_welcome', 0)}, WMedia='${safeGet(groupInfo, 'welcome_media', null) ? 'S' : 'N'}', EMedia='${safeGet(groupInfo, 'exit_media', null) ? 'S' : 'N'}'`);
      } else {
        logger.warn(`[ processParticipantUpdate ] 🔄 Grupo ${id} não no DB. Tentando buscar metadados via cliente (Fallback).`);
        try {
          const metadata = await client.groupMetadata(id);
          groupInfo = {
            name: safeGet(metadata, 'subject', id),
            owner: safeGet(metadata, 'owner', null),
            created_at: safeGet(metadata, 'creation', null),
            description: safeGet(metadata, 'desc', null),
            size: safeGet(metadata, 'size', null),
            is_welcome: 0,
            welcome_message: null,
            welcome_media: null,
            exit_message: null,
            exit_media: null,
          };
          logger.info(`[ processParticipantUpdate ] 🔄 Fallback (Metadados): Nome='${groupInfo.name}'. Eventos desativados.`);
        } catch (metadataError) {
          logger.error(`[ processParticipantUpdate ] 🔄 Erro ao buscar metadados no fallback para ${id}: ${metadataError.message}. Eventos desativados.`);
          groupInfo = {
            name: id,
            owner: null,
            created_at: null,
            description: null,
            size: null,
            is_welcome: 0,
            welcome_message: null,
            welcome_media: null,
            exit_message: null,
            exit_media: null,
          };
        }
      }
    } catch (dbError) {
      logger.error(`[ processParticipantUpdate ] ❌ Erro ao buscar dados do grupo ${id} no DB: ${dbError.message}. Usando Fallback.`, { stack: dbError.stack });

      try {
        const metadata = await client.groupMetadata(id);
        groupInfo = {
          name: safeGet(metadata, 'subject', id),
          owner: safeGet(metadata, 'owner', null),
          created_at: safeGet(metadata, 'creation', null),
          description: safeGet(metadata, 'desc', null),
          size: safeGet(metadata, 'size', null),
          is_welcome: 0,
          welcome_message: null,
          welcome_media: null,
          exit_message: null,
          exit_media: null,
        };
        logger.info(`[ processParticipantUpdate ] 🔄 Fallback (Erro DB -> Metadados): Nome='${groupInfo.name}'. Eventos desativados.`);
      } catch (metadataError) {
        logger.error(`[ processParticipantUpdate ] 🔄 Erro ao buscar metadados no fallback (após erro DB) para ${id}: ${metadataError.message}. Eventos desativados.`);
        groupInfo = {
          name: id,
          owner: null,
          created_at: null,
          description: null,
          size: null,
          is_welcome: 0,
          welcome_message: null,
          welcome_media: null,
          exit_message: null,
          exit_media: null,
        };
      }
    }

    const groupDisplayName = safeGet(groupInfo, 'name', 'grupo');
    const groupDesc = safeGet(groupInfo, 'description');
    const groupOwnerJid = safeGet(groupInfo, 'owner');
    const groupOwnerNumber = groupOwnerJid !== DEFAULT_NULL_VALUE ? groupOwnerJid.split('@')[0] : DEFAULT_NULL_VALUE;

    const groupCreatedAtFormatted = formatDbTimestamp(safeGet(groupInfo, 'created_at', null));

    const groupSize = safeGet(groupInfo, 'size', DEFAULT_NULL_VALUE).toString();

    const eventMessagesEnabled = safeGet(groupInfo, 'is_welcome', 0) === 1;

    switch (action) {
      case 'add':
        logger.info(`[ processParticipantUpdate ] 👋 Ação 'add' detectada para ${id} (${groupDisplayName}).`);
        break;
      case 'remove':
        logger.info(`[ processParticipantUpdate ] 🚪 Ação 'remove' detectada para ${id} (${groupDisplayName}).`);
        break;
      case 'promote':
        logger.info(`[ processParticipantUpdate ] ✨ Ação 'promote' detectada para ${id} (${groupDisplayName}).`);
        break;
      case 'demote':
        logger.info(`[ processParticipantUpdate ] 🔽 Ação 'demote' detectada para ${id} (${groupDisplayName}).`);
        break;
    }

    if (eventMessagesEnabled) {
      logger.info(`[ processParticipantUpdate ] 📤 Mensagens de evento ativadas para ${id}. Processando envio para ${participants.length} participante(s)...`);

      for (const participant of participants) {
        try {
          let messageOptions = {};
          let logSuffix = '';
          let captionText = '';
          let mediaUrl = null;
          let template = '';

          switch (action) {
            case 'add':
              logSuffix = 'boas-vindas';
              template = safeGet(groupInfo, 'welcome_message', DEFAULT_WELCOME_MESSAGE);
              mediaUrl = safeGet(groupInfo, 'welcome_media', null);
              break;

            case 'remove':
              logSuffix = 'despedida';
              template = safeGet(groupInfo, 'exit_message', DEFAULT_EXIT_MESSAGE);
              mediaUrl = safeGet(groupInfo, 'exit_media', null);
              break;

            case 'promote':
              logSuffix = 'promoção';

              captionText = `@${participant.split('@')[0]} foi promovido(a) a admin no grupo ${groupDisplayName}!`;

              messageOptions = { text: captionText, mentions: [participant] };
              break;
            case 'demote':
              logSuffix = 'rebaixamento';

              captionText = `@${participant.split('@')[0]} não é mais admin no grupo ${groupDisplayName}.`;

              messageOptions = { text: captionText, mentions: [participant] };
              break;
            default:
              logger.warn(`[ processParticipantUpdate ] 🔄 Ação desconhecida '${action}' encontrada durante o preparo da mensagem para ${participant} em ${id}. Pulando participante.`);
              continue;
          }

          if (action === 'add' || action === 'remove') {
            const replacements = {
              '{groupName}': groupDisplayName,
              '{user}': `@${participant.split('@')[0]}`,
              '{desc}': groupDesc,
              '{ownerNumber}': groupOwnerNumber,
              '{createdAt}': groupCreatedAtFormatted,
              '{size}': groupSize,
            };
            const regex = new RegExp(
              Object.keys(replacements)
                .map((key) => key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
                .join('|'),
              'g',
            );

            captionText = template.replace(regex, (matched) => replacements[matched]);

            if (mediaUrl) {
              logger.info(`[ processParticipantUpdate ] 🔄 Tentando buscar mídia de ${logSuffix} (${mediaUrl}) para ${participant} em ${id} via axios...`);
              try {
                const response = await axios.get(mediaUrl, {
                  responseType: 'arraybuffer',
                  timeout: 15000,
                });
                const buffer = response.data;
                const mime = response.headers['content-type'];

                if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Buffer de mídia inválido ou vazio.');
                if (!mime) throw new Error('Tipo MIME (Content-Type) não encontrado nos headers da resposta da mídia.');

                logger.info(`[ processParticipantUpdate ] 🔄 Mídia ${mediaUrl} obtida com sucesso. Tipo: ${mime}, Tamanho: ${buffer.length} bytes.`);

                if (mime.startsWith('image/')) {
                  messageOptions = { image: buffer, caption: captionText, mentions: [participant] };
                } else if (mime.startsWith('video/')) {
                  messageOptions = { video: buffer, caption: captionText, mentions: [participant] };
                } else {
                  logger.warn(`[ processParticipantUpdate ] 🔄 Tipo MIME não suportado diretamente (${mime}) para mídia ${mediaUrl}. Enviando apenas texto como fallback.`);
                  messageOptions = { text: captionText, mentions: [participant] };
                }
              } catch (mediaError) {
                let errorMsg = mediaError.message;
                if (mediaError.response) errorMsg += ` (Status: ${mediaError.response.status})`;
                else if (mediaError.request) errorMsg += ` (Sem resposta recebida)`;
                logger.error(`[ processParticipantUpdate ] 🔄 Erro ao buscar/processar mídia (${mediaUrl}) via axios: ${errorMsg}. Usando apenas texto como fallback.`);

                messageOptions = { text: captionText, mentions: [participant] };
              }
            } else {
              messageOptions = { text: captionText, mentions: [participant] };
            }
          }

          if (Object.keys(messageOptions).length > 0 && (messageOptions.text || messageOptions.caption || messageOptions.image || messageOptions.video)) {
            await client.sendMessage(id, messageOptions);
            logger.info(`[ processParticipantUpdate ] 📤 Mensagem de ${logSuffix} enviada para ${participant} em ${id} ${messageOptions.image || messageOptions.video ? '(com mídia)' : '(apenas texto)'}.`);
          } else {
            logger.warn(`[ processParticipantUpdate ] 🔄 Objeto messageOptions vazio ou inválido para ação '${action}' do participante ${participant} em ${id}. Nenhuma mensagem enviada. Options:`, messageOptions);
          }
        } catch (sendError) {
          logger.error(`[ processParticipantUpdate ] ❌ Erro ao enviar mensagem de ${action} para ${participant} em ${id}: ${sendError.message}`);
        }
      }
    } else {
      logger.info(`[ processParticipantUpdate ] 🔇 Mensagens de evento desativadas (is_welcome=${safeGet(groupInfo, 'is_welcome', 'N/A')}) para o grupo ${id}. Nenhuma mensagem de '${action}' será enviada.`);
    }
  } catch (error) {
    logger.error(`[ processParticipantUpdate ] ❌ Erro GERAL ao processar evento para grupo ${id} (Ação: ${action}): ${error.message}`, { stack: error.stack });
  }
};

module.exports = {
  processParticipantUpdate,
};
