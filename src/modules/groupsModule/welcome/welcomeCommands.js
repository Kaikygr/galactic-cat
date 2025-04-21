/**
 * @fileoverview Comandos para gerenciar as configurações de boas-vindas e saída de grupos.
 * Este módulo define as funções que lidam com os comandos do usuário (ex: !welcome, !setwelcome)
 * para ativar/desativar mensagens de boas-vindas/saída, definir textos personalizados e
 * configurar URLs de mídia para essas mensagens. Ele utiliza funções de um módulo
 * processador (`processWelcome`) para interagir com o banco de dados ou estado da aplicação.
 * @requires path - Módulo Node.js para lidar com caminhos de arquivo.
 * @requires ../../../config/options.json - Arquivo de configuração do bot (prefixo, etc.).
 * @requires ../../../utils/logger - Módulo de logging para registrar informações e erros.
 * @requires ./processWelcome - Funções de processamento das configurações de boas-vindas/saída no DB.
 */

const path = require("path");
// Carrega as configurações do bot, como o prefixo dos comandos.
const config = require(path.join(__dirname, "../../../config/options.json"));
// Módulo de logging para registrar eventos e erros.
const logger = require("../../../utils/logger");
// Módulo que contém a lógica para interagir com o banco de dados e atualizar as configurações de welcome/exit.
const welcomeProcessor = require("./processWelcome"); // Já usa as funções refatoradas
// Define o prefixo primário dos comandos, buscando do arquivo de configuração ou usando '!' como padrão.
const primaryPrefix = config.bot?.globalSettings?.prefix?.[0] || "!";

// --- Funções Auxiliares ---

/**
 * Verifica se uma string é uma URL HTTP/HTTPS válida.
 * Utiliza a API nativa `URL` do Node.js para tentar parsear a string.
 *
 * @param {string} string - A string a ser verificada.
 * @returns {boolean} Retorna `true` se a string for uma URL HTTP ou HTTPS válida, `false` caso contrário.
 * @example
 * isValidHttpUrl("https://example.com"); // true
 * isValidHttpUrl("http://localhost:3000"); // true
 * isValidHttpUrl("ftp://example.com"); // false
 * isValidHttpUrl("not a url"); // false
 */
const isValidHttpUrl = string => {
  let url;
  try {
    // Tenta criar um objeto URL. Se falhar (lançar exceção), a string não é uma URL válida.
    url = new URL(string);
  } catch (_) {
    return false; // Captura a exceção e retorna false.
  }
  // Verifica se o protocolo da URL é 'http:' ou 'https:'.
  return url.protocol === "http:" || url.protocol === "https:";
};

/**
 * Envia uma reação (emoji) a uma mensagem específica no chat.
 * Encapsula a chamada da API do cliente para facilitar o uso e adicionar tratamento de erro.
 *
 * @async
 * @param {object} client - A instância do cliente WhatsApp (ex: Baileys). Deve ter o método `sendMessage`.
 * @param {string} from - O JID (ID) do chat onde a mensagem original está.
 * @param {object} key - A chave da mensagem original à qual a reação será adicionada.
 * @param {string} reaction - O emoji a ser enviado como reação.
 * @returns {Promise<void>} Uma promessa que resolve quando a reação é enviada ou falha.
 * @example
 * await _sendReaction(client, 'group@g.us', messageInfo.key, '✅');
 */
const _sendReaction = async (client, from, key, reaction) => {
  try {
    // Chama o método do cliente para enviar a reação.
    await client.sendMessage(from, { react: { text: reaction, key } });
  } catch (reactError) {
    // Registra um aviso se o envio da reação falhar, mas não interrompe o fluxo principal.
    logger.warn(`[WelcomeCommands] Falha ao enviar reação "${reaction}" para ${from}: ${reactError.message}`);
  }
};

/**
 * Envia uma atualização de presença (status como "digitando...", "gravando áudio...", etc.) para o chat.
 * Útil para fornecer feedback visual ao usuário enquanto o bot processa um comando.
 *
 * @async
 * @param {object} client - A instância do cliente WhatsApp (ex: Baileys). Deve ter o método `sendPresenceUpdate`.
 * @param {string} from - O JID (ID) do chat para o qual a presença será atualizada.
 * @param {'composing' | 'paused' | 'recording' | 'available' | 'unavailable'} status - O status de presença a ser enviado.
 * @returns {Promise<void>} Uma promessa que resolve quando a atualização é enviada ou falha.
 * @example
 * await _sendPresenceUpdate(client, 'user@s.whatsapp.net', 'composing'); // Mostra "digitando..."
 * await _sendPresenceUpdate(client, 'user@s.whatsapp.net', 'paused'); // Limpa o status
 */
