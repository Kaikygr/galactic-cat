/**
 * @fileoverview Este arquivo é o ponto central para a conexão com o WhatsApp usando a biblioteca Baileys.
 * Ele gerencia o ciclo de vida da conexão, autenticação, tratamento de eventos (mensagens, grupos, participantes),
 * cache de metadados de grupo e lógica de reconexão automática.
 * Além disso, inicializa o banco de dados e as tabelas necessárias antes de estabelecer a conexão.
 * @requires baileys - Biblioteca principal para interação com o WhatsApp Web API.
 * @requires pino - Logger para registrar informações e erros.
 * @requires path - Módulo Node.js para manipulação de caminhos de arquivo.
 * @requires node-cache - Biblioteca para cache em memória, usada para metadados de grupo.
 * @requires dotenv - Carrega variáveis de ambiente do arquivo .env.
 * @requires ../utils/logger - Módulo local de logger configurado.
 * @requires ./../database/processDatabase - Funções para inicialização do banco de dados.
 * @requires ./../controllers/userDataController - Funções para processar dados de usuários e criar tabelas.
 * @requires ../controllers/groupEventsController - Funções para processar eventos de participantes em grupos.
 * @requires ../controllers/botController - Controlador principal para a lógica do bot.
 */

const { default: makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason, GroupMetadata } = require("baileys");
const pino = require("pino");
const path = require("path");
const NodeCache = require("node-cache");

// Carrega as variáveis de ambiente do arquivo .env
require("dotenv").config();

// Importa a instância configurada do logger
const logger = require("../utils/logger");
// Importa a função para inicializar o pool de conexão do banco de dados
const { initDatabase } = require("./../database/processDatabase");
// Importa funções para criar tabelas e processar dados do usuário
const { createTables, processUserData } = require("./../controllers/userDataController");
// Importa a função para processar atualizações de participantes em grupos
const { processParticipantUpdate } = require("../controllers/groupEventsController");
// Importa o controlador principal da lógica do bot
const botController = require("../controllers/botController");

/**
 * @constant {string} AUTH_STATE_PATH
 * @description Caminho absoluto para o diretório onde os arquivos de estado de autenticação (credenciais) serão armazenados.
 * Isso permite que a sessão seja restaurada sem a necessidade de escanear o QR Code novamente a cada inicialização.
 */
const AUTH_STATE_PATH = path.join(__dirname, "temp", "auth_state");

/**
 * @constant {number} GROUP_CACHE_TTL_SECONDS
 * @description Tempo de vida (Time To Live) em segundos para os metadados de grupo armazenados em cache.
 * Define por quanto tempo os dados de um grupo (como nome, participantes) são considerados válidos no cache antes de precisarem ser buscados novamente.
 * Valor atual: 5 minutos (5 * 60 segundos).
 */
const GROUP_CACHE_TTL_SECONDS = 5 * 60; // 5 minutos

/**
 * @constant {number} RECONNECT_INITIAL_DELAY_MS
 * @description Atraso inicial em milissegundos antes da primeira tentativa de reconexão após uma desconexão inesperada.
 * Valor atual: 2 segundos (2 * 1000 ms).
 */
const RECONNECT_INITIAL_DELAY_MS = 2 * 1000; // 2 segundos

/**
 * @constant {number} RECONNECT_MAX_DELAY_MS
 * @description Atraso máximo em milissegundos entre as tentativas de reconexão.
 * Isso evita que o atraso cresça indefinidamente com o backoff exponencial.
 * Valor atual: 1 minuto (60 * 1000 ms).
 */
const RECONNECT_MAX_DELAY_MS = 60 * 1000; // 1 minuto

/**
 * @constant {NodeCache} groupMetadataCache
 * @description Instância do NodeCache para armazenar metadados de grupos do WhatsApp.
 * - `stdTTL`: Define o tempo de vida padrão para cada entrada no cache (usando `GROUP_CACHE_TTL_SECONDS`).
 * - `useClones`: `false` para evitar a clonagem de objetos ao armazenar/recuperar, melhorando a performance, mas exigindo cuidado para não modificar o objeto cacheado diretamente.
 * - `checkperiod`: Intervalo em segundos para verificar e remover entradas expiradas do cache.
 */
const groupMetadataCache = new NodeCache({
  stdTTL: GROUP_CACHE_TTL_SECONDS,
  useClones: false, // Performance: evita clonagem, mas não modifique o objeto retornado diretamente
  checkperiod: 60, // Verifica expiração a cada 60 segundos
});

/**
 * @constant {Map<string, Promise<GroupMetadata | null>>} pendingMetadataRequests
 * @description Um Map para rastrear requisições de metadados de grupo que estão em andamento.
 * A chave é o JID (ID do grupo) e o valor é a Promise da requisição.
 * Isso evita que múltiplas requisições para o mesmo grupo sejam disparadas simultaneamente se o cache estiver vazio.
 */
