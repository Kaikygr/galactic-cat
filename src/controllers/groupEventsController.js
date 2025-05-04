const logger = require('../utils/logger');
const { runQuery } = require('../database/processDatabase');
const axios = require('axios');

const GROUPS_TABLE_NAME = 'groups';
const DEFAULT_WELCOME_MESSAGE = 'Bem-vindo(a) ao {groupName}, {user}! 🎉';
const DEFAULT_EXIT_MESSAGE = 'Até mais, {user}! Sentiremos sua falta. 👋';
const DEFAULT_NULL_VALUE = 'não informado';

/**
 * Acessa de forma segura um valor aninhado dentro de um objeto,
 * permitindo acesso por caminhos como "user.profile.name" ou "items[0].name".
 * Retorna um valor padrão caso qualquer parte do caminho seja inválida.
 *
 * @param {object} obj - O objeto base de onde os dados serão acessados.
 * @param {string} path - Caminho em string separado por ponto ou colchetes. Ex: "user.name" ou "items[0].name".
 * @param {*} defaultValue - Valor de fallback, usado se o caminho não existir ou retornar null/undefined.
 * @returns {*} - O valor acessado ou o valor padrão.
 */
const safeGet = (obj, path, defaultValue = DEFAULT_NULL_VALUE) => {
  /* Se o objeto for nulo ou o caminho não for uma string, retorna o valor padrão */
  if (!obj || typeof path !== 'string') return defaultValue;

  /* Expressão regular para dividir tanto por ponto (.) quanto por colchetes [index] */
  const pathParts = path.split(/[\.\[\]]/).filter(Boolean); // Remove strings vazias geradas por split

  /* Reduz o caminho passo a passo */
  const result = pathParts.reduce((acc, key) => {
    /* Se o acumulador atual for nulo/indefinido ou não for objeto/array, encerra com undefined */
    return acc && typeof acc === 'object' && key in acc ? acc[key] : undefined;
  }, obj);

  /* Se o resultado final for null ou undefined, retorna o valor padrão */
  return result == null ? defaultValue : result;
};

/**
 * Formata um timestamp (string ou Date) para uma data legível em pt-BR.
 * @param {string|Date|null|undefined} timestamp - O timestamp a ser formatado.
 * @returns {string} A data formatada (DD/MM/AAAA) ou DEFAULT_NULL_VALUE.
 */
const formatDbTimestamp = (timestamp) => {
  if (timestamp == null) {
    return DEFAULT_NULL_VALUE;
  }
  try {
    // Tenta criar um objeto Date. Funciona com strings de data do DB ou objetos Date.
    const date = new Date(timestamp);
    // Verifica se a data é válida.
    if (isNaN(date.getTime())) {
      return DEFAULT_NULL_VALUE;
    }
    // Formata para o padrão pt-BR (dia/mês/ano).
    return date.toLocaleDateString('pt-BR');
  } catch (e) {
    // Em caso de erro na conversão/formatação.
    logger.warn(`[ formatDbTimestamp ] Erro ao formatar timestamp: ${timestamp}`, e);
    return DEFAULT_NULL_VALUE;
  }
};

/**
 * Verifica se as colunas necessárias para as mensagens de boas-vindas/saída existem na tabela 'groups'.
 * Se alguma coluna estiver faltando, tenta adicioná-la.
 * Esta função é crucial para garantir que a funcionalidade de boas-vindas/saída possa operar corretamente
 * e para migrar bancos de dados mais antigos que não possuam essas colunas.
 *
 * @async
 * @function checkAndEnsureWelcomeColumns
 * @returns {Promise<boolean>} Retorna `true` se todas as colunas necessárias já existiam,
 *                              ou `false` se alguma coluna precisou ser adicionada (ou se ocorreu um erro
 *                              irrecuperável durante a adição). Retornar `false` sinaliza que o processamento
 *                              do evento atual deve ser interrompido para evitar erros.
 * @throws {Error} Lança um erro se houver um problema crítico ao consultar ou alterar o schema do banco de dados
 *                 (que não seja a coluna já existir - ER_DUP_FIELDNAME).
 */
