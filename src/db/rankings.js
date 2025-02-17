const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, './database.sqlite');
const db = new sqlite3.Database(dbPath);

// Criação das tabelas se não existirem, com colunas extras para nomes e data da última mensagem
db.serialize(() => {
  // Tabela para ranking de usuários: usuário, nome, contagem e data da última mensagem
  db.run(`CREATE TABLE IF NOT EXISTS general_rank (
    userId TEXT PRIMARY KEY,
    userName TEXT,
    count INTEGER DEFAULT 0,
    lastMessageDate TEXT
  )`);
  
  // Tabela para ranking por grupo: grupo, usuário, nome do grupo, nome do usuário, contagem e data da última mensagem
  db.run(`CREATE TABLE IF NOT EXISTS group_rank (
    groupId TEXT,
    userId TEXT,
    groupName TEXT,
    userName TEXT,
    count INTEGER DEFAULT 0,
    lastMessageDate TEXT,
    PRIMARY KEY (groupId, userId)
  )`);
});

// Atualizar ranking de usuário: insere ou incrementa registro e atualiza dados.
// Contabiliza todas as mensagens, independentemente de serem de grupo ou pv.
function updateUserRank(userId, userName, lastMessageDate) {
  // Atualiza apenas se for ID de usuário (terminar com '.net')
  if (!userId.endsWith('.net')) return;
  
  db.run(
    `INSERT INTO general_rank (userId, userName, count, lastMessageDate) VALUES (?, ?, 1, ?)
     ON CONFLICT(userId) DO UPDATE SET count = count + 1, userName = excluded.userName, lastMessageDate = excluded.lastMessageDate`,
    [userId, userName, lastMessageDate]
  );
}

// Atualizar ranking de grupo: insere ou incrementa registro e atualiza dados.
// groupId deve terminar com '@g.us'; userId é o participante e userName é o nome deste usuário.
function updateGroupRank(groupId, userId, groupName, userName, lastMessageDate) {
  if (!groupId.endsWith('@g.us')) return;
  
  db.run(
    `INSERT INTO group_rank (groupId, userId, groupName, userName, count, lastMessageDate) VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(groupId, userId) DO UPDATE SET count = count + 1, groupName = excluded.groupName, userName = excluded.userName, lastMessageDate = excluded.lastMessageDate`,
    [groupId, userId, groupName, userName, lastMessageDate]
  );
}

// Retornar ranking de usuários ordenado
function getGeneralRanking(callback) {
  db.all(
    `SELECT userId, userName, count, lastMessageDate FROM general_rank ORDER BY count DESC`,
    [],
    (err, rows) => callback(err, rows)
  );
}

// Retornar ranking individual de um grupo ordenado
function getGroupRanking(groupId, callback) {
  db.all(
    `SELECT userId, userName, groupName, count, lastMessageDate FROM group_rank WHERE groupId = ? ORDER BY count DESC`,
    [groupId],
    (err, rows) => callback(err, rows)
  );
}

module.exports = {
  updateUserRank,
  updateGroupRank,
  getGeneralRanking,
  getGroupRanking
};