const pendingMetadataRequests = new Map();

/**
 * @variable {number} reconnectAttempts
 * @description Contador para o número de tentativas de reconexão consecutivas realizadas.
 * É resetado para 0 quando a conexão é estabelecida com sucesso ou quando um novo QR Code é gerado.
 * Usado para calcular o atraso exponencial na função `scheduleReconnect`.
 */
let reconnectAttempts = 0;

/**
 * @variable {import('baileys').WASocket | null} clientInstance
 * @description Armazena a instância global do cliente (socket) Baileys após a conexão ser estabelecida.
 * Inicializada como `null` e atualizada pela função `connectToWhatsApp`.
 * Permite que outras partes da aplicação acessem o cliente conectado.
 */
let clientInstance = null;

/**
 * @async
 * @function getGroupMetadata
 * @description Busca os metadados de um grupo específico do WhatsApp, utilizando cache e tratando requisições pendentes.
 * Primeiro, verifica se há uma requisição pendente para o JID. Se sim, retorna a Promise existente.
 * Depois, verifica o cache. Se encontrado, retorna os dados cacheados.
 * Se não estiver no cache nem pendente, inicia uma nova busca usando `client.groupMetadata(jid)`.
 * Armazena a Promise da busca no `pendingMetadataRequests` enquanto ela estiver em andamento.
 * Após a conclusão (sucesso ou erro), remove a Promise do `pendingMetadataRequests`.
 * Em caso de sucesso, armazena os metadados no cache antes de retorná-los.
 * Trata erros específicos (404, 401, 403) informando que o grupo não foi encontrado ou o bot não tem permissão.
 *
 * @param {string} jid - O JID (Identificador do WhatsApp) do grupo para o qual buscar os metadados.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys conectada.
 * @returns {Promise<GroupMetadata | null>} Uma Promise que resolve com o objeto de metadados do grupo (`GroupMetadata`) se encontrado e válido, ou `null` caso contrário (erro, não encontrado, dados inválidos).
 * @global Usa `pendingMetadataRequests` e `groupMetadataCache`.
 */
const getGroupMetadata = async (jid, client) => {
  // Validação básica de entrada
  if (!jid || !client) {
    logger.warn(`[getGroupMetadata] JID ou cliente inválido fornecido.`);
    return null;
  }

  // 1. Verificar requisições pendentes
  if (pendingMetadataRequests.has(jid)) {
    logger.debug(`[getGroupMetadata] Busca pendente encontrada para ${jid}. Aguardando resultado...`);
    // Retorna a Promise que já está em andamento
    return pendingMetadataRequests.get(jid);
  }

  // 2. Verificar cache
  const cachedData = groupMetadataCache.get(jid);
  if (cachedData) {
    logger.debug(`[getGroupMetadata] Cache hit para ${jid}`);
    return cachedData; // Retorna dados do cache
  }

  // 3. Cache miss e nenhuma requisição pendente: Iniciar nova busca
  logger.debug(`[getGroupMetadata] Cache miss para ${jid}. Iniciando busca e marcando como pendente...`);
  // Cria a Promise da busca. Ela será executada imediatamente.
  const fetchPromise = (async () => {
    try {
      // Realiza a chamada à API do Baileys para buscar os metadados
      const metadata = await client.groupMetadata(jid);

      // Valida se os metadados recebidos são um objeto válido com um ID
      if (metadata && typeof metadata === "object" && metadata.id) {
        // Armazena os metadados válidos no cache
        groupMetadataCache.set(jid, metadata);
        logger.debug(`[getGroupMetadata] Metadados buscados e cacheados para ${jid}`);
        return metadata; // Retorna os metadados buscados
      } else {
        // Loga um aviso se os dados retornados não forem válidos
        logger.warn(`[getGroupMetadata] client.groupMetadata retornou valor inválido ou sem ID para ${jid}. Retorno:`, metadata);
        return null; // Retorna null indicando falha ou dados inválidos
      }
    } catch (error) {
      // Trata erros durante a busca
      const statusCode = error.output?.statusCode;
      // Erros comuns indicando que o grupo não existe ou o bot não tem acesso
      if (statusCode === 404 || statusCode === 401 || statusCode === 403) {
        logger.warn(`[getGroupMetadata] Não foi possível buscar metadados para ${jid}. Grupo não encontrado, bot não é participante ou acesso proibido (Status: ${statusCode}).`);
      } else {
        // Loga erros inesperados
        logger.error(`[getGroupMetadata] Erro inesperado ao buscar metadados para ${jid}: ${error.message}`, { stack: error.stack });
      }
      return null; // Retorna null em caso de erro
    } finally {
      // Independentemente do resultado (sucesso ou erro), remove a Promise do Map de pendências
      pendingMetadataRequests.delete(jid);
      logger.debug(`[getGroupMetadata] Busca para ${jid} concluída. Removido das pendências.`);
    }
  })(); // A IIFE (Immediately Invoked Function Expression) é executada aqui

  // Armazena a Promise no Map de pendências ANTES de retorná-la
  pendingMetadataRequests.set(jid, fetchPromise);

  // Retorna a Promise (que pode já ter resolvido ou ainda estar em andamento)
  return fetchPromise;
};