const _sendPresenceUpdate = async (client, from, status) => {
  try {
    // Chama o método do cliente para atualizar a presença.
    await client.sendPresenceUpdate(status, from);
  } catch (presenceError) {
    // Registra um aviso se a atualização de presença falhar.
    logger.warn(`[WelcomeCommands] Falha ao enviar presence update "${status}" para ${from}: ${presenceError.message}`);
  }
};

/**
 * Verifica se o comando foi executado dentro de um grupo e se o remetente é um administrador do grupo.
 * Esta função é essencial para garantir que apenas administradores possam modificar as configurações do grupo.
 * Se as condições não forem atendidas, envia mensagens de erro informativas e reações apropriadas ao usuário.
 *
 * @async
 * @param {object} client - A instância do cliente WhatsApp.
 * @param {object} info - O objeto de informações da mensagem recebida (contém `key`, `sender`, etc.).
 * @param {string} from - O JID (ID) do chat onde o comando foi recebido.
 * @param {boolean} isGroup - Indica se a mensagem veio de um grupo (`true`) ou chat privado (`false`).
 * @param {boolean} isGroupAdmin - Indica se o remetente da mensagem é administrador do grupo (`true`) ou não (`false`).
 * @param {number} expirationMessage - A duração (em segundos) para mensagens efêmeras (se aplicável).
 * @param {string} commandName - O nome do comando (ex: "!welcome") para incluir nas mensagens de erro.
 * @returns {Promise<boolean>} Retorna `true` se o remetente for um administrador dentro de um grupo, `false` caso contrário.
 */
