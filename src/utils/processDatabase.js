const mysql = require("mysql2/promise");
const logger = require("./logger");
require("dotenv").config();

/* Verifica se as variáveis de ambiente necessárias estão definidas */
const requiredEnvVars = ["MYSQL_LOGIN_USER", "MYSQL_LOGIN_PASSWORD"];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Variável de ambiente ${envVar} é necessária.`);
  }
});

/* Configuração do banco de dados */
const databaseConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_LOGIN_USER,
  password: process.env.MYSQL_LOGIN_PASSWORD,
  waitForConnections: true,
  connectionLimit: 20,
  charset: "utf8mb4",
};

let connection;

/* Inicializa o banco de dados */
async function initDatabase() {
  try {
    const databaseName = process.env.MYSQL_DATABASE || "cat";

    if (!connection) {
      /* Cria conexão inicial */
      connection = await mysql.createConnection(databaseConfig);

      /* Cria o banco de dados, se necessário */
      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      logger.info(`Banco '${databaseName}' criado ou já existente.`);

      /* Reconfigura a conexão para usar o banco criado */
      await connection.changeUser({ database: databaseName });
      logger.info(`Conectado ao banco '${databaseName}'.`);
    }
  } catch (error) {
    /* Loga e propaga erros */
    logger.error(`Erro ao inicializar banco: ${error.stack}`);
    throw error;
  }

  return connection;
}

/* 
Executa uma query com tratamento de erros e validações específicas por tipo de operação.
*/
async function runQuery(query, params = []) {
  try {
    if (!connection) {
      throw new Error("Conexão com o banco de dados não inicializada.");
    }

    const startTime = process.hrtime();
    const [result] = await connection.execute(query, params);
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const durationMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

    // Identifica o tipo de query
    const queryType = query.trim().split(" ")[0].toUpperCase();
    const isIgnoreQuery = query.toUpperCase().includes("INSERT IGNORE");

    // Log de sucesso
    logger.debug(`✓ Query ${queryType} executada em ${durationMs}ms:\n→ Query: ${query}\n→ Parâmetros: ${JSON.stringify(params)}`);

    // Validações e retornos específicos por tipo
    switch (queryType) {
      case "SELECT":
        if (!result || result.length === 0) {
          logger.debug(`⚠️ Nenhum resultado encontrado para a consulta`);
          return [];
        }
        return result;

      case "INSERT":
        if (!result.affectedRows && !isIgnoreQuery) {
          throw new Error("Nenhuma linha foi inserida");
        }
        return {
          insertId: result.insertId,
          affectedRows: result.affectedRows,
        };

      case "UPDATE":
      case "DELETE":
        return {
          affectedRows: result.affectedRows,
          changedRows: result.changedRows,
        };

      default:
        return result;
    }
  } catch (err) {
    logger.error(`❌ Erro ao executar query:\n→ Query: ${query}\n→ Parâmetros: ${JSON.stringify(params)}\n→ Detalhes: ${err.message}`);
    throw new Error(`Erro na execução da consulta: ${err.message}`);
  }
}

module.exports = {
  databaseConfig,
  initDatabase,
  connection,
  runQuery,
};