/**
 * @function patchInteractiveMessage
 * @description Modifica uma mensagem interativa antes de ser enviada.
 * Envolve a mensagem original dentro de uma estrutura `viewOnceMessage` com `messageContextInfo`.
 * Isso pode ser necessário para garantir a compatibilidade ou o formato esperado pela API do WhatsApp
 * para certos tipos de mensagens interativas (como botões, listas).
 * Se a mensagem não for interativa (`message.interactiveMessage` não existe), ela é retornada sem modificações.
 *
 * @param {import('baileys').AnyMessageContent} message - O conteúdo da mensagem a ser potencialmente modificado.
 * @returns {import('baileys').AnyMessageContent} A mensagem modificada (se interativa) ou a original.
 */
const patchInteractiveMessage = message => {
  // Verifica se a mensagem possui a propriedade 'interactiveMessage'
  return message?.interactiveMessage
    ? // Se for interativa, envolve na estrutura 'viewOnceMessage'
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadataVersion: 2,
              deviceListMetadata: {},
            },
            // Inclui a mensagem original dentro da nova estrutura
            ...message,
          },
        },
      }
    : // Se não for interativa, retorna a mensagem original
      message;
};

/**
 * @function scheduleReconnect
 * @description Agenda uma tentativa de reconexão ao WhatsApp após uma desconexão inesperada.
 * Utiliza uma estratégia de backoff exponencial para calcular o atraso antes da próxima tentativa.
 * O atraso dobra a cada tentativa (`RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempts`),
 * mas é limitado pelo `RECONNECT_MAX_DELAY_MS`.
 * Incrementa o contador `reconnectAttempts` e agenda a chamada da função `connectToWhatsApp`
 * usando `setTimeout` com o atraso calculado.
 * @global Modifica `reconnectAttempts`.
 * @global Agenda a execução de `connectToWhatsApp`.
 */
const scheduleReconnect = () => {
  reconnectAttempts++; // Incrementa o contador de tentativas
  // Calcula o atraso: inicial * 2^tentativas, limitado pelo máximo
  const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS);

  logger.warn(`[ scheduleReconnect ] 🔌 Conexão perdida. Tentando reconectar em ${delay / 1000} segundos... (Tentativa ${reconnectAttempts})`);
  // Agenda a função connectToWhatsApp para ser executada após o 'delay' calculado
  setTimeout(connectToWhatsApp, delay);
};

/**
 * @async
 * @function handleConnectionUpdate
 * @description Callback para o evento 'connection.update' do Baileys. Gerencia as mudanças no estado da conexão.
 * - **QR Code:** Se um QR code é recebido (`qr`), loga a informação e reseta o contador de tentativas de reconexão.
 * - **Connecting:** Loga que a conexão está em andamento.
 * - **Open:** Loga que a conexão foi estabelecida com sucesso e reseta o contador de tentativas de reconexão.
 * - **Close:** Loga que a conexão foi fechada, incluindo a razão (se disponível). Verifica se a desconexão foi devido a 'loggedOut' (deslogado manualmente). Se não foi 'loggedOut', agenda uma reconexão (`scheduleReconnect`). Se foi 'loggedOut', loga um erro informando que a reconexão não é possível e que a pasta de autenticação deve ser removida.
 *
 * @param {Partial<import('baileys').ConnectionState>} update - O objeto de atualização do estado da conexão fornecido pelo Baileys. Contém propriedades como `connection`, `lastDisconnect`, `qr`.
 * @global Modifica `reconnectAttempts`.
 * @global Chama `scheduleReconnect` em caso de desconexão recuperável.
 */