const _ensureGroupAdmin = async (client, info, from, isGroup, isGroupAdmin, expirationMessage, commandName) => {
  // Verifica se a mensagem NÃO veio de um grupo.
  if (!isGroup) {
    // Envia uma reação de aviso.
    await _sendReaction(client, from, info.key, "⚠️");
    // Envia uma mensagem explicando que o comando só funciona em grupos.
    await client.sendMessage(
      from,
      {
        text: `Olá! 👋 O comando \`${commandName}\` foi feito especialmente para gerenciar as configurações de grupos. Por favor, use-o dentro do grupo que deseja configurar.`,
      },
      // Responde à mensagem original e aplica a expiração, se houver.
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
    // Retorna false, indicando que a verificação falhou.
    return false;
  }

  // Verifica se a mensagem veio de um grupo, mas o remetente NÃO é administrador.
  if (!isGroupAdmin) {
    // Registra um aviso no log.
    logger.warn(`[${commandName}] Usuário ${info.sender.id} tentou usar o comando em ${from} mas não é admin.`);
    // Envia uma reação de "protegido" ou "não permitido".
    await _sendReaction(client, from, info.key, "🛡️");
    // Envia uma mensagem explicando que apenas administradores podem usar o comando.
    await client.sendMessage(
      from,
      {
        text: `Para garantir que apenas pessoas autorizadas modifiquem as configurações do grupo, o comando \`${commandName}\` só pode ser usado por administradores. 🛡️`,
      },
      // Responde à mensagem original e aplica a expiração, se houver.
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
    // Retorna false, indicando que a verificação falhou.
    return false;
  }
  // Se passou pelas duas verificações, significa que é um admin em um grupo.
  return true;
};

/**
 * Função genérica e reutilizável para executar a lógica principal de um comando de boas-vindas/saída.
 * Esta função abstrai o fluxo comum:
 * 1. Verificar permissões (admin de grupo).
 * 2. Validar os argumentos do comando.
 * 3. Enviar feedback de processamento (reação, "digitando...").
 * 4. Chamar a função de processamento apropriada (que interage com o DB/estado).
 * 5. Enviar feedback de sucesso ou erro (reação, mensagem).
 * 6. Limpar o status de presença ("digitando...").
 *
 * @async
 * @param {object} options - Um objeto contendo todas as opções necessárias para a execução.
 * @param {object} options.client - A instância do cliente WhatsApp.
 * @param {object} options.info - O objeto de informações da mensagem original.
 * @param {string} options.from - O JID do chat (ID do grupo).
 * @param {string} options.sender - O JID do remetente do comando.
 * @param {string} options.text - Os argumentos fornecidos ao comando (o texto após o nome do comando).
 * @param {number} options.expirationMessage - A duração para mensagens efêmeras.
 * @param {boolean} options.isGroup - Flag indicando se a mensagem veio de um grupo.
 * @param {boolean} options.isGroupAdmin - Flag indicando se o remetente é admin.
 * @param {string} options.commandName - O nome completo do comando (ex: "!welcome"). Usado em mensagens.
 * @param {string} options.actionName - Um nome descritivo da ação sendo executada (ex: "setWelcomeStatus"). Usado para logging.
 * @param {Function} options.validationFn - Uma função que recebe `options.text` (os argumentos do comando). Ela deve:
 *   - Validar e processar o input.
 *   - Retornar o valor pronto para ser passado à `processorFn`.
 *   - Lançar um `Error` com uma mensagem amigável para o usuário se a validação falhar.
 * @param {Function} options.processorFn - A função assíncrona do `welcomeProcessor` que efetivamente realiza a ação (ex: `welcomeProcessor.setWelcomeStatus`). Espera receber `groupId` e o valor retornado por `validationFn`.
 * @param {Function} options.successMessageFn - Uma função que recebe o valor processado (o mesmo passado para `processorFn`) e retorna a string da mensagem de sucesso a ser enviada ao usuário.
 * @param {string} options.errorMessageText - O texto da mensagem de erro genérica a ser enviada ao usuário se `processorFn` falhar.
 * @returns {Promise<void>} Uma promessa que resolve após a conclusão do fluxo do comando.
 */
const _executeWelcomeCommandLogic = async ({ client, info, from, sender, text, expirationMessage, isGroup, isGroupAdmin, commandName, actionName, validationFn, processorFn, successMessageFn, errorMessageText }) => {
  // O ID do grupo é o mesmo JID de onde a mensagem veio.
  const groupId = from;

  // 1. Verificar permissões (Admin em Grupo)
  const isAdminInGroup = await _ensureGroupAdmin(client, info, from, isGroup, isGroupAdmin, expirationMessage, commandName);
  // Se a verificação falhar, a função _ensureGroupAdmin já enviou a mensagem de erro, então apenas retornamos.
  if (!isAdminInGroup) {
    return;
  }

  // Variável para armazenar o valor validado a ser definido.
  let valueToSet;
  try {
    // 2. Validar os argumentos do comando usando a função fornecida.
    valueToSet = validationFn(text);
  } catch (validationError) {
    // Se a validação lançar um erro, captura-o.
    logger.warn(`[${actionName}] Falha na validação para ${groupId} por ${sender}: ${validationError.message}`);
    // Envia reação de "pensando" ou "confuso".
    await _sendReaction(client, from, info.key, "🤔");
    // Envia a mensagem de erro da exceção (que deve ser amigável).
    await client.sendMessage(from, { text: validationError.message }, { quoted: info, ephemeralExpiration: expirationMessage });
    // Interrompe a execução do comando.
    return;
  }

  // 3. Enviar feedback de processamento inicial.
  await _sendReaction(client, from, info.key, "⏳"); // Reação de "processando".
  await _sendPresenceUpdate(client, from, "composing"); // Mostra "digitando...".

  try {
    // 4. Chamar a função de processamento principal (interação com DB/estado).
    await processorFn(groupId, valueToSet);
    // Loga o sucesso da operação.
    logger.info(`[${actionName}] Ação para ${groupId} executada com sucesso por ${sender}. Valor: ${JSON.stringify(valueToSet)}`);

    // 5. Enviar feedback de sucesso.
    // Gera a mensagem de sucesso usando a função fornecida.
    const successMessage = successMessageFn(valueToSet);
    await _sendReaction(client, from, info.key, "✅"); // Reação de sucesso.
    // Envia a mensagem de sucesso.
    await client.sendMessage(from, { text: successMessage }, { quoted: info, ephemeralExpiration: expirationMessage });
  } catch (error) {
    // Se a função `processorFn` lançar um erro (ex: falha no DB).
    logger.error(`[${actionName}] Erro ao processar para ${groupId}: ${error.message}`, { stack: error.stack });
    // 5. Enviar feedback de erro.
    await _sendReaction(client, from, info.key, "❌"); // Reação de erro.
    // Envia a mensagem de erro genérica definida para este comando.
    await client.sendMessage(from, { text: errorMessageText }, { quoted: info, ephemeralExpiration: expirationMessage });
  } finally {
    // 6. Limpar o status de presença, independentemente de sucesso ou falha.
    await _sendPresenceUpdate(client, from, "paused");
  }
};

// --- Funções Handler de Comandos Específicos ---

/**
 * Manipula o comando para ativar ou desativar as mensagens de boas-vindas e saída.
 * Comando: !welcome [on|off|ativar|desativar|1|0]
 *
 * @async
 * @param {object} client - Instância do cliente WhatsApp.
 * @param {object} info - Objeto de informações da mensagem.
 * @param {string} sender - JID do remetente.
 * @param {string} from - JID do chat (grupo).
 * @param {string} text - Argumentos do comando (ex: "on", "off").
 * @param {number} expirationMessage - Duração da mensagem efêmera.
 * @param {boolean} isGroup - Se a mensagem veio de um grupo.
 * @param {boolean} isGroupAdmin - Se o remetente é admin do grupo.
 * @returns {Promise<void>}
 */
async function handleWelcomeToggleCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin) {
  // Define o nome do comando para mensagens e logs.
  const commandName = `${primaryPrefix}welcome`;
  // Define o nome da ação para logs.
  const actionName = "setWelcomeStatus";

  /**
   * Função de validação para o comando !welcome.
   * Verifica se o argumento é uma das opções válidas (on, off, etc.) e retorna o booleano correspondente.
   * Lança um erro com instruções de uso se o argumento for inválido.
   * @param {string} inputText - O texto do argumento.
   * @returns {boolean} `true` para ativar, `false` para desativar.
   * @throws {Error} Se o argumento for inválido.
   */
  const validationFn = inputText => {
    const argument = inputText.trim().toLowerCase();
    // Verifica as opções para ATIVAR.
    if (argument === "on" || argument === "ativar" || argument === "1") {
      return true;
    }
    // Verifica as opções para DESATIVAR.
    if (argument === "off" || argument === "desativar" || argument === "0") {
      return false;
    }
    // Se não for nenhuma das opções válidas, lança um erro com a mensagem de ajuda.
    throw new Error(`Hmm, parece que o comando não foi usado corretamente. 🤔 Para ativar ou desativar as mensagens de boas-vindas e saída, use:\n\n➡️ \`${commandName} on\` (para ativar)\n➡️ \`${commandName} off\` (para desativar)`);
  };

  /**
   * Função para gerar a mensagem de sucesso para o comando !welcome.
   * Informa o novo status e dá dicas sobre como personalizar as mensagens.
   * @param {boolean} enabled - O novo status (true se ativado, false se desativado).
   * @returns {string} A mensagem de sucesso formatada.
   */
  const successMessageFn = enabled => {
    // Define a parte da mensagem que indica o status (ativadas/desativadas).
    const statusMsg = enabled ? "ativadas" : "desativadas";
    // Define uma explicação sobre o que acontece agora.
    const explanation = enabled ? "Agora, novos membros serão recebidos e membros que saírem terão uma despedida automática!" : `As mensagens automáticas não serão mais enviadas. 🔇\n\n*Importante:* Suas configurações personalizadas de texto e mídia foram mantidas, mas serão ignoradas enquanto este recurso estiver desativado. Elas voltarão a ser usadas se você reativar com \`${commandName} on\`.`;

    // Define um texto de ajuda sobre como personalizar as mensagens (texto e mídia).
    const customizationInfo =
      `\n\n✨ *Quer personalizar ainda mais?*` +
      `\nUse os comandos abaixo para definir textos e mídias específicas:` +
      `\n- \`${primaryPrefix}setwelcome <mensagem>\`: Define o texto de boas-vindas.` +
      `\n- \`${primaryPrefix}setwelcomemedia <url>\`: Adiciona imagem/vídeo às boas-vindas.` +
      `\n- \`${primaryPrefix}setexit <mensagem>\`: Define o texto de despedida.` +
      `\n- \`${primaryPrefix}setexitmedia <url>\`: Adiciona imagem/vídeo à despedida.` +
      // Explica os placeholders disponíveis para usar nas mensagens.
      `\n\n💡 *Dica de Personalização (Placeholders):*` +
      `\nNas mensagens (\`${primaryPrefix}setwelcome\` e \`${primaryPrefix}setexit\`), você pode usar:` +
      `\n  • \`{user}\`: Menção (@) do membro.` +
      `\n  • \`{groupName}\`: Nome do grupo.` +
      `\n  • \`{desc}\`: Descrição do grupo.` +
      `\n  • \`{size}\`: Número de participantes.` +
      `\n  • \`{createdAt}\`: Data de criação (DD/MM/AAAA).` +
      `\n  • \`{ownerNumber}\`: Número do criador.` +
      `\n\n*Exemplo:* \`${primaryPrefix}setwelcome Olá {user}, bem-vindo(a) ao {groupName}!\`` +
      `\n\nLembre-se que estas personalizações só terão efeito se as mensagens estiverem ativadas (\`${commandName} on\`). 😉`;

    // Monta a mensagem final.
    return `✅ Prontinho! As mensagens automáticas de boas-vindas e saída para este grupo foram ${statusMsg}. 🎉\n\n${explanation}${customizationInfo}`;
  };

  // Define a mensagem de erro genérica para falhas no processamento deste comando.
  const errorMessageText = "❌ Ops! Algo deu errado ao tentar atualizar o status das mensagens de boas-vindas/saída. 😥 Por favor, tente novamente em alguns instantes. Se o problema persistir, entre em contato com o suporte.";

  // Chama a função genérica de execução com todas as configurações específicas para este comando.
  await _executeWelcomeCommandLogic({
    client,
    info,
    from,
    sender,
    text,
    expirationMessage,
    isGroup,
    isGroupAdmin,
    commandName,
    actionName,
    validationFn, // Função de validação específica
    processorFn: welcomeProcessor.setWelcomeStatus, // Função do processador para definir o status
    successMessageFn, // Função de mensagem de sucesso específica
    errorMessageText, // Mensagem de erro específica
  });
}

/**
 * Manipula o comando para definir a mensagem de boas-vindas personalizada.
 * Comando: !setwelcome [mensagem de boas-vindas | (vazio para limpar)]
 *
 * @async
 * @param {object} client - Instância do cliente WhatsApp.
 * @param {object} info - Objeto de informações da mensagem.
 * @param {string} sender - JID do remetente.
 * @param {string} from - JID do chat (grupo).
 * @param {string} text - Argumentos do comando (a mensagem de boas-vindas).
 * @param {number} expirationMessage - Duração da mensagem efêmera.
 * @param {boolean} isGroup - Se a mensagem veio de um grupo.
 * @param {boolean} isGroupAdmin - Se o remetente é admin do grupo.
 * @returns {Promise<void>}
 */
async function handleSetWelcomeMessageCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin) {
  const commandName = `${primaryPrefix}setwelcome`;
  const actionName = "setWelcomeMessage";

  /**
   * Função de validação para o comando !setwelcome.
   * Remove espaços extras e retorna a mensagem ou null se vazia (para limpar).
   * Lança erro se a mensagem contiver apenas espaços.
   * @param {string} inputText - O texto da mensagem fornecida.
   * @returns {string | null} A mensagem trimada ou null para limpar a configuração.
   * @throws {Error} Se a mensagem for inválida (apenas espaços).
   */
  const validationFn = inputText => {
    // Remove espaços do início e fim.
    const welcomeMessage = inputText.trim();
    // Verifica se o input original tinha algo, mas após trim ficou vazio (só espaços).
    if (inputText.length > 0 && welcomeMessage.length === 0) {
      throw new Error(`🤔 Parece que você tentou definir uma mensagem, mas ela continha apenas espaços em branco. Por favor, forneça um texto válido.\n\n*Exemplo:* \`${commandName} Olá {user}!\`\n\nPara remover a mensagem personalizada atual (usar a padrão), use o comando sem nenhum texto após ele: \`${commandName}\``);
    }
    // Retorna a mensagem trimada, ou null se o input original já era vazio (intenção de limpar).
    return welcomeMessage || null;
  };

  /**
   * Função para gerar a mensagem de sucesso para o comando !setwelcome.
   * Confirma a atualização ou remoção da mensagem personalizada.
   * @param {string | null} message - A mensagem que foi definida (ou null se foi removida).
   * @returns {string} A mensagem de sucesso formatada.
   */
  const successMessageFn = message => {
    // Se uma mensagem foi definida...
    if (message) {
      return `✅ Mensagem de boas-vindas atualizada! 🎉 Agora, quando alguém entrar (e as boas-vindas estiverem ativadas), receberá:\n\n_"${message}"_\n\n✨ *Lembre-se dos placeholders:* \`{user}\`, \`{groupName}\`, \`{desc}\`, \`{size}\`, \`{createdAt}\`, \`{ownerNumber}\``;
    } else {
      // Se a mensagem foi removida (definida como null).
      return `✅ A mensagem de boas-vindas personalizada foi removida. O sistema voltará a usar a mensagem padrão (se as boas-vindas estiverem ativadas). Para definir uma nova, use \`${commandName} Sua nova mensagem aqui\`.`;
    }
  };

  // Mensagem de erro genérica para este comando.
  const errorMessageText = "❌ Que pena! Não consegui salvar a nova mensagem de boas-vindas. 😥 Tente novamente, por favor. Se o erro continuar, fale com o suporte.";

  // Chama a função genérica de execução.
  await _executeWelcomeCommandLogic({
    client,
    info,
    from,
    sender,
    text,
    expirationMessage,
    isGroup,
    isGroupAdmin,
    commandName,
    actionName,
    validationFn,
    processorFn: welcomeProcessor.setWelcomeMessage, // Função do processador para definir a mensagem
    successMessageFn,
    errorMessageText,
  });
}

