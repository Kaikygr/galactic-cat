const mysql = require("mysql2/promise");
require("dotenv").config();

const dbConfig = {
  host: "localhost",
  user: process.env.MYSQL_LOGIN_USER,
  password: process.env.MYSQL_LOGIN_USER_PASSWORD,
  multipleStatements: true,
  charset: "utf8mb4",
};

async function initDatabase() {
  const connection = await mysql.createConnection(dbConfig);
  await connection.execute("CREATE DATABASE IF NOT EXISTS cat");
  console.log("Database 'cat' está pronto.");

  const db = await mysql.createConnection({ ...dbConfig, database: "cat" });
  console.log("Conectado ao database 'cat'.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS \`groups\` (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      owner VARCHAR(255),
      created_at DATETIME,
      description TEXT
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("✅ Tabela groups verificada/criada.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender VARCHAR(255),
      pushName VARCHAR(255),
      isGroup TINYINT,
      messageType VARCHAR(255),
      messageContent TEXT,
      timestamp DATETIME,
      group_id VARCHAR(255) DEFAULT 'privado',
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE SET NULL
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("✅ Tabela users verificada/criada.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS group_participants (
      group_id VARCHAR(255),
      participant VARCHAR(255),
      isAdmin TINYINT,
      PRIMARY KEY (group_id, participant)
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("✅ Tabela group_participants verificada/criada.");

  return db;
}

module.exports = {
  dbConfig,
  initDatabase,
};