const handleConnectionUpdate = async update => {
  // Extrai as propriedades relevantes do objeto de atualização
  const { connection, lastDisconnect, qr } = update;

  // Se um QR code foi recebido
  if (qr) {
    logger.info("[ handleConnectionUpdate ] 📱 QR Code recebido, escaneie por favor.");
    // Reseta o contador de tentativas, pois um novo QR indica uma nova sessão de autenticação
    reconnectAttempts = 0;
    logger.info("[ handleConnectionUpdate ] 🔄 Contador de tentativas de reconexão resetado devido a novo QR.");
  }

  // Se o estado da conexão é 'connecting'
  if (connection === "connecting") {
    logger.info("[ handleConnectionUpdate ] ⏳ Conectando ao WhatsApp...");
  }
  // Se a conexão foi estabelecida com sucesso
  else if (connection === "open") {
    logger.info("[ handleConnectionUpdate ] ✅ Conexão aberta com sucesso. Bot disponível.");
    // Reseta o contador de tentativas, pois a conexão foi bem-sucedida
    reconnectAttempts = 0;
  }
  // Se a conexão foi fechada
  else if (connection === "close") {
    // Obtém o código de status do erro da última desconexão, se existir
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    // Determina se deve tentar reconectar. Não reconecta se o motivo for 'loggedOut'.
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    // Loga o erro de fechamento da conexão, incluindo a razão (convertida para texto) e o código numérico
    logger.error(`[ handleConnectionUpdate ] ❌ Conexão fechada. Razão: ${DisconnectReason[statusCode] || "Desconhecida"} (Código: ${statusCode})`);

    // Se deve tentar reconectar
    if (shouldReconnect) {
      logger.info("[ handleConnectionUpdate ] 🔄 Tentando reconectar...");
      // Agenda a próxima tentativa de reconexão
      scheduleReconnect();
    } else {
      // Se foi deslogado, informa o usuário sobre a necessidade de remover a autenticação antiga
      logger.error("[ handleConnectionUpdate ] 🚫 Não foi possível reconectar: Deslogado. Exclua a pasta 'temp/auth_state' e reinicie para gerar um novo QR Code.");
      // Poderia adicionar `process.exit(1)` aqui se quisesse parar a aplicação automaticamente.
    }
  }
};

/**
 * @async
 * @function handleCredsUpdate
 * @description Callback para o evento 'creds.update' do Baileys. É chamado quando as credenciais de autenticação são atualizadas.
 * Salva as novas credenciais no armazenamento (gerenciado por `useMultiFileAuthState`).
 *
 * @param {() => Promise<void>} saveCreds - A função fornecida pelo `useMultiFileAuthState` para salvar as credenciais atualizadas.
 */
const handleCredsUpdate = async saveCreds => {
  try {
    // Chama a função para salvar as credenciais
    await saveCreds();
    logger.info("[ handleCredsUpdate ] 🔒 Credenciais salvas com sucesso.");
  } catch (error) {
    // Loga qualquer erro que ocorra durante o salvamento
    logger.error("[ handleCredsUpdate ] ❌ Erro ao salvar credenciais:", error);
  }
};

/**
 * @async
 * @function handleMessagesUpsert
 * @description Callback para o evento 'messages.upsert' do Baileys. É chamado quando novas mensagens são recebidas ou atualizadas.
 * Processa a primeira mensagem (`data.messages[0]`) do evento.
 * Valida a mensagem e, se válida, agenda seu processamento usando `setImmediate` para liberar o loop de eventos principal rapidamente.
 * A função agendada dentro do `setImmediate`:
 * 1. Loga o início do processamento diferido.
 * 2. Chama `processUserData` para salvar/atualizar informações do remetente e da mensagem no banco de dados.
 * 3. Se a mensagem for de um grupo (`endsWith("@g.us")`), loga essa informação.
 * 4. Chama `botController` para executar a lógica principal do bot (responder a comandos, etc.).
 * 5. Inclui tratamento de erros robusto para `processUserData` e `botController`, logando detalhes em caso de falha.
 * 6. Loga a conclusão do processamento diferido.
 *
 * @param {object} data - O objeto de dados do evento 'messages.upsert'. Contém um array `messages` e o `type` do evento.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys conectada.
 */
