/* eslint-disable no-sync */
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("../utils/logger");

const groupDataPath = path.join(__dirname, "..", "config", "groupData.json");

// Função que garante a existência do arquivo de configuração do grupo; caso não exista, cria-o
const ensureGroupDataFile = () => {
  if (!fs.existsSync(groupDataPath)) {
    // Cria o arquivo com um objeto vazio
    fs.writeFileSync(groupDataPath, JSON.stringify({}, null, 2));
  }
};

// Adiciona configurações do grupo se ele não existir ou se faltar a configuração de boas-vindas
const addGroupIfNotExists = (groupData, groupId, groupName) => {
  if (!groupData[groupId]) {
    // Configuração inicial para novo grupo
    groupData[groupId] = {
      id: groupId,
      nome: groupName,
      boasVindas: [
        {
          ativo: false,
          formatoEntrada: "texto",
          formatoSaida: "texto",
          mensagemEntrada: "Bem-vindo ao grupo, #usuario",
          mensagemSaida: "Até logo, #usuario!",
          midiaEntrada: "",
          midiaSaida: "",
        },
      ],
    };
    fs.writeFileSync(groupDataPath, JSON.stringify(groupData, null, 2));
  } else if (!groupData[groupId].boasVindas) {
    // Caso o grupo exista sem configuração de boas-vindas, insere a configuração padrão
    groupData[groupId].boasVindas = [
      {
        ativo: false,
        formatoEntrada: "texto",
        formatoSaida: "texto",
        mensagemEntrada: "Bem-vindo ao grupo, #usuario",
        mensagemSaida: "Até logo, #usuario",
        midiaEntrada: "",
        midiaSaida: "",
      },
    ];
    fs.writeFileSync(groupDataPath, JSON.stringify(groupData, null, 2));
  }
};

// Função para extrair o nome do usuário a partir do identificador do participante
const getUserName = async (client, participant) => {
  const id = participant.split("@")[0];
  return "@" + id;
};

// Função para extrair os nomes dos administradores do grupo
const getGroupAdminsNames = async (client, adminList) => {
  const adminNames = await Promise.all(adminList.map(admin => getUserName(client, admin)));
  return adminNames.join(", ");
};

// Função principal para enviar mensagem de boas-vindas ou despedida
const sendWelcomeMessage = async (client, groupId, participant, action, metadata) => {
  try {
    ensureGroupDataFile();
    let groupData = JSON.parse(fs.readFileSync(groupDataPath, "utf8"));
    // Garante que os dados lidos sejam um objeto válido
    if (typeof groupData !== "object" || Array.isArray(groupData)) {
      groupData = {};
    }
    const groupName = metadata?.subject || groupId;
    addGroupIfNotExists(groupData, groupId, groupName);
    const groupConfig = groupData[groupId];
    const welcomeConfig = groupConfig.boasVindas[0];
    // Se o recurso de boas-vindas estiver desativado, não envia mensagem
    if (!welcomeConfig.ativo) {
      return;
    }
    const userName = await getUserName(client, participant);
    const isAddAction = action === "add";
    const groupOwner = groupConfig.dono ? await getUserName(client, groupConfig.dono) : "";
    const groupAdmins = Array.isArray(groupConfig.administradores) ? await getGroupAdminsNames(client, groupConfig.administradores) : "";
    // Define o tipo de mensagem e o texto conforme a ação (entrada ou saída)
    const messageType = isAddAction ? welcomeConfig.formatoEntrada : welcomeConfig.formatoSaida;
    let messageText = isAddAction ? welcomeConfig.mensagemEntrada : welcomeConfig.mensagemSaida;
    messageText = messageText
      .replace("#usuario", userName)
      .replace("#grupo", groupConfig.nome)
      .replace("#id", participant)
      .replace("#grupoName", groupConfig.nome)
      .replace("#grupoDesc", groupConfig.descricao || "")
      .replace("#grupoSize", groupConfig.tamanho)
      .replace("#grupoDono", groupOwner)
      .replace("#grupoAdmins", groupAdmins)
      .replace("#time", new Date().toLocaleTimeString());
    const mediaUrl = isAddAction ? welcomeConfig.midiaEntrada : welcomeConfig.midiaSaida;

    const mentions = [participant];
    if (groupOwner) mentions.push(groupConfig.dono);
    if (Array.isArray(groupConfig.administradores)) mentions.push(...groupConfig.administradores);

    if (messageType === "texto") {
      // Envia mensagem de texto simples com menção ao participante
      await client.sendMessage(groupId, {
        text: messageText,
        mentions,
      });
    } else if (messageType === "imagemTexto" || messageType === "videoTexto") {
      // Seleciona o tipo de mídia e baixa a mídia via axios
      const mediaType = messageType === "imagemTexto" ? "image" : "video";
      const mediaBuffer = await axios.get(mediaUrl, { responseType: "arraybuffer" }).then(res => res.data);
      if (mediaBuffer) {
        if (mediaType === "video") {
          // Envia mensagem com vídeo e legenda
          await client.sendMessage(groupId, {
            video: mediaBuffer,
            mimetype: "video/mp4",
            caption: messageText,
            mentions,
          });
        } else {
          // Envia mensagem com imagem e legenda
          await client.sendMessage(groupId, {
            image: mediaBuffer,
            caption: messageText,
            mentions,
          });
        }
      } else {
        // Loga erro caso a mídia não seja baixada corretamente
        logger.error(`Erro ao baixar mídia para o grupo ${groupId}`);
      }
    }
  } catch (error) {
    // Captura e registra erros ocorridos durante o envio da mensagem
    logger.error(`Erro ao enviar mensagem de ${action} para o grupo ${groupId}: ${error.message}`);
  }
};

module.exports = { sendWelcomeMessage };