async function checkAndEnsureWelcomeColumns() {
  // Lista das colunas que precisam existir para a funcionalidade de boas-vindas/saída.
  const columnsToCheck = ['is_welcome', 'welcome_message', 'welcome_media', 'exit_message', 'exit_media'];
  let columnsFound = []; // Armazena as colunas encontradas na verificação.

  try {
    // Query para verificar a existência das colunas na tabela de metadados do banco (INFORMATION_SCHEMA).
    const checkQuery = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() -- Verifica apenas no banco de dados atual
        AND TABLE_NAME = ?           -- Na tabela especificada (groups)
        AND COLUMN_NAME IN (?, ?, ?, ?, ?); -- Verifica apenas as colunas da lista
    `;
    const checkResult = await runQuery(checkQuery, [GROUPS_TABLE_NAME, ...columnsToCheck]); // Passa o nome da tabela e as colunas como parâmetros
    columnsFound = checkResult.map((row) => row.COLUMN_NAME); // Extrai os nomes das colunas encontradas.

    // Filtra para encontrar quais colunas da lista original NÃO foram encontradas no banco.
    const missingColumns = columnsToCheck.filter((col) => !columnsFound.includes(col));

    // Se houver colunas faltando...
    if (missingColumns.length > 0) {
      logger.warn(`[ checkAndEnsureWelcomeColumns ] 🔄 Colunas ausentes: ${missingColumns.join(', ')}. Adicionando...`);
      // Itera sobre cada coluna ausente para adicioná-la.
      for (const column of missingColumns) {
        let alterQuery = '';
        // Define a query `ALTER TABLE` específica para cada coluna ausente.
        if (column === 'is_welcome') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`is_welcome\` TINYINT(1) DEFAULT 0;`; // Booleano para ativar/desativar
        else if (column === 'welcome_message') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`welcome_message\` TEXT;`; // Texto para mensagem de boas-vindas
        else if (column === 'welcome_media') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`welcome_media\` TEXT DEFAULT NULL;`; // URL da mídia de boas-vindas
        else if (column === 'exit_message') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`exit_message\` TEXT;`; // Texto para mensagem de saída
        else if (column === 'exit_media') alterQuery = `ALTER TABLE \`${GROUPS_TABLE_NAME}\` ADD COLUMN \`exit_media\` TEXT DEFAULT NULL;`; // URL da mídia de saída

        try {
          logger.info(`[ checkAndEnsureWelcomeColumns ] 🔄 Executando: ${alterQuery.trim()}`);
          await runQuery(alterQuery, []); // Executa a query de alteração.
          logger.info(`[ checkAndEnsureWelcomeColumns ] ✅ Coluna '${column}' adicionada.`);
        } catch (alterError) {
          // Se o erro for 'ER_DUP_FIELDNAME', significa que a coluna já existe (talvez criada por outro processo).
          // Isso não é um erro crítico, apenas um aviso.
          if (alterError.code === 'ER_DUP_FIELDNAME') {
            logger.warn(`[ checkAndEnsureWelcomeColumns ] 🔄 Coluna '${column}' já existe.`);
          } else {
            // Outros erros durante o ALTER TABLE são problemáticos.
            logger.error(`[ checkAndEnsureWelcomeColumns ] ❌ Erro ao adicionar '${column}': ${alterError.message}`, { stack: alterError.stack });
            throw alterError; // Relança o erro para indicar falha.
          }
        }
      }
      // Se chegamos aqui, colunas foram adicionadas. Retorna false para interromper o evento atual.
      logger.info(`[ checkAndEnsureWelcomeColumns ] ✅ Colunas verificadas/adicionadas. Interrompendo evento.`);
      return false;
    } else {
      // Nenhuma coluna estava faltando. Retorna true para permitir a continuação do evento.
      return true;
    }
  } catch (error) {
    // Captura erros da query inicial de verificação ou erros relançados do ALTER TABLE.
    logger.error(`[ checkAndEnsureWelcomeColumns ] ❌ Erro: ${error.message}`, { stack: error.stack });
    throw error; // Relança o erro.
  }
}