const handleMessagesUpsert = async (data, client) => {
  // Verifica se a instância do cliente é válida
  if (!client) {
    logger.error("[ handleMessagesUpsert ] ❌ Erro interno: Instância do cliente inválida em handleMessagesUpsert.");
    return;
  }

  // Pega a primeira mensagem do array (geralmente contém apenas uma)
  const msg = data.messages?.[0];

  // Valida se a mensagem, a chave e o conteúdo da mensagem existem
  if (!msg || !msg.key || !msg.message) {
    logger.debug("[ handleMessagesUpsert ] Mensagem inválida ou vazia recebida. Ignorando.");
    return; // Ignora mensagens inválidas ou de status
  }

  // Loga o recebimento e agendamento da mensagem
  logger.debug(`[ handleMessagesUpsert ] Recebida mensagem ${msg.key.id} de ${msg.key.remoteJid}. Agendando processamento via setImmediate...`);

  // Usa setImmediate para processar a mensagem fora do fluxo principal do evento
  // Isso evita bloquear o recebimento de novos eventos enquanto uma mensagem está sendo processada.
  // Passamos as variáveis necessárias como argumentos para a função de callback do setImmediate.
  setImmediate(
    async (deferredData, deferredClient, deferredMsg, groupMetaGetter) => {
      // Extrai IDs para logging dentro do callback diferido
      const messageIdForLog = deferredMsg.key.id;
      const remoteJidForLog = deferredMsg.key.remoteJid;
      logger.debug(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) Iniciando processamento agendado para ${remoteJidForLog}`);

      try {
        // Bloco try/catch específico para processUserData
        try {
          // Processa e salva dados do usuário/mensagem no banco de dados
          // Passa a função getGroupMetadata para que processUserData possa obter metadados se necessário
          await processUserData(deferredData, deferredClient, groupMetaGetter);
        } catch (error) {
          logger.error(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) ❌ Erro ao processar dados do usuário/mensagem (processUserData) para ${remoteJidForLog}: ${error.message}`, { stack: error.stack });
          // Retorna para evitar chamar botController se o processamento inicial falhar
          return;
        }

        // Verifica se a mensagem é de um grupo
        if (remoteJidForLog?.endsWith("@g.us")) {
          logger.debug(`[handleMessagesUpsert] (Deferred:${messageIdForLog}) Processando mensagem no grupo ${remoteJidForLog}.`);
          // Lógica específica para grupos pode ser adicionada aqui se necessário,
          // mas geralmente é tratada dentro do botController.
        }

        // Bloco try/catch específico para botController
        try {
          // Chama o controlador principal do bot para lidar com a mensagem
          await botController(deferredData, deferredClient);
        } catch (error) {
          // Tenta obter o tipo da mensagem para logging mais informativo
          const messageType = Object.keys(deferredMsg.message || {})[0] || "tipo desconhecido";
          logger.error(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) ❌ Erro em botController ao lidar com mensagem tipo '${messageType}' no JID ${remoteJidForLog}: ${error.message}`, {
            stack: error.stack,
          });
        }
      } catch (outerError) {
        // Captura erros inesperados que possam ocorrer fora dos try/catch internos
        logger.error(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) 💥 Erro crítico inesperado no processamento agendado para ${remoteJidForLog}: ${outerError.message}`, { stack: outerError.stack });
      } finally {
        // Loga a conclusão do processamento agendado, independentemente de sucesso ou falha
        logger.debug(`[ handleMessagesUpsert ] (Deferred:${messageIdForLog}) Processamento agendado concluído para ${remoteJidForLog}`);
      }
    },
    data, // Passa os dados originais do evento
    client, // Passa a instância do cliente
    msg, // Passa a mensagem específica
    getGroupMetadata // Passa a função de busca de metadados
  );
};

/**
 * @async
 * @function handleGroupsUpdate
 * @description Callback para o evento 'groups.update' do Baileys. Chamado quando metadados de um grupo são atualizados (ex: nome, descrição).
 * Itera sobre as atualizações recebidas. Para cada atualização com um ID de grupo válido:
 * 1. Tenta buscar os metadados mais recentes do grupo usando `client.groupMetadata`.
 * 2. Se a busca for bem-sucedida e os dados forem válidos, atualiza a entrada no `groupMetadataCache`.
 * 3. Se a busca falhar ou retornar dados inválidos, remove a entrada do grupo do cache para forçar uma nova busca na próxima vez.
 * 4. Loga informações sobre o processo e possíveis erros.
 *
 * @param {Array<Partial<GroupMetadata>>} updates - Um array de objetos contendo atualizações parciais dos metadados do grupo. Cada objeto geralmente contém pelo menos o `id` do grupo.
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys conectada.
 * @global Modifica `groupMetadataCache`.
 */
const handleGroupsUpdate = async (updates, client) => {
  // Verifica se a instância do cliente é válida
  if (!client) {
    logger.error("[ handleGroupsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupsUpdate.");
    return;
  }
  logger.info(`[ handleGroupsUpdate ] 🔄 Recebido ${updates.length} evento(s) de atualização de grupo.`);

  // Itera sobre cada evento de atualização recebido
  for (const event of updates) {
    const groupId = event.id; // Pega o ID do grupo do evento
    if (groupId) {
      logger.debug(`[ handleGroupsUpdate ] Atualizando metadados para o grupo ${groupId}`);
      try {
        // Busca os metadados mais recentes do grupo
        const metadata = await client.groupMetadata(groupId);

        // Verifica se os metadados são válidos
        if (metadata && typeof metadata === "object" && metadata.id) {
          // Atualiza o cache com os novos metadados
          groupMetadataCache.set(groupId, metadata);
          logger.debug(`[ handleGroupsUpdate ] Cache de metadados atualizado para ${groupId} (Subject: ${metadata.subject})`);
        } else {
          // Se os metadados não forem válidos, remove do cache para evitar dados inconsistentes
          groupMetadataCache.del(groupId);
          logger.warn(`[ handleGroupsUpdate ] ⚠️ Metadados inválidos ou não encontrados para ${groupId} após atualização. Removido do cache. Retorno:`, metadata);
        }
      } catch (error) {
        // Em caso de erro na busca, remove também do cache
        groupMetadataCache.del(groupId);
        const statusCode = error.output?.statusCode;
        // Trata erros conhecidos de acesso/existência do grupo
        if (statusCode === 404 || statusCode === 401 || statusCode === 403) {
          logger.warn(`[ handleGroupsUpdate ] Não foi possível buscar metadados para ${groupId} (Status: ${statusCode}). Removido do cache.`);
        } else {
          // Loga outros erros inesperados
          logger.error(`[ handleGroupsUpdate ] ❌ Erro ao buscar/cachear metadados do grupo ${groupId} em 'groups.update': ${error.message}`);
        }
      }
    } else {
      // Loga um aviso se um evento de atualização não tiver um ID de grupo
      logger.warn("[ handleGroupsUpdate ] Recebido evento de atualização de grupo sem JID.");
    }
  }
};