/**
 * Manipula o comando para definir a URL da mídia (imagem/vídeo) de boas-vindas.
 * Comando: !setwelcomemedia [URL da mídia | (vazio para limpar)]
 *
 * @async
 * @param {object} client - Instância do cliente WhatsApp.
 * @param {object} info - Objeto de informações da mensagem.
 * @param {string} sender - JID do remetente.
 * @param {string} from - JID do chat (grupo).
 * @param {string} text - Argumentos do comando (a URL da mídia).
 * @param {number} expirationMessage - Duração da mensagem efêmera.
 * @param {boolean} isGroup - Se a mensagem veio de um grupo.
 * @param {boolean} isGroupAdmin - Se o remetente é admin do grupo.
 * @returns {Promise<void>}
 */
async function handleSetWelcomeMediaCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin) {
  const commandName = `${primaryPrefix}setwelcomemedia`;
  const actionName = "setWelcomeMedia";

  /**
   * Função de validação para o comando !setwelcomemedia.
   * Verifica se a URL fornecida é uma URL HTTP/HTTPS válida.
   * Retorna a URL trimada ou null se vazia (para limpar).
   * @param {string} inputText - O texto da URL fornecida.
   * @returns {string | null} A URL validada e trimada, ou null para limpar.
   * @throws {Error} Se a URL for inválida.
   */
  const validationFn = inputText => {
    const mediaUrl = inputText.trim();
    // Se uma URL foi fornecida, mas não é válida...
    if (mediaUrl && !isValidHttpUrl(mediaUrl)) {
      throw new Error(`❌ A URL fornecida não parece válida. 🤔 Certifique-se de que ela começa com \`http://\` ou \`https://\` e leva diretamente para uma imagem ou vídeo (ex: \`https://site.com/imagem.jpg\`).\n\nPara remover a mídia atual, use o comando sem nenhuma URL: \`${commandName}\``);
    }
    // Retorna a URL trimada, ou null se o input era vazio.
    return mediaUrl || null;
  };

  /**
   * Função para gerar a mensagem de sucesso para o comando !setwelcomemedia.
   * Confirma a configuração ou remoção da URL da mídia.
   * @param {string | null} url - A URL que foi definida (ou null se foi removida).
   * @returns {string} A mensagem de sucesso formatada.
   */
  const successMessageFn = url => {
    // Se uma URL foi definida...
    if (url) {
      return `✅ Mídia de boas-vindas configurada! 🖼️ A imagem/vídeo da URL fornecida será enviada junto com a mensagem de boas-vindas (se as boas-vindas estiverem ativadas).\n\n*Importante:* A URL deve ser pública e direta para o arquivo de mídia.`;
    } else {
      // Se a URL foi removida.
      return `✅ Mídia de boas-vindas removida. Apenas a mensagem de texto será enviada agora (se as boas-vindas estiverem ativadas).`;
    }
  };

  // Mensagem de erro genérica para este comando.
  const errorMessageText = "❌ Ah, não! Algo impediu de salvar a URL da mídia de boas-vindas. 😥 Por favor, tente novamente. Verifique se a URL está correta e acessível publicamente. Se o erro persistir, contate o suporte.";

  // Chama a função genérica de execução.
  await _executeWelcomeCommandLogic({
    client,
    info,
    from,
    sender,
    text,
    expirationMessage,
    isGroup,
    isGroupAdmin,
    commandName,
    actionName,
    validationFn,
    processorFn: welcomeProcessor.setWelcomeMedia, // Função do processador para definir a mídia
    successMessageFn,
    errorMessageText,
  });
}

