const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "./database.sqlite");
const db = new sqlite3.Database(dbPath);

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

function updateUserRank(userId, userName, lastMessageDate) {
  if (!userId.endsWith(".net")) return;

  db.run(
    `INSERT INTO general_rank (userId, userName, count, lastMessageDate) VALUES (?, ?, 1, ?)
     ON CONFLICT(userId) DO UPDATE SET count = count + 1, userName = excluded.userName, lastMessageDate = excluded.lastMessageDate`,
    [userId, userName, lastMessageDate]
  );
}

function updateGroupRank(
  groupId,
  userId,
  groupName,
  userName,
  lastMessageDate
) {
  if (!groupId.endsWith("@g.us")) return;

  db.run(
    `INSERT INTO group_rank (groupId, userId, groupName, userName, count, lastMessageDate) VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(groupId, userId) DO UPDATE SET count = count + 1, groupName = excluded.groupName, userName = excluded.userName, lastMessageDate = excluded.lastMessageDate`,
    [groupId, userId, groupName, userName, lastMessageDate]
  );
}

function getGeneralRanking(callback) {
  db.all(
    `SELECT userId, userName, count, lastMessageDate FROM general_rank ORDER BY count DESC`,
    [],
    (err, rows) => callback(err, rows)
  );
}

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