/**
 * Processa eventos de atualização de participantes em um grupo (entrada, saída, promoção, rebaixamento).
 * Busca as configurações do grupo no banco de dados (mensagens de boas-vindas/saída, status de ativação).
 * Se as mensagens de evento estiverem ativadas, formata e envia a mensagem apropriada,
 * substituindo placeholders como {groupName}, {user}, {desc}, {ownerNumber}, {createdAt}, {size},
 * e incluindo mídia se configurada e disponível. Valores nulos são substituídos por "não informado".
 *
 * @async
 * @function processParticipantUpdate
 * @param {object} event - O objeto do evento de atualização de participantes.
 * @param {string} event.id - O JID (ID) do grupo onde o evento ocorreu.
 * @param {string} event.action - A ação que ocorreu ('add', 'remove', 'promote', 'demote').
 * @param {string[]} event.participants - Um array de JIDs dos participantes afetados pela ação.
 * @param {object} client - A instância do cliente Baileys (ou similar) para interagir com o WhatsApp (enviar mensagens, buscar metadados).
 * @returns {Promise<void>} A função não retorna um valor, mas executa ações assíncronas (consultas DB, envio de mensagens).
 */
const processParticipantUpdate = async (event, client) => {
  // Desestrutura o objeto do evento para facilitar o acesso às propriedades.
  const { id, action, participants } = event;

  // Log inicial do evento recebido.
  logger.info(`[ processParticipantUpdate ] ⚙️ Evento: ${id}. Ação: ${action}. Participantes: ${participants.join(', ')}`);

  try {
    // Primeiro, verifica e garante que as colunas do DB existem.
    const canContinue = await checkAndEnsureWelcomeColumns();
    // Se checkAndEnsureWelcomeColumns retornou false, significa que colunas foram adicionadas
    // e o processamento deste evento deve parar para evitar inconsistências.
    if (!canContinue) {
      logger.info(`[ processParticipantUpdate ] ⚙️ Interrompido ${id} (verificação colunas).`);
      return;
    }

    let groupInfo = null; // Variável para armazenar as informações do grupo buscadas no DB.
    try {
      // Query para buscar todas as informações relevantes do grupo, incluindo as de boas-vindas/saída.
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
      const params = [id]; // Parâmetro da query: ID do grupo.
      const result = await runQuery(query, params);
      // Normaliza o resultado da query (pode variar dependendo do driver/wrapper do DB).
      const rows = result && result.rows ? result.rows : Array.isArray(result) ? result : [];

      // Se encontrou o grupo no banco de dados...
      if (rows.length > 0) {
        groupInfo = rows[0]; // Pega o primeiro (e único esperado) resultado.
        // Log com informações básicas do grupo encontradas no DB.
        logger.info(`[ processParticipantUpdate ] 🔄 Grupo ${id}: Nome='${safeGet(groupInfo, 'name', id)}', EventsEnabled=${safeGet(groupInfo, 'is_welcome', 0)}, WMedia='${safeGet(groupInfo, 'welcome_media', null) ? 'S' : 'N'}', EMedia='${safeGet(groupInfo, 'exit_media', null) ? 'S' : 'N'}'`);
      } else {
        // Se o grupo não foi encontrado no banco de dados (pode ser um grupo novo ou não registrado).
        logger.warn(`[ processParticipantUpdate ] 🔄 Grupo ${id} não no DB. Tentando buscar metadados via cliente (Fallback).`);
        try {
          // Tenta buscar os metadados do grupo diretamente via cliente Baileys.
          const metadata = await client.groupMetadata(id);
          // Cria um objeto `groupInfo` mínimo com valores padrão (eventos desativados).
          // Usamos safeGet aqui também para consistência, embora os valores sejam definidos diretamente.
          groupInfo = {
            name: safeGet(metadata, 'subject', id), // Usa o nome do grupo dos metadados ou o ID se não houver nome.
            owner: safeGet(metadata, 'owner', null),
            created_at: safeGet(metadata, 'creation', null), // 'creation' é o campo em Baileys
            description: safeGet(metadata, 'desc', null),
            size: safeGet(metadata, 'size', null),
            is_welcome: 0, // Eventos desativados por padrão no fallback.
            welcome_message: null,
            welcome_media: null,
            exit_message: null,
            exit_media: null,
            // Outros campos podem ser adicionados se necessário/disponível nos metadados
          };
          logger.info(`[ processParticipantUpdate ] 🔄 Fallback (Metadados): Nome='${groupInfo.name}'. Eventos desativados.`);
        } catch (metadataError) {
          // Se a busca de metadados falhar (ex: bot não está mais no grupo).
          logger.error(`[ processParticipantUpdate ] 🔄 Erro ao buscar metadados no fallback para ${id}: ${metadataError.message}. Eventos desativados.`);
          // Cria um objeto `groupInfo` ainda mais básico, apenas com o ID e defaults.
          groupInfo = {
            name: id, // Usa o ID como nome.
            owner: null,
            created_at: null,
            description: null,
            size: null,
            is_welcome: 0, // Eventos desativados.
            welcome_message: null,
            welcome_media: null,
            exit_message: null,
            exit_media: null,
          };
        }
      }
    } catch (dbError) {
      // Se ocorrer um erro durante a consulta ao banco de dados.
      logger.error(`[ processParticipantUpdate ] ❌ Erro ao buscar dados do grupo ${id} no DB: ${dbError.message}. Usando Fallback.`, { stack: dbError.stack });
      // Tenta o mesmo fallback de buscar metadados via cliente.
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

    // --- Preparação dos dados para placeholders ---
    // Obtém os valores do groupInfo de forma segura, aplicando o default "não informado"
    const groupDisplayName = safeGet(groupInfo, 'name', 'grupo');
    const groupDesc = safeGet(groupInfo, 'description');
    const groupOwnerJid = safeGet(groupInfo, 'owner');
    // Extrai apenas o número do JID do dono, se disponível
    const groupOwnerNumber = groupOwnerJid !== DEFAULT_NULL_VALUE ? groupOwnerJid.split('@')[0] : DEFAULT_NULL_VALUE;
    // Formata a data de criação
    const groupCreatedAtFormatted = formatDbTimestamp(safeGet(groupInfo, 'created_at', null));
    // Obtém o tamanho e converte para string
    const groupSize = safeGet(groupInfo, 'size', DEFAULT_NULL_VALUE).toString();

    // Verifica se as mensagens de evento estão habilitadas (is_welcome === 1).
    const eventMessagesEnabled = safeGet(groupInfo, 'is_welcome', 0) === 1;

    // Log específico para cada tipo de ação (apenas informativo).
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

    // Só prossegue para o envio de mensagens se a flag `is_welcome` estiver ativa.
    if (eventMessagesEnabled) {
      logger.info(`[ processParticipantUpdate ] 📤 Mensagens de evento ativadas para ${id}. Processando envio para ${participants.length} participante(s)...`);
      // Itera sobre cada participante envolvido no evento.
      for (const participant of participants) {
        try {
          let messageOptions = {}; // Objeto que conterá os dados da mensagem a ser enviada (texto, mídia, menções).
          let logSuffix = ''; // Sufixo para logs (ex: "boas-vindas", "despedida").
          let captionText = ''; // Texto da mensagem ou legenda da mídia.
          let mediaUrl = null; // URL da mídia a ser enviada (se houver).
          let template = ''; // Template da mensagem (boas-vindas ou saída)

          // Define o template e a mídia com base na ação.
          switch (action) {
            case 'add':
              logSuffix = 'boas-vindas';
              // Usa a mensagem personalizada do DB ou a padrão.
              template = safeGet(groupInfo, 'welcome_message', DEFAULT_WELCOME_MESSAGE);
              mediaUrl = safeGet(groupInfo, 'welcome_media', null); // Pega a URL da mídia de boas-vindas do DB.
              break;

            case 'remove':
              logSuffix = 'despedida';
              // Usa a mensagem personalizada do DB ou a padrão.
              template = safeGet(groupInfo, 'exit_message', DEFAULT_EXIT_MESSAGE);
              mediaUrl = safeGet(groupInfo, 'exit_media', null); // Pega a URL da mídia de saída do DB.
              break;

            // Para promote e demote, usamos mensagens fixas (poderiam ser personalizáveis no futuro).
            case 'promote':
              logSuffix = 'promoção';
              // Mensagem fixa para promoção.
              captionText = `@${participant.split('@')[0]} foi promovido(a) a admin no grupo ${groupDisplayName}!`;
              // Define diretamente as opções de mensagem de texto com menção.
              messageOptions = { text: captionText, mentions: [participant] };
              break; // Sai do switch interno
            case 'demote':
              logSuffix = 'rebaixamento';
              // Mensagem fixa para rebaixamento.
              captionText = `@${participant.split('@')[0]} não é mais admin no grupo ${groupDisplayName}.`;
              // Define diretamente as opções de mensagem de texto com menção.
              messageOptions = { text: captionText, mentions: [participant] };
              break; // Sai do switch interno
            default:
              // Ação desconhecida (improvável, mas seguro ter um default).
              logger.warn(`[ processParticipantUpdate ] 🔄 Ação desconhecida '${action}' encontrada durante o preparo da mensagem para ${participant} em ${id}. Pulando participante.`);
              continue; // Pula para o próximo participante no loop 'for'.
          }

          // --- Processamento de Placeholders para 'add' e 'remove' ---
          // Só executa se for 'add' ou 'remove' (onde usamos templates)
          if (action === 'add' || action === 'remove') {
            // Define o mapa de substituições
            const replacements = {
              '{groupName}': groupDisplayName,
              '{user}': `@${participant.split('@')[0]}`, // O @mencao do usuário
              '{desc}': groupDesc, // Descrição do grupo
              '{ownerNumber}': groupOwnerNumber, // Número do dono (sem @s.whatsapp.net)
              '{createdAt}': groupCreatedAtFormatted, // Data de criação formatada
              '{size}': groupSize, // Tamanho do grupo (número de participantes)
              // Adicione mais placeholders aqui se necessário
            };

            // Cria uma regex para encontrar todas as chaves do mapa de substituições no template.
            // Escapa caracteres especiais nas chaves para que funcionem corretamente na regex.
            const regex = new RegExp(
              Object.keys(replacements)
                .map((key) => key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
                .join('|'),
              'g',
            );

            // Realiza todas as substituições de uma vez.
            // A função passada como segundo argumento do replace é chamada para cada match encontrado.
            // Ela retorna o valor correspondente do mapa `replacements`.
            captionText = template.replace(regex, (matched) => replacements[matched]);

            // --- Lógica de Mídia (apenas para 'add' e 'remove') ---
            if (mediaUrl) {
              logger.info(`[ processParticipantUpdate ] 🔄 Tentando buscar mídia de ${logSuffix} (${mediaUrl}) para ${participant} em ${id} via axios...`);
              try {
                // Tenta baixar a mídia da URL fornecida usando axios.
                const response = await axios.get(mediaUrl, {
                  responseType: 'arraybuffer', // Pede a resposta como um buffer de bytes.
                  timeout: 15000, // Define um timeout de 15 segundos.
                });
                const buffer = response.data; // O conteúdo da mídia como buffer.
                const mime = response.headers['content-type']; // O tipo MIME da mídia (ex: 'image/jpeg').

                // Validações básicas da mídia baixada.
                if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Buffer de mídia inválido ou vazio.');
                if (!mime) throw new Error('Tipo MIME (Content-Type) não encontrado nos headers da resposta da mídia.');

                logger.info(`[ processParticipantUpdate ] 🔄 Mídia ${mediaUrl} obtida com sucesso. Tipo: ${mime}, Tamanho: ${buffer.length} bytes.`);

                // Define as opções de mensagem com base no tipo MIME.
                if (mime.startsWith('image/')) {
                  messageOptions = { image: buffer, caption: captionText, mentions: [participant] };
                } else if (mime.startsWith('video/')) {
                  messageOptions = { video: buffer, caption: captionText, mentions: [participant] };
                } else {
                  // Se for um tipo de mídia não suportado diretamente (ex: gif como image/gif, audio, etc.)
                  logger.warn(`[ processParticipantUpdate ] 🔄 Tipo MIME não suportado diretamente (${mime}) para mídia ${mediaUrl}. Enviando apenas texto como fallback.`);
                  messageOptions = { text: captionText, mentions: [participant] };
                }
              } catch (mediaError) {
                // Se ocorrer erro ao baixar ou processar a mídia.
                let errorMsg = mediaError.message;
                if (mediaError.response) errorMsg += ` (Status: ${mediaError.response.status})`; // Adiciona status HTTP se disponível.
                else if (mediaError.request) errorMsg += ` (Sem resposta recebida)`; // Indica se a requisição foi feita mas não houve resposta.
                logger.error(`[ processParticipantUpdate ] 🔄 Erro ao buscar/processar mídia (${mediaUrl}) via axios: ${errorMsg}. Usando apenas texto como fallback.`);
                // Fallback: envia apenas a mensagem de texto.
                messageOptions = { text: captionText, mentions: [participant] };
              }
            } else {
              // Se não há URL de mídia configurada, envia apenas o texto.
              messageOptions = { text: captionText, mentions: [participant] };
            }
          } // Fim do if (action === 'add' || action === 'remove')

          // --- Envio da Mensagem ---
          // Verifica se `messageOptions` foi preenchido (seja com texto ou mídia).
          // Garante que não tentemos enviar uma mensagem vazia.
          if (Object.keys(messageOptions).length > 0 && (messageOptions.text || messageOptions.caption || messageOptions.image || messageOptions.video)) {
            // Envia a mensagem para o grupo usando o cliente Baileys.
            await client.sendMessage(id, messageOptions);
            logger.info(`[ processParticipantUpdate ] 📤 Mensagem de ${logSuffix} enviada para ${participant} em ${id} ${messageOptions.image || messageOptions.video ? '(com mídia)' : '(apenas texto)'}.`);
          } else {
            // Log de aviso se, por algum motivo, messageOptions ficou vazio ou inválido.
            logger.warn(`[ processParticipantUpdate ] 🔄 Objeto messageOptions vazio ou inválido para ação '${action}' do participante ${participant} em ${id}. Nenhuma mensagem enviada. Options:`, messageOptions);
          }
        } catch (sendError) {
          // Se ocorrer erro ao enviar a mensagem via Baileys.
          logger.error(`[ processParticipantUpdate ] ❌ Erro ao enviar mensagem de ${action} para ${participant} em ${id}: ${sendError.message}`);
        }
      } // Fim do loop for (participant)
    } else {
      // Se as mensagens de evento não estão ativadas para este grupo.
      logger.info(`[ processParticipantUpdate ] 🔇 Mensagens de evento desativadas (is_welcome=${safeGet(groupInfo, 'is_welcome', 'N/A')}) para o grupo ${id}. Nenhuma mensagem de '${action}' será enviada.`);
    }
  } catch (error) {
    // Captura qualquer erro geral que possa ocorrer durante o processamento do evento.
    logger.error(`[ processParticipantUpdate ] ❌ Erro GERAL ao processar evento para grupo ${id} (Ação: ${action}): ${error.message}`, { stack: error.stack });
  }
};

/**
 * Exporta as funções do controlador de eventos.
 * @module eventsController
 */
module.exports = {
  /**
   * Função para processar atualizações de participantes em grupos.
   * @see processParticipantUpdate
   */
  processParticipantUpdate,
};