/**
 * Manipula o comando para definir a mensagem de saída personalizada.
 * Comando: !setexit [mensagem de saída | (vazio para limpar)]
 *
 * @async
 * @param {object} client - Instância do cliente WhatsApp.
 * @param {object} info - Objeto de informações da mensagem.
 * @param {string} sender - JID do remetente.
 * @param {string} from - JID do chat (grupo).
 * @param {string} text - Argumentos do comando (a mensagem de saída).
 * @param {number} expirationMessage - Duração da mensagem efêmera.
 * @param {boolean} isGroup - Se a mensagem veio de um grupo.
 * @param {boolean} isGroupAdmin - Se o remetente é admin do grupo.
 * @returns {Promise<void>}
 */
async function handleSetExitMessageCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin) {
  const commandName = `${primaryPrefix}setexit`;
  const actionName = "setExitMessage";

  /**
   * Função de validação para o comando !setexit.
   * Similar à validação de !setwelcome.
   * @param {string} inputText - O texto da mensagem fornecida.
   * @returns {string | null} A mensagem trimada ou null para limpar.
   * @throws {Error} Se a mensagem for inválida (apenas espaços).
   */
  const validationFn = inputText => {
    const exitMessage = inputText.trim();
    if (inputText.length > 0 && exitMessage.length === 0) {
      throw new Error(`🤔 Parece que você tentou definir uma mensagem de saída, mas ela continha apenas espaços em branco. Por favor, forneça um texto válido.\n\n*Exemplo:* \`${commandName} Adeus {user}!\`\n\nPara remover a mensagem personalizada atual (usar a padrão), use o comando sem nenhum texto após ele: \`${commandName}\``);
    }
    return exitMessage || null;
  };

  /**
   * Função para gerar a mensagem de sucesso para o comando !setexit.
   * Confirma a atualização ou remoção da mensagem personalizada.
   * @param {string | null} message - A mensagem que foi definida (ou null se foi removida).
   * @returns {string} A mensagem de sucesso formatada.
   */
  const successMessageFn = message => {
    if (message) {
      return `✅ Mensagem de saída atualizada! 👋 Agora, quando alguém sair (e as mensagens estiverem ativadas), receberá:\n\n_"${message}"_\n\n✨ *Lembre-se dos placeholders:* \`{user}\`, \`{groupName}\`, \`{desc}\`, \`{size}\`, \`{createdAt}\`, \`{ownerNumber}\``;
    } else {
      return `✅ A mensagem de saída personalizada foi removida. O sistema usará a mensagem padrão (se as mensagens estiverem ativadas). Para definir uma nova, use \`${commandName} Sua mensagem de despedida\`.`;
    }
  };

  // Mensagem de erro genérica para este comando.
  const errorMessageText = "❌ Poxa! Não foi possível salvar a nova mensagem de saída. 😥 Tente novamente, por favor. Se o erro continuar, fale com o suporte.";

  // Chama a função genérica de execução.
  await _executeWelcomeCommandLogic({
    client,
    info,
    from,
    sender,
    text,
    expirationMessage,
    isGroup,
    isGroupAdmin,
    commandName,
    actionName,
    validationFn,
    processorFn: welcomeProcessor.setExitMessage, // Função do processador para definir a mensagem de saída
    successMessageFn,
    errorMessageText,
  });
}

