const mysql = require("mysql2/promise");
const logger = require("./logger");
require("dotenv").config();

/** @type {import('mysql2/promise').Connection} */
let connection;

/** @type {string[]} Lista de variáveis de ambiente obrigatórias */
const requiredEnvVars = ["MYSQL_LOGIN_USER", "MYSQL_LOGIN_PASSWORD"];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`[ requiredEnvVars ] ❌ Variável de ambiente ${envVar} é necessária.`);
  }
});

/** @type {import('mysql2/promise').ConnectionOptions} Configuração da conexão com o banco de dados */
const databaseConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_LOGIN_USER,
  password: process.env.MYSQL_LOGIN_PASSWORD,
  waitForConnections: true,
  connectionLimit: 20,
  charset: "utf8mb4",
};

<<<<<<< HEAD
/**
 * Inicializa a conexão com o banco de dados e cria o banco se não existir
 * @async
 * @returns {Promise<import('mysql2/promise').Connection>} Conexão com o banco de dados
 * @throws {Error} Se houver erro na inicialização do banco
 */
=======
let connection;

/* Inicializa o banco de dados */
>>>>>>> 456f7e6 (refatorar createTables e ensureDatabaseConnection: melhorar logs e tratamento de erros)
async function initDatabase() {
  try {
    const databaseName = process.env.MYSQL_DATABASE || "catGalactic";

    if (!connection) {
      connection = await mysql.createConnection(databaseConfig);

      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      logger.info(`[ initDatabase ] 🗂️ Banco '${databaseName}' criado ou já existente.`);

      await connection.changeUser({ database: databaseName });
      logger.info(`[ initDatabase ] 🗂️ Conectado ao banco '${databaseName}'.`);
    }
  } catch (error) {
    logger.error(`[ initDatabase ] ❌ Erro ao inicializar banco: ${error}`);
    throw error;
  }

  return connection;
}

/**
 * Executa uma query no banco de dados
 * @async
 * @param {string} query - Query SQL a ser executada
 * @param {Array<any>} [params=[]] - Parâmetros para a query
 * @returns {Promise<Array<any>|Object>} Resultado da query
 * @throws {Error} Se houver erro na execução da query
 */
async function runQuery(query, params = []) {
  try {
    if (!connection) {
      connection = await initDatabase();
    }

    const startTime = process.hrtime();
    const [result] = await connection.execute(query, params);
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const durationMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

    const queryType = query.trim().split(" ")[0].toUpperCase();
    const isIgnoreQuery = query.toUpperCase().includes("INSERT IGNORE");

    switch (queryType) {
      case "SELECT":
        if (!result || result.length === 0) {
          logger.warn(`[ runQuery ] ❌ Nenhum resultado encontrado para a consulta`);
          return [];
        }
        return result;

      case "INSERT":
        if (!result.affectedRows && !isIgnoreQuery) {
          throw new Error("[ runQuery ] ❌ Nenhuma linha foi inserida");
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
    logger.error(`[ runQuery ] ❌ Erro ao executar query:\n→ Query: ${query}\n→ Parâmetros: ${JSON.stringify(params)}\n→ Detalhes: ${err}`);
    throw err;
  }
}

/**
 * @type {{
 *   databaseConfig: import('mysql2/promise').ConnectionOptions,
 *   initDatabase: () => Promise<import('mysql2/promise').Connection>,
 *   connection: import('mysql2/promise').Connection,
 *   runQuery: (query: string, params?: Array<any>) => Promise<Array<any>|Object>
 * }}
 */
module.exports = {
  databaseConfig,
  initDatabase,
  connection,
  runQuery,
};
