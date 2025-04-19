// /home/kaiky/Área de trabalho/dev/src/modules/groupsModule/welcome/welcomeCommands.js
const path = require("path"); // Add path module
const config = require(path.join(__dirname, "../../../config/options.json")); // Load config
const logger = require("../../../utils/logger"); // Adjusted path
const welcomeProcessor = require("./processWelcome");

// Define the primary prefix from config, defaulting to '!' if not found
const primaryPrefix = config.bot?.globalSettings?.prefix?.[0] || "!";

// Helper function for basic URL validation (can be improved)
const isValidHttpUrl = string => {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
};

/**
 * Handles the command to enable/disable welcome messages.
 * Example command: !welcome on | !welcome off (uses configured prefix)
 * @param {object} client - The WhatsApp client instance.
 * @param {object} info - Message information object.
 * @param {string} sender - The sender's JID.
 * @param {string} from - The chat JID (group JID or user JID).
 * @param {string} text - The command arguments (e.g., "on" or "off").
 * @param {number} expirationMessage - Ephemeral message duration.
 * @param {boolean} isGroup - Whether the message originated from a group chat.
 * @param {boolean} isGroupAdmin - Whether the sender is an admin in the group (if isGroup is true).
 */
async function handleWelcomeToggleCommand(
  client,
  info,
  sender,
  from,
  text,
  expirationMessage,
  isGroup,
  isGroupAdmin
) {
  // 1. Check if it's a group using the provided parameter
  if (!isGroup) {
    await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Olá! 👋 Este comando foi feito especialmente para gerenciar as configurações de grupos. Por favor, use-o dentro do grupo que deseja configurar.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 2. Check if sender is admin (only relevant if it's a group)
  if (!isGroupAdmin) {
    logger.warn(
      `[handleWelcomeToggleCommand] User ${sender} tried to change welcome status in ${from} but is not admin.`
    );
    await client.sendMessage(from, { react: { text: "🛡️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Para garantir que apenas pessoas autorizadas modifiquem as configurações do grupo, este comando só pode ser usado por administradores. 🛡️",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 3. Parse the 'text' argument
  const argument = text.trim().toLowerCase();
  let enabled;
  if (argument === "on" || argument === "ativar" || argument === "1") {
    enabled = true;
  } else if (
    argument === "off" ||
    argument === "desativar" ||
    argument === "0"
  ) {
    enabled = false;
  } else {
    await client.sendMessage(from, { react: { text: "🤔", key: info.key } });
    // Use the configured prefix in the help message
    return client.sendMessage(
      from,
      {
        text: `Hmm, parece que o comando não foi usado corretamente. 🤔 Para ativar ou desativar as mensagens de boas-vindas e saída, use:\n\n➡️ \`${primaryPrefix}welcome on\` (para ativar)\n➡️ \`${primaryPrefix}welcome off\` (para desativar)`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  const groupId = from; // Since we checked isGroup, 'from' is the groupId

  // Indicate processing start
  await Promise.all([
    client.sendMessage(from, { react: { text: "⏳", key: info.key } }),
    client.sendPresenceUpdate("composing", from),
  ]);

  try {
    // 4. Call the database function
    await welcomeProcessor.setWelcomeStatus(groupId, enabled);
    logger.info(
      `[handleWelcomeToggleCommand] Welcome status for ${groupId} set to ${enabled} by ${sender}`
    );

    // 5. Send success response
    const statusMsg = enabled ? "ativadas" : "desativadas";
    // --- MODIFIED EXPLANATION ---
    const explanation = enabled
      ? "Agora, novos membros serão recebidos e membros que saírem terão uma despedida automática!"
      : // Use the configured prefix in the explanation
        `As mensagens automáticas não serão mais enviadas. 🔇\n\n*Importante:* Suas configurações personalizadas de texto e mídia foram mantidas, mas serão ignoradas enquanto este recurso estiver desativado. Elas voltarão a ser usadas se você reativar com \`${primaryPrefix}welcome on\`.`;
    // --- END MODIFIED EXPLANATION ---

    // --- INÍCIO DA MENSAGEM ADICIONAL ---
    // Use the configured prefix in the customization info
    const customizationInfo =
      `\n\n✨ *Quer personalizar ainda mais?*` +
      `\nUse os comandos abaixo para definir textos e mídias específicas:` +
      `\n- \`${primaryPrefix}setwelcome <mensagem>\`: Define o texto de boas-vindas.` +
      `\n- \`${primaryPrefix}setwelcomemedia <url>\`: Adiciona imagem/vídeo às boas-vindas.` +
      `\n- \`${primaryPrefix}setexit <mensagem>\`: Define o texto de despedida.` +
      `\n- \`${primaryPrefix}setexitmedia <url>\`: Adiciona imagem/vídeo à despedida.` +
      // --- SEÇÃO SOBRE PLACEHOLDERS ATUALIZADA ---
      `\n\n💡 *Dica de Personalização (Placeholders):*` +
      `\nNas mensagens (\`${primaryPrefix}setwelcome\` e \`${primaryPrefix}setexit\`), você pode usar os seguintes placeholders para torná-las dinâmicas:` +
      `\n  • \`{user}\`: Menção (@) do membro que entrou/saiu.` +
      `\n  • \`{groupName}\`: Nome do grupo.` +
      `\n  • \`{desc}\`: Descrição do grupo.` +
      `\n  • \`{size}\`: Número de participantes no grupo.` +
      `\n  • \`{createdAt}\`: Data de criação do grupo (DD/MM/AAAA).` +
      `\n  • \`{ownerNumber}\`: Número do criador do grupo (sem @...).` +
      `\n\n*Exemplo:* \`${primaryPrefix}setwelcome Olá {user}, bem-vindo(a) ao {groupName}! Temos {size} membros.\`` +
      // --- FIM DA SEÇÃO SOBRE PLACEHOLDERS ---
      `\n\nLembre-se que estas personalizações só terão efeito se as mensagens estiverem ativadas (\`${primaryPrefix}welcome on\`). 😉`;
    // --- FIM DA MENSAGEM ADICIONAL ---

    await client.sendMessage(from, { react: { text: "✅", key: info.key } }); // Success reaction
    await client.sendMessage(
      from,
      // Combina a confirmação, a explicação do estado atual e as dicas de personalização
      {
        text: `✅ Prontinho! As mensagens automáticas de boas-vindas e saída para este grupo foram ${statusMsg}. 🎉\n\n${explanation}${customizationInfo}`,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } catch (error) {
    logger.error(
      `[handleWelcomeToggleCommand] Error setting welcome status for ${groupId}: ${error.message}`
    );
    await client.sendMessage(from, { react: { text: "❌", key: info.key } }); // Error reaction
    // 5. Send error response
    await client.sendMessage(
      from,
      {
        text: "❌ Ops! Algo deu errado ao tentar atualizar o status das mensagens de boas-vindas/saída. 😥 Por favor, tente novamente em alguns instantes. Se o problema persistir, entre em contato com o suporte.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } finally {
    // Ensure presence is reset
    await client.sendPresenceUpdate("paused", from);
  }
}

/**
 * Handles the command to set the welcome message.
 * Example command: !setwelcome Olá {user}, bem-vindo ao {groupName}! (uses configured prefix)
 * @param {object} client - The WhatsApp client instance.
 * @param {object} info - Message information object.
 * @param {string} sender - The sender's JID.
 * @param {string} from - The chat JID (group JID or user JID).
 * @param {string} text - The command arguments (the welcome message).
 * @param {number} expirationMessage - Ephemeral message duration.
 * @param {boolean} isGroup - Whether the message originated from a group chat.
 * @param {boolean} isGroupAdmin - Whether the sender is an admin in the group (if isGroup is true).
 */
async function handleSetWelcomeMessageCommand(
  client,
  info,
  sender,
  from,
  text,
  expirationMessage,
  isGroup,
  isGroupAdmin
) {
  // 1. Check if it's a group using the provided parameter
  if (!isGroup) {
    await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Olá! 👋 Este comando é para personalizar a mensagem de boas-vindas de um grupo. Use-o dentro do grupo desejado.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 2. Check if sender is admin (only relevant if it's a group)
  if (!isGroupAdmin) {
    await client.sendMessage(from, { react: { text: "🛡️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Apenas administradores podem definir a mensagem de boas-vindas do grupo. 🛡️",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 3. Parse the 'text' argument (the message itself)
  const welcomeMessage = text.trim(); // Allow empty string to clear the message
  const groupId = from; // Since we checked isGroup, 'from' is the groupId

  // Indicate processing start
  await Promise.all([
    client.sendMessage(from, { react: { text: "⏳", key: info.key } }),
    client.sendPresenceUpdate("composing", from),
  ]);

  try {
    // 4. Call the database function
    await welcomeProcessor.setWelcomeMessage(groupId, welcomeMessage || null); // Pass null if welcomeMessage is empty
    logger.info(
      `[handleSetWelcomeMessageCommand] Welcome message for ${groupId} updated by ${sender}`
    );

    // 5. Send success response
    await client.sendMessage(from, { react: { text: "✅", key: info.key } }); // Success reaction
    if (welcomeMessage) {
      // Mensagem de sucesso para setwelcome também pode listar os placeholders
      await client.sendMessage(
        from,
        {
          text: `✅ Mensagem de boas-vindas atualizada! 🎉 Agora, quando alguém entrar (e as boas-vindas estiverem ativadas), receberá:\n\n_"${welcomeMessage}"_\n\n✨ *Lembre-se dos placeholders:* \`{user}\`, \`{groupName}\`, \`{desc}\`, \`{size}\`, \`{createdAt}\`, \`{ownerNumber}\``,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    } else {
      // Use the configured prefix in the help message
      await client.sendMessage(
        from,
        {
          text: `✅ A mensagem de boas-vindas personalizada foi removida. O sistema voltará a usar a mensagem padrão (se as boas-vindas estiverem ativadas). Para definir uma nova, use \`${primaryPrefix}setwelcome Sua nova mensagem aqui\`.`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    }
  } catch (error) {
    logger.error(
      `[handleSetWelcomeMessageCommand] Error setting welcome message for ${groupId}: ${error.message}`
    );
    await client.sendMessage(from, { react: { text: "❌", key: info.key } }); // Error reaction
    // 5. Send error response
    await client.sendMessage(
      from,
      {
        text: "❌ Que pena! Não consegui salvar a nova mensagem de boas-vindas. 😥 Tente novamente, por favor. Se o erro continuar, fale com o suporte.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } finally {
    // Ensure presence is reset
    await client.sendPresenceUpdate("paused", from);
  }
}

/**
 * Handles the command to set the welcome media URL.
 * Example command: !setwelcomemedia <url> | !setwelcomemedia (to clear) (uses configured prefix)
 * @param {object} client - The WhatsApp client instance.
 * @param {object} info - Message information object.
 * @param {string} sender - The sender's JID.
 * @param {string} from - The chat JID (group JID or user JID).
 * @param {string} text - The command arguments (the media URL).
 * @param {number} expirationMessage - Ephemeral message duration.
 * @param {boolean} isGroup - Whether the message originated from a group chat.
 * @param {boolean} isGroupAdmin - Whether the sender is an admin in the group (if isGroup is true).
 */
async function handleSetWelcomeMediaCommand(
  client,
  info,
  sender,
  from,
  text,
  expirationMessage,
  isGroup,
  isGroupAdmin
) {
  // 1. Check if it's a group
  if (!isGroup) {
    await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Olá! 👋 Este comando serve para adicionar uma imagem ou vídeo à mensagem de boas-vindas de um grupo. Use-o dentro do grupo que deseja configurar.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 2. Check if sender is admin
  if (!isGroupAdmin) {
    await client.sendMessage(from, { react: { text: "🛡️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Apenas administradores podem definir a mídia de boas-vindas do grupo. 🛡️",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 3. Parse the 'text' argument (the URL or empty to clear)
  const mediaUrl = text.trim();
  const groupId = from;

  // 3.1 Validate URL if provided
  if (mediaUrl && !isValidHttpUrl(mediaUrl)) {
    await client.sendMessage(from, { react: { text: "🤔", key: info.key } });
    // Use the configured prefix in the help message
    return client.sendMessage(
      from,
      {
        text: `❌ A URL fornecida não parece válida. 🤔 Certifique-se de que ela começa com \`http://\` ou \`https://\` e leva diretamente para uma imagem ou vídeo (ex: \`https://site.com/imagem.jpg\`).\n\nPara remover a mídia atual, use o comando sem nenhuma URL: \`${primaryPrefix}setwelcomemedia\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // Indicate processing start
  await Promise.all([
    client.sendMessage(from, { react: { text: "⏳", key: info.key } }),
    client.sendPresenceUpdate("composing", from),
  ]);

  try {
    // 4. Call the database function
    await welcomeProcessor.setWelcomeMedia(groupId, mediaUrl || null); // Pass null if mediaUrl is empty
    logger.info(
      `[handleSetWelcomeMediaCommand] Welcome media for ${groupId} updated by ${sender}`
    );

    // 5. Send success response
    await client.sendMessage(from, { react: { text: "✅", key: info.key } }); // Success reaction
    if (mediaUrl) {
      await client.sendMessage(
        from,
        {
          text: `✅ Mídia de boas-vindas configurada! 🖼️ A imagem/vídeo da URL fornecida será enviada junto com a mensagem de boas-vindas (se as boas-vindas estiverem ativadas).\n\n*Importante:* A URL deve ser pública e direta para o arquivo de mídia.`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    } else {
      await client.sendMessage(
        from,
        {
          text: `✅ Mídia de boas-vindas removida. Apenas a mensagem de texto será enviada agora (se as boas-vindas estiverem ativadas).`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    }
  } catch (error) {
    logger.error(
      `[handleSetWelcomeMediaCommand] Error setting welcome media for ${groupId}: ${error.message}`
    );
    await client.sendMessage(from, { react: { text: "❌", key: info.key } }); // Error reaction
    // 5. Send error response
    await client.sendMessage(
      from,
      {
        text: "❌ Ah, não! Algo impediu de salvar a URL da mídia de boas-vindas. 😥 Por favor, tente novamente. Verifique se a URL está correta e acessível publicamente. Se o erro persistir, contate o suporte.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } finally {
    // Ensure presence is reset
    await client.sendPresenceUpdate("paused", from);
  }
}

/**
 * Handles the command to set the exit message.
 * Example command: !setexit Adeus {user}! (uses configured prefix)
 * @param {object} client - The WhatsApp client instance.
 * @param {object} info - Message information object.
 * @param {string} sender - The sender's JID.
 * @param {string} from - The chat JID (group JID or user JID).
 * @param {string} text - The command arguments (the exit message).
 * @param {number} expirationMessage - Ephemeral message duration.
 * @param {boolean} isGroup - Whether the message originated from a group chat.
 * @param {boolean} isGroupAdmin - Whether the sender is an admin in the group (if isGroup is true).
 */
async function handleSetExitMessageCommand(
  client,
  info,
  sender,
  from,
  text,
  expirationMessage,
  isGroup,
  isGroupAdmin
) {
  // 1. Check if it's a group
  if (!isGroup) {
    await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Olá! 👋 Este comando é para personalizar a mensagem de despedida de um grupo. Use-o dentro do grupo desejado.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 2. Check if sender is admin
  if (!isGroupAdmin) {
    await client.sendMessage(from, { react: { text: "🛡️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Apenas administradores podem definir a mensagem de saída do grupo. 🛡️",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 3. Parse the 'text' argument (the message itself)
  const exitMessage = text.trim(); // Allow empty string to clear the message
  const groupId = from;

  // Indicate processing start
  await Promise.all([
    client.sendMessage(from, { react: { text: "⏳", key: info.key } }),
    client.sendPresenceUpdate("composing", from),
  ]);

  try {
    // 4. Call the database function
    await welcomeProcessor.setExitMessage(groupId, exitMessage || null); // Pass null if exitMessage is empty
    logger.info(
      `[handleSetExitMessageCommand] Exit message for ${groupId} updated by ${sender}`
    );

    // 5. Send success response
    await client.sendMessage(from, { react: { text: "✅", key: info.key } }); // Success reaction
    if (exitMessage) {
      // Mensagem de sucesso para setexit também pode listar os placeholders
      await client.sendMessage(
        from,
        {
          text: `✅ Mensagem de saída atualizada! 👋 Agora, quando alguém sair (e as mensagens estiverem ativadas), receberá:\n\n_"${exitMessage}"_\n\n✨ *Lembre-se dos placeholders:* \`{user}\`, \`{groupName}\`, \`{desc}\`, \`{size}\`, \`{createdAt}\`, \`{ownerNumber}\``,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    } else {
      // Use the configured prefix in the help message
      await client.sendMessage(
        from,
        {
          text: `✅ A mensagem de saída personalizada foi removida. O sistema usará a mensagem padrão (se as mensagens estiverem ativadas). Para definir uma nova, use \`${primaryPrefix}setexit Sua mensagem de despedida\`.`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    }
  } catch (error) {
    logger.error(
      `[handleSetExitMessageCommand] Error setting exit message for ${groupId}: ${error.message}`
    );
    await client.sendMessage(from, { react: { text: "❌", key: info.key } }); // Error reaction
    // 5. Send error response
    await client.sendMessage(
      from,
      {
        text: "❌ Poxa! Não foi possível salvar a nova mensagem de saída. 😥 Tente novamente, por favor. Se o erro continuar, fale com o suporte.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } finally {
    // Ensure presence is reset
    await client.sendPresenceUpdate("paused", from);
  }
}

/**
 * Handles the command to set the exit media URL.
 * Example command: !setexitmedia <url> | !setexitmedia (to clear) (uses configured prefix)
 * @param {object} client - The WhatsApp client instance.
 * @param {object} info - Message information object.
 * @param {string} sender - The sender's JID.
 * @param {string} from - The chat JID (group JID or user JID).
 * @param {string} text - The command arguments (the media URL).
 * @param {number} expirationMessage - Ephemeral message duration.
 * @param {boolean} isGroup - Whether the message originated from a group chat.
 * @param {boolean} isGroupAdmin - Whether the sender is an admin in the group (if isGroup is true).
 */
async function handleSetExitMediaCommand(
  client,
  info,
  sender,
  from,
  text,
  expirationMessage,
  isGroup,
  isGroupAdmin
) {
  // 1. Check if it's a group
  if (!isGroup) {
    await client.sendMessage(from, { react: { text: "⚠️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Olá! 👋 Este comando serve para adicionar uma imagem ou vídeo à mensagem de saída de um grupo. Use-o dentro do grupo que deseja configurar.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 2. Check if sender is admin
  if (!isGroupAdmin) {
    await client.sendMessage(from, { react: { text: "🛡️", key: info.key } });
    return client.sendMessage(
      from,
      {
        text: "Apenas administradores podem definir a mídia de saída do grupo. 🛡️",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // 3. Parse the 'text' argument (the URL or empty to clear)
  const mediaUrl = text.trim();
  const groupId = from;

  // 3.1 Validate URL if provided
  if (mediaUrl && !isValidHttpUrl(mediaUrl)) {
    await client.sendMessage(from, { react: { text: "🤔", key: info.key } });
    // Use the configured prefix in the help message
    return client.sendMessage(
      from,
      {
        text: `❌ A URL fornecida não parece válida. 🤔 Certifique-se de que ela começa com \`http://\` ou \`https://\` e leva diretamente para uma imagem ou vídeo (ex: \`https://site.com/video.mp4\`).\n\nPara remover a mídia atual, use o comando sem nenhuma URL: \`${primaryPrefix}setexitmedia\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  }

  // Indicate processing start
  await Promise.all([
    client.sendMessage(from, { react: { text: "⏳", key: info.key } }),
    client.sendPresenceUpdate("composing", from),
  ]);

  try {
    // 4. Call the database function
    await welcomeProcessor.setExitMedia(groupId, mediaUrl || null); // Pass null if mediaUrl is empty
    logger.info(
      `[handleSetExitMediaCommand] Exit media for ${groupId} updated by ${sender}`
    );

    // 5. Send success response
    await client.sendMessage(from, { react: { text: "✅", key: info.key } }); // Success reaction
    if (mediaUrl) {
      await client.sendMessage(
        from,
        {
          text: `✅ Mídia de saída configurada! 🎬 A imagem/vídeo da URL fornecida será enviada junto com a mensagem de saída (se as mensagens estiverem ativadas).\n\n*Importante:* A URL deve ser pública e direta para o arquivo de mídia.`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    } else {
      await client.sendMessage(
        from,
        {
          text: `✅ Mídia de saída removida. Apenas a mensagem de texto será enviada agora (se as mensagens estiverem ativadas).`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage }
      );
    }
  } catch (error) {
    logger.error(
      `[handleSetExitMediaCommand] Error setting exit media for ${groupId}: ${error.message}`
    );
    await client.sendMessage(from, { react: { text: "❌", key: info.key } }); // Error reaction
    // 5. Send error response
    await client.sendMessage(
      from,
      {
        text: "❌ Que chato! Algo impediu de salvar a URL da mídia de saída. 😥 Por favor, tente novamente. Verifique se a URL está correta e acessível publicamente. Se o erro persistir, contate o suporte.",
      },
      { quoted: info, ephemeralExpiration: expirationMessage }
    );
  } finally {
    // Ensure presence is reset
    await client.sendPresenceUpdate("paused", from);
  }
}

module.exports = {
  handleWelcomeToggleCommand,
  handleSetWelcomeMessageCommand,
  handleSetWelcomeMediaCommand,
  handleSetExitMessageCommand,
  handleSetExitMediaCommand,
};
