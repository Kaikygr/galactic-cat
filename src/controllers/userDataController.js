const { initDatabase } = require("../utils/db");

let db;

initDatabase()
  .then(connection => {
    db = connection;
  })
  .catch(err => console.error("❌ Erro na inicialização do MySQL:", err));

async function saveUserToDB(info) {
  try {
    if (!db) {
      console.log("DB não inicializado, aguardando inicialização...");
      db = await require("../utils/db").initDatabase();
    }
    const from = info?.key?.remoteJid;
    const isGroup = from?.endsWith("@g.us") ? 1 : 0;
    const userId = isGroup ? info.key.participant : from;
    const pushName = info.pushName;
    const messageType = Object.keys(info.message || {})[0];
    const messageContent = JSON.stringify(info.message?.[messageType]);
    const timestamp = new Date(info.messageTimestamp * 1000).toISOString().slice(0, 19).replace("T", " ");
    let groupId = isGroup ? from : "privado";

    if (isGroup && groupId !== "privado") {
      const groupExistsQuery = `SELECT id FROM \`groups\` WHERE id = ?`;
      const [groupExists] = await db.execute(groupExistsQuery, [groupId]);
      if (groupExists.length === 0) {
        console.log(`Grupo ${groupId} não encontrado. Salvando grupo antes de associar o usuário.`);
        await saveGroupToDB({ id: groupId, name: "Grupo Desconhecido", owner: null, creation: null, desc: null });
      }
    } else if (groupId === "privado") {
      const privateGroupExistsQuery = `SELECT id FROM \`groups\` WHERE id = 'privado'`;
      const [privateGroupExists] = await db.execute(privateGroupExistsQuery);
      if (privateGroupExists.length === 0) {
        console.log("Grupo 'privado' não encontrado. Criando grupo 'privado'.");
        await saveGroupToDB({ id: "privado", name: "Mensagens Privadas", owner: null, creation: null, desc: null });
      }
    }

    const query = `
      INSERT INTO users (sender, pushName, isGroup, messageType, messageContent, timestamp, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.execute(query, [userId, pushName, isGroup, messageType, messageContent, timestamp, groupId]);
    console.log("✅ Mensagem salva no histórico do usuário:", userId);
    return result;
  } catch (error) {
    console.error("❌ Erro ao salvar usuário/mensagem no banco:", error);
  }
}

async function saveGroupToDB(groupMeta) {
  try {
    if (!db) {
      console.log("DB não inicializado, aguardando inicialização...");
      db = await require("../utils/db").initDatabase();
    }
    const id = groupMeta.id || null;
    const name = groupMeta.subject || groupMeta.name || "Grupo Desconhecido";
    const owner = groupMeta.owner || null;
    const createdAt = groupMeta.creation ? new Date(groupMeta.creation * 1000).toISOString().slice(0, 19).replace("T", " ") : new Date().toISOString().slice(0, 19).replace("T", " ");
    const description = groupMeta.desc || groupMeta.description || null;

    const query = `
      INSERT INTO \`groups\` (id, name, owner, created_at, description)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name),
      owner = VALUES(owner),
      created_at = VALUES(created_at),
      description = VALUES(description)
    `;
    const [result] = await db.execute(query, [id, name, owner, createdAt, description]);
    console.log("✅ Grupo salvo/atualizado:", id);
    return result;
  } catch (error) {
    console.error("❌ Erro ao salvar grupo no banco:", error);
  }
}

async function saveGroupParticipantsToDB(groupMeta) {
  try {
    for (const participant of groupMeta.participants) {
      const query = `
        INSERT IGNORE INTO group_participants (group_id, participant, isAdmin)
        VALUES (?, ?, ?)
      `;
      await runQuery(query, [groupMeta.id, participant.id, participant.isAdmin ? 1 : 0]);
    }
    console.log("✅ Participantes do grupo salvos:", groupMeta.id);
  } catch (error) {
    console.error("❌ Erro ao salvar participantes do grupo:", error);
  }
}

async function processUserData(data, client) {
  try {
    const info = data.messages[0];
    await saveUserToDB(info);

    const from = info?.key?.remoteJid;
    const isGroup = from?.endsWith("@g.us");
    if (isGroup) {
      try {
        const groupMeta = await client.groupMetadata(from);
        await saveGroupToDB(groupMeta);
        await saveGroupParticipantsToDB(groupMeta);
      } catch (gError) {
        console.error("❌ Erro ao processar os dados do grupo:", gError);
      }
    }
  } catch (error) {
    console.error("❌ Erro ao processar os dados do usuário:", error);
  }
}

function runQuery(query, params) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!db) {
        console.log("DB não inicializado, aguardando inicialização...");
        db = await require("../utils/db").initDatabase();
      }
      const [result] = await db.execute(query, params);
      resolve(result.insertId || result);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = processUserData;
