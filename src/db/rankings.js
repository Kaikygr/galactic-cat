const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "./database.sqlite");
const db = new sqlite3.Database(dbPath);

const tableColumns = {
  general_rank: new Set(),
  group_rank: new Set()
};

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS general_rank (
    userId TEXT PRIMARY KEY,
    userName TEXT,
    count INTEGER DEFAULT 0,
    lastMessageDate TEXT
  )`);

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

function getColumnForMessageType(messageType) {
  if (!messageType) return "unknownCount";
  return messageType + "Count";
}

function ensureColumnExists(table, column, callback) {
  if (tableColumns[table] && tableColumns[table].has(column)) {
    callback();
    return;
  }
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER DEFAULT 0`, function(err) {
    if (!tableColumns[table]) tableColumns[table] = new Set();
    tableColumns[table].add(column);
    callback();
  });
}

function updateUserRank(userId, userName, lastMessageDate, messageType) {
  if (!userId.endsWith(".net")) return;
  const column = getColumnForMessageType(messageType);
  ensureColumnExists("general_rank", column, () => {
    db.run(
      `INSERT INTO general_rank (userId, userName, count, lastMessageDate, ${column})
       VALUES (?, ?, 1, ?, 1)
       ON CONFLICT(userId) DO UPDATE SET 
         count = count + 1, 
         userName = excluded.userName, 
         lastMessageDate = excluded.lastMessageDate,
         ${column} = ${column} + 1`,
      [userId, userName, lastMessageDate]
    );
  });
}

function updateGroupRank(groupId, userId, groupName, userName, lastMessageDate, messageType) {
  if (!groupId.endsWith("@g.us")) return;
  const column = getColumnForMessageType(messageType);
  ensureColumnExists("group_rank", column, () => {
    db.run(
      `INSERT INTO group_rank (groupId, userId, groupName, userName, count, lastMessageDate, ${column})
       VALUES (?, ?, ?, ?, 1, ?, 1)
       ON CONFLICT(groupId, userId) DO UPDATE SET 
         count = count + 1, 
         groupName = excluded.groupName, 
         userName = excluded.userName, 
         lastMessageDate = excluded.lastMessageDate,
         ${column} = ${column} + 1`,
      [groupId, userId, groupName, userName, lastMessageDate]
    );
  });
}

function getGeneralRanking(callback) {
  db.all(
    `SELECT * FROM general_rank ORDER BY count DESC`,
    [],
    (err, rows) => callback(err, rows)
  );
}

function getGroupRanking(groupId, callback) {
  db.all(
    `SELECT * FROM group_rank WHERE groupId = ? ORDER BY count DESC`,
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