/**
 * @async
 * @function handleGroupParticipantsUpdate
 * @description Callback para o evento 'group-participants.update' do Baileys. Chamado quando participantes entram, saem, são promovidos ou demovidos de um grupo.
 * 1. Loga os detalhes do evento (ID do grupo, ação, participantes afetados).
 * 2. Tenta buscar os metadados atualizados do grupo para refletir a mudança de participantes.
 * 3. Atualiza ou remove a entrada do grupo no `groupMetadataCache` com base no sucesso da busca.
 * 4. Chama a função `processParticipantUpdate` (do `groupEventsController`) para lidar com a lógica específica do evento (ex: mensagem de boas-vindas/adeus, atualização no banco de dados). Passa o evento, o cliente e os metadados (se obtidos com sucesso).
 * 5. Loga erros que possam ocorrer durante a busca de metadados ou no processamento do evento.
 *
 * @param {import('baileys').GroupParticipantsUpdateData} event - O objeto de dados do evento. Contém `id` (JID do grupo), `participants` (array de JIDs dos usuários afetados) e `action` ('add', 'remove', 'promote', 'demote').
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys conectada.
 * @global Modifica `groupMetadataCache`.
 * @global Chama `processParticipantUpdate`.
 */
const handleGroupParticipantsUpdate = async (event, client) => {
  // Verifica se a instância do cliente é válida
  if (!client) {
    logger.error("[ handleGroupParticipantsUpdate ] ❌ Erro interno: Instância do cliente inválida em handleGroupParticipantsUpdate.");
    return;
  }
  const groupId = event.id; // ID do grupo afetado
  logger.info(`[ handleGroupParticipantsUpdate ] 👥 Evento recebido para grupo ${groupId}. Ação: ${event.action}. Participantes: ${event.participants.join(", ")}`);

  let metadata = null; // Variável para armazenar os metadados buscados

  // Tenta buscar e atualizar os metadados do grupo no cache
  try {
    metadata = await client.groupMetadata(groupId); // Busca metadados atualizados

    // Valida e atualiza o cache
    if (metadata && typeof metadata === "object" && metadata.id) {
      groupMetadataCache.set(groupId, metadata);
      logger.debug(`[ handleGroupParticipantsUpdate ] Cache de metadados atualizado para ${groupId}`);
    } else {
      // Remove do cache se inválido ou não encontrado
      groupMetadataCache.del(groupId);
      logger.warn(`[ handleGroupParticipantsUpdate ] Metadados inválidos ou não encontrados para ${groupId} para atualizar o cache. Removido do cache. Retorno:`, metadata);
      metadata = null; // Garante que metadados inválidos não sejam passados adiante
    }
  } catch (error) {
    // Em caso de erro na busca, remove do cache e loga o erro
    groupMetadataCache.del(groupId);
    const statusCode = error.output?.statusCode;
    if (statusCode === 404 || statusCode === 401 || statusCode === 403) {
      logger.warn(`[ handleGroupParticipantsUpdate ] Não foi possível buscar metadados para ${groupId} (Status: ${statusCode}). Removido do cache.`);
    } else {
      logger.error(`[ handleGroupParticipantsUpdate ] ❌ Erro ao buscar/cachear metadados após 'group-participants.update' para ${groupId}: ${error.message}`);
    }
    metadata = null; // Garante que metadados não sejam passados adiante em caso de erro
  }

  // Chama a função externa para processar o evento de participante
  try {
    // Passa o evento original, o cliente e os metadados (que podem ser null se a busca falhou)
    await processParticipantUpdate(event, client, metadata);
  } catch (error) {
    // Loga erros retornados pela função processadora
    logger.error(`[ handleGroupParticipantsUpdate ] ❌ Erro retornado pelo processador de evento (processParticipantUpdate) para ${groupId}: ${error.message}`, { stack: error.stack });
  }
};

