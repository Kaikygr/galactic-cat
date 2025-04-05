/**
 * @file processDatabase.js
 * @description Módulo para inicializar e configurar um banco de dados MySQL e suas tabelas.
 *
 * Este módulo valida as variáveis de ambiente essenciais e exporta um
 * objeto de configuração MySQL (dbConfig) juntamente com uma função assíncrona (initDatabase)
 * que:
 *  - Cria o banco de dados especificado (ou um padrão caso não seja informado),
 *  - Estabelece uma conexão segura com o banco de dados.
 *
 * Variáveis de Ambiente:
 *   - MYSQL_LOGIN_USER (string): Obrigatório. O usuário do MySQL.
 *   - MYSQL_LOGIN_PASSWORD (string): Obrigatório. A senha do usuário do MySQL.
 *   - MYSQL_HOST (string): Opcional. O host do MySQL (padrão: "localhost").
 *   - MYSQL_DATABASE (string): Opcional. O nome do banco de dados (padrão: "cat").
 *
 * Exporta:
 * @module processDatabase
 * @property {Object} dbConfig - Objeto de configuração para criar uma conexão MySQL.
 * @property {Function} initDatabase - Função assíncrona que inicializa o banco de dados.
 *
 * @throws {Error} Lança um erro se qualquer variável de ambiente necessária estiver faltando,
 * ou se ocorrer qualquer erro na conexão do banco ou criação das tabelas.
 *
 * @async
 * @function initDatabase
 * @returns {Promise<Connection>} Uma promessa que resolve para uma conexão MySQL segura com o banco de dados especificado.
 */

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
const dbConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_LOGIN_USER,
  password: process.env.MYSQL_LOGIN_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
};

module.exports = dbConfig;

let connection; // Variável para armazenar a conexão compartilhada

/* Inicializa o banco de dados */
async function initDatabase() {
  try {
    const databaseName = process.env.MYSQL_DATABASE || "cat";

    if (!connection) {
      /* Cria conexão inicial */
      connection = await mysql.createConnection(dbConfig);

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

module.exports = {
  dbConfig,
  initDatabase,
  connection, // Exporta a conexão compartilhada
};
