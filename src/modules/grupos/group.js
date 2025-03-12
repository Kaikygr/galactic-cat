const groupData = require("../../config/groupData.json");

async function groupInfo(client, info, sender, from, text, userMessageReport, ownerReport, logger) {
  try {
    const group = groupData[from];
    if (group) {
      logger.info("Grupo encontrado: " + group.nome);
      const ephemeralDurationDays = group.ephemeralDuration / (60 * 60 * 24);
      const groupInfoText = `
📛 Nome: ${group.nome}
👥 Tamanho: ${group.tamanho}
📅 Criação: ${new Date(group.criacao * 1000).toLocaleString()}
👑 Dono: ${group.dono}
🔒 Restrito: ${group.restrict ? "Sim" : "Não"}
📢 Anúncios: ${group.announce ? "Sim" : "Não"}
🌐 Comunidade: ${group.isCommunity ? "Sim" : "Não"}
✅ Aprovação de Entrada: ${group.joinApprovalMode ? "Sim" : "Não"}
⏳ Duração das mensagens: ${ephemeralDurationDays} dias
🆔 ID da Descrição: ${group.descId}
🔗 Grupo Pai: ${group.linkedParent ? group.linkedParent : "Nenhum"}

📜 Boas Vindas: ${group.boasVindas.map(bv => `${bv.ativo}, \n- Mensagem de Entrada:\n> ${bv.mensagemEntrada},\n\n- Mensagem de Saída:\n> ${bv.mensagemSaida}`).join("\n")}
      `;
      userMessageReport(groupInfoText);
    } else {
      logger.info("Grupo não encontrado para o ID: " + from);
    }
  } catch (error) {
    logger.error(error);
  }
}

module.exports = { groupInfo };