/**
 * @function registerAllEventHandlers
 * @description Registra todos os callbacks (handlers) para os eventos relevantes do cliente Baileys.
 * Conecta cada evento (`connection.update`, `creds.update`, etc.) à sua respectiva função de tratamento (`handleConnectionUpdate`, `handleCredsUpdate`, etc.).
 * Inclui handlers para eventos adicionais como `contacts.upsert` e `chats.upsert` para logging informativo.
 *
 * @param {import('baileys').WASocket} client - A instância do cliente Baileys na qual registrar os handlers.
 * @param {() => Promise<void>} saveCreds - A função para salvar credenciais, necessária para o handler 'creds.update'.
 */
const registerAllEventHandlers = (client, saveCreds) => {
  // Evento de atualização do estado da conexão
  client.ev.on("connection.update", update => handleConnectionUpdate(update));
  // Evento de atualização das credenciais de autenticação
  client.ev.on("creds.update", () => handleCredsUpdate(saveCreds)); // Passa saveCreds diretamente
  // Evento de recebimento/atualização de mensagens
  client.ev.on("messages.upsert", data => handleMessagesUpsert(data, client));
  // Evento de atualização de metadados de grupos (nome, descrição, etc.)
  client.ev.on("groups.update", updates => handleGroupsUpdate(updates, client));
  // Evento de atualização de participantes em grupos (entrada, saída, promoção, etc.)
  client.ev.on("group-participants.update", event => handleGroupParticipantsUpdate(event, client));

  // --- Handlers Adicionais (Opcionais/Informativos) ---
  // Evento de atualização de contatos
  client.ev.on("contacts.upsert", contacts => {
    logger.info(`[ registerAllEventHandlers ] 📞 Evento 'contacts.upsert': ${contacts.length} contato(s) atualizado(s).`);
    // Poderia adicionar lógica para salvar/atualizar contatos no DB aqui
  });
  // Evento de atualização de chats
  client.ev.on("chats.upsert", chats => {
    logger.debug(`[ registerAllEventHandlers ] 💬 Evento 'chats.upsert': ${chats.length} chat(s) atualizado(s).`);
    // Poderia adicionar lógica para salvar/atualizar informações de chats no DB aqui
  });

  // Outros eventos Baileys podem ser registrados aqui conforme necessário
  // Ex: 'presence.update', 'messages.update', 'message-receipt.update', etc.
};

/**
 * @async
 * @function connectToWhatsApp
 * @description Função principal para iniciar a conexão com o WhatsApp usando Baileys.
 * 1. Configura e inicializa o estado de autenticação usando `useMultiFileAuthState`, que salva/lê credenciais do diretório `AUTH_STATE_PATH`.
 * 2. Cria a instância do socket Baileys (`makeWASocket`) com configurações:
 *    - `auth`: O estado de autenticação.
 *    - `logger`: Logger pino (nível 'debug' se `DEBUG_BAILEYS=true`, senão 'silent').
 *    - `printQRInTerminal`: Exibe o QR code no terminal, se necessário.
 *    - `mobile`: `false` para simular um navegador desktop.
 *    - `browser`: Define o User-Agent do navegador simulado.
 *    - `syncFullHistory`: Sincroniza todo o histórico de mensagens (se `SYNC_FULL_HISTORY=true`).
 *    - `msgRetryCounterMap`: Objeto para controle de retentativas de envio (opcional).
 *    - `cachedGroupMetadata`: Função para fornecer metadados de grupo cacheados ao Baileys (usa `groupMetadataCache`).
 *    - `patchMessageBeforeSending`: Função para modificar mensagens antes do envio (usa `patchInteractiveMessage`).
 * 3. Armazena a instância criada em `clientInstance`.
 * 4. Registra todos os handlers de evento usando `registerAllEventHandlers`.
 * 5. Retorna a instância do cliente criada.
 * 6. Em caso de erro crítico durante a inicialização, loga o erro e agenda uma reconexão.
 *
 * @returns {Promise<import('baileys').WASocket | null>} Uma Promise que resolve com a instância do cliente Baileys conectada (`WASocket`) ou `null` se ocorrer um erro crítico na inicialização.
 * @global Define `clientInstance`.
 * @global Chama `registerAllEventHandlers`.
 * @global Chama `scheduleReconnect` em caso de erro na inicialização.
 */