/**
 * Manipula o comando para definir a URL da mídia (imagem/vídeo) de saída.
 * Comando: !setexitmedia [URL da mídia | (vazio para limpar)]
 *
 * @async
 * @param {object} client - Instância do cliente WhatsApp.
 * @param {object} info - Objeto de informações da mensagem.
 * @param {string} sender - JID do remetente.
 * @param {string} from - JID do chat (grupo).
 * @param {string} text - Argumentos do comando (a URL da mídia).
 * @param {number} expirationMessage - Duração da mensagem efêmera.
 * @param {boolean} isGroup - Se a mensagem veio de um grupo.
 * @param {boolean} isGroupAdmin - Se o remetente é admin do grupo.
 * @returns {Promise<void>}
 */
async function handleSetExitMediaCommand(client, info, sender, from, text, expirationMessage, isGroup, isGroupAdmin) {
  const commandName = `${primaryPrefix}setexitmedia`;
  const actionName = "setExitMedia";

  /**
   * Função de validação para o comando !setexitmedia.
   * Similar à validação de !setwelcomemedia.
   * @param {string} inputText - O texto da URL fornecida.
   * @returns {string | null} A URL validada e trimada, ou null para limpar.
   * @throws {Error} Se a URL for inválida.
   */
  const validationFn = inputText => {
    const mediaUrl = inputText.trim();
    if (mediaUrl && !isValidHttpUrl(mediaUrl)) {
      throw new Error(`❌ A URL fornecida não parece válida. 🤔 Certifique-se de que ela começa com \`http://\` ou \`https://\` e leva diretamente para uma imagem ou vídeo (ex: \`https://site.com/video.mp4\`).\n\nPara remover a mídia atual, use o comando sem nenhuma URL: \`${commandName}\``);
    }
    return mediaUrl || null;
  };

  /**
   * Função para gerar a mensagem de sucesso para o comando !setexitmedia.
   * Confirma a configuração ou remoção da URL da mídia de saída.
   * @param {string | null} url - A URL que foi definida (ou null se foi removida).
   * @returns {string} A mensagem de sucesso formatada.
   */
  const successMessageFn = url => {
    if (url) {
      return `✅ Mídia de saída configurada! 🎬 A imagem/vídeo da URL fornecida será enviada junto com a mensagem de saída (se as mensagens estiverem ativadas).\n\n*Importante:* A URL deve ser pública e direta para o arquivo de mídia.`;
    } else {
      return `✅ Mídia de saída removida. Apenas a mensagem de texto será enviada agora (se as mensagens estiverem ativadas).`;
    }
  };

  // Mensagem de erro genérica para este comando.
  const errorMessageText = "❌ Que chato! Algo impediu de salvar a URL da mídia de saída. 😥 Por favor, tente novamente. Verifique se a URL está correta e acessível publicamente. Se o erro persistir, contate o suporte.";

  // Chama a função genérica de execução.
  await _executeWelcomeCommandLogic({
    client,
    info,
    from,
    sender,
    text,
    expirationMessage,
    isGroup,
    isGroupAdmin,
    commandName,
    actionName,
    validationFn,
    processorFn: welcomeProcessor.setExitMedia, // Função do processador para definir a mídia de saída
    successMessageFn,
    errorMessageText,
  });
}

/**
 * @module welcomeCommands
 * Exporta as funções handler para cada comando relacionado às mensagens de boas-vindas/saída.
 * Estas funções são destinadas a serem chamadas pelo controlador principal do bot
 * quando um comando correspondente for detectado.
 */
module.exports = {
  /** @see handleWelcomeToggleCommand */
  handleWelcomeToggleCommand,
  /** @see handleSetWelcomeMessageCommand */
  handleSetWelcomeMessageCommand,
  /** @see handleSetWelcomeMediaCommand */
  handleSetWelcomeMediaCommand,
  /** @see handleSetExitMessageCommand */
  handleSetExitMessageCommand,
  /** @see handleSetExitMediaCommand */
  handleSetExitMediaCommand,
};