const connectToWhatsApp = async () => {
  try {
    logger.info(`[ connectToWhatsApp ] 🔒 Usando diretório de estado de autenticação: ${AUTH_STATE_PATH}`);
    // Inicializa o estado de autenticação, lendo/criando arquivos no diretório especificado
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_PATH);

    logger.info("[ connectToWhatsApp ] 🌐 Iniciando a conexão com o WhatsApp...");

    // Cria a instância do socket Baileys com as configurações desejadas
    clientInstance = makeWASocket({
      auth: state, // Fornece o estado de autenticação
      // Configura o logger interno do Baileys (pode ser 'debug' para mais detalhes ou 'silent' para menos)
      logger: pino({ level: process.env.DEBUG_BAILEYS === "true" ? "debug" : "silent" }),
      printQRInTerminal: true, // Mostra o QR code no terminal
      mobile: false, // Simula um cliente não-móvel (WhatsApp Web/Desktop)
      browser: Browsers.macOS("Desktop"), // Define o User Agent para simular macOS Desktop
      // Sincroniza o histórico completo se a variável de ambiente estiver definida
      syncFullHistory: process.env.SYNC_FULL_HISTORY === "true",
      // Mapa para controle de retentativas de envio de mensagens (opcional)
      msgRetryCounterMap: {},
      // Fornece uma função para buscar metadados de grupo cacheados
      // Baileys usará isso antes de tentar buscar via `client.groupMetadata` internamente
      cachedGroupMetadata: async jid => {
        const cached = groupMetadataCache.get(jid);
        // logger.trace(`[Baileys Cache Getter] Cache ${cached ? 'hit' : 'miss'} para ${jid}`);
        return cached; // Retorna o valor do cache (pode ser undefined)
      },
      // Aplica o patch para mensagens interativas antes de serem enviadas
      patchMessageBeforeSending: patchInteractiveMessage,
      // Outras opções podem ser adicionadas aqui, como `connectTimeoutMs`, `keepAliveIntervalMs`, etc.
    });

    // Registra todos os handlers de evento para a instância do cliente criada
    registerAllEventHandlers(clientInstance, saveCreds);

    // Retorna a instância do cliente criada com sucesso
    return clientInstance;
  } catch (error) {
    // Captura erros críticos que podem ocorrer durante a inicialização do makeWASocket
    logger.error(`[ connectToWhatsApp ] 🔴 Erro crítico ao iniciar a conexão com o WhatsApp: ${error.message}`, {
      stack: error.stack, // Inclui o stack trace para depuração
    });
    // Tenta agendar uma reconexão mesmo em caso de falha na inicialização
    scheduleReconnect();
    // Retorna null para indicar que a conexão não pôde ser estabelecida
    return null;
  }
};

/**
 * @async
 * @function initializeApp
 * @description Função principal de inicialização da aplicação.
 * Executa as etapas necessárias em sequência antes de iniciar a conexão com o WhatsApp:
 * 1. Inicializa o pool de conexões com o banco de dados (`initDatabase`).
 * 2. Verifica e cria as tabelas necessárias no banco de dados (`createTables`).
 * 3. Inicia a conexão com o WhatsApp (`connectToWhatsApp`).
 * Em caso de falha crítica em qualquer uma dessas etapas, loga o erro e encerra o processo (`process.exit(1)`).
 */
const initializeApp = async () => {
  try {
    logger.info("[ initializeApp ] 🚀 Iniciando a aplicação...");

    // 1. Inicializa a conexão com o banco de dados
    await initDatabase();
    logger.info("[ initializeApp ] 💾 Pool de conexões do banco de dados inicializado.");

    // 2. Garante que as tabelas necessárias existam no banco de dados
    await createTables();
    logger.info("[ initializeApp ] 📊 Tabelas do banco de dados verificadas/criadas.");

    // 3. Inicia a conexão com o WhatsApp
    // A função connectToWhatsApp cuidará do registro dos handlers e da lógica de reconexão.
    await connectToWhatsApp();
    // Não precisamos necessariamente esperar aqui, pois a conexão pode levar tempo
    // e os handlers de evento cuidarão do estado 'open'.
  } catch (error) {
    // Captura erros críticos durante a inicialização (ex: falha ao conectar ao DB)
    logger.error(`[ initializeApp ] 💥 Falha crítica durante a inicialização da aplicação: ${error.message}`, {
      stack: error.stack,
    });
    // Encerra a aplicação em caso de falha crítica na inicialização
    process.exit(1);
  }
};

// Inicia a aplicação chamando a função de inicialização.
initializeApp();

/**
 * @module connection
 * @description Exporta funções úteis relacionadas à conexão e ao cliente Baileys.
 */
module.exports = {
  /**
   * @function getClientInstance
   * @description Retorna a instância atual do cliente Baileys (`WASocket`).
   * Permite que outros módulos acessem o cliente conectado para enviar mensagens, buscar dados, etc.
   * @returns {import('baileys').WASocket | null} A instância do cliente Baileys ou `null` se ainda não estiver conectada.
   * @global Lê `clientInstance`.
   */
  getClientInstance: () => clientInstance,

  /**
   * @function getGroupMetadata
   * @description Re-exporta a função `getGroupMetadata` para que possa ser usada por outros módulos
   * que precisam buscar metadados de grupo de forma eficiente (com cache e tratamento de requisições pendentes).
   * @param {string} jid - O JID do grupo.
   * @param {import('baileys').WASocket} client - A instância do cliente Baileys.
   * @returns {Promise<GroupMetadata | null>} Promise com os metadados ou null.
   */
  getGroupMetadata, // Exporta a função local getGroupMetadata
};
