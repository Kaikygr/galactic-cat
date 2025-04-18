const mysql = require("mysql2/promise");
const logger = require("../utils/logger");
require("dotenv").config();

// --- Configuração e Validação ---

// Define variáveis de ambiente obrigatórias e opcionais com valores padrão
const ENV_VARS = {
  MYSQL_HOST: process.env.MYSQL_HOST || "localhost",
  MYSQL_LOGIN_USER: process.env.MYSQL_LOGIN_USER,
  MYSQL_LOGIN_PASSWORD: process.env.MYSQL_LOGIN_PASSWORD,
  MYSQL_DATABASE: process.env.MYSQL_DATABASE || "catGalactic",
  MYSQL_CONNECTION_LIMIT: parseInt(process.env.MYSQL_CONNECTION_LIMIT || "20", 10),
  VERIFY_POOL_ON_INIT: process.env.VERIFY_POOL_ON_INIT === "true",
  MYSQL_CONNECT_TIMEOUT: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || "10000", 10),
};

// Valida variáveis de ambiente obrigatórias
const requiredEnvVars = ["MYSQL_LOGIN_USER", "MYSQL_LOGIN_PASSWORD"];
requiredEnvVars.forEach(envVar => {
  if (!ENV_VARS[envVar]) {
    logger.error(`[ ENV_VARS ] ❌ Variável de ambiente obrigatória ${envVar} não definida.`);
    throw new Error(`Variável de ambiente obrigatória ${envVar} não definida.`);
  }
});

// Log da configuração sendo usada (excluindo senha por segurança)
logger.info(
  `[ DB Config ] Usando configuração: Host=${ENV_VARS.MYSQL_HOST}, User=${ENV_VARS.MYSQL_LOGIN_USER}, DB=${ENV_VARS.MYSQL_DATABASE}, PoolLimit=${ENV_VARS.MYSQL_CONNECTION_LIMIT}, VerifyPoolOnInit=${ENV_VARS.VERIFY_POOL_ON_INIT}, ConnectTimeout=${ENV_VARS.MYSQL_CONNECT_TIMEOUT}ms`
);

// Objeto de configuração do banco de dados para o pool
const databasePoolConfig = {
  host: ENV_VARS.MYSQL_HOST,
  user: ENV_VARS.MYSQL_LOGIN_USER,
  password: ENV_VARS.MYSQL_LOGIN_PASSWORD,
  database: ENV_VARS.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: ENV_VARS.MYSQL_CONNECTION_LIMIT,
  queueLimit: 0,
  charset: "utf8mb4",
  supportBigNumbers: true,
  bigNumberStrings: true,
  connectTimeout: ENV_VARS.MYSQL_CONNECT_TIMEOUT,
};

// --- Gerenciamento do Pool de Conexões ---

let pool = null;

/**
 * Garante que o banco de dados especificado existe, criando-o se necessário.
 * Usa uma conexão temporária e verifica com um ping.
 * @param {object} baseConfig - Configuração de conexão do banco *sem* o nome do banco.
 * @param {string} dbName - O nome do banco de dados a ser verificado.
 * @throws {Error} Se a verificação/criação do banco falhar.
 */
async function ensureDatabaseExists(baseConfig, dbName) {
  let tempConnection = null;
  const startTime = process.hrtime();
  try {
    tempConnection = await mysql.createConnection(baseConfig);

    await tempConnection.ping();
    const [pingSeconds, pingNanoseconds] = process.hrtime(startTime);
    const pingMs = (pingSeconds * 1000 + pingNanoseconds / 1e6).toFixed(2);
    //logger.debug(`[ ensureDatabaseExists ] Ping da conexão temporária bem-sucedido (${pingMs}ms).`);

    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    logger.info(
      `[ ensureDatabaseExists ] ✅ Banco de dados '${dbName}' verificado/criado com sucesso.`
    );
  } catch (dbCreateError) {
    logger.error(
      `[ ensureDatabaseExists ] ❌ Falha ao conectar/verificar/criar o banco de dados '${dbName}': ${dbCreateError.message}`,
      { code: dbCreateError.code, sqlState: dbCreateError.sqlState, stack: dbCreateError.stack }
    );
    throw dbCreateError;
  } finally {
    if (tempConnection) {
      await tempConnection.end();
    }
  }
}

/**
 * Inicializa o pool de conexões do banco de dados.
 * Cria o banco de dados se não existir usando uma conexão temporária.
 * Opcionalmente pinga um pool existente para verificar sua saúde antes de retorná-lo.
 * @returns {Promise<mysql.Pool>} O pool de conexões inicializado.
 * @throws {Error} Se a inicialização falhar.
 */
async function initDatabase() {
  if (pool && ENV_VARS.VERIFY_POOL_ON_INIT) {
    logger.info(
      "[ initDatabase ] 🩺 Verificando saúde do pool existente (VERIFY_POOL_ON_INIT=true)..."
    );
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      logger.info("[ initDatabase ] ✅ Pool existente está ativo.");
      return pool;
    } catch (pingError) {
      logger.warn(
        `[ initDatabase ] ⚠️ Pool existente parece inativo (Erro: ${pingError.message}). Recriando...`
      );
      await closePool().catch(endError => {
        logger.warn(
          `[ initDatabase ] Aviso ao fechar pool inativo durante recriação: ${endError.message}`
        );
      });
    }
  } else if (pool) {
    return pool;
  }

  // --- Lógica de Criação do Pool ---
  try {
    logger.info("[ initDatabase ] 🔄 Tentando inicializar o pool de conexões...");

    const tempConfig = { ...databasePoolConfig };
    delete tempConfig.database;
    await ensureDatabaseExists(tempConfig, ENV_VARS.MYSQL_DATABASE);

    pool = mysql.createPool(databasePoolConfig);

    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    logger.info(
      `[ initDatabase ] ✅ Pool de conexões para o banco '${ENV_VARS.MYSQL_DATABASE}' inicializado com sucesso.`
    );
    return pool;
  } catch (error) {
    logger.error(
      `[ initDatabase ] ❌ Erro crítico ao inicializar o pool de conexões: ${error.message}`,
      { code: error.code, sqlState: error.sqlState, stack: error.stack }
    );
    pool = null;
    throw error;
  }
}

// --- Definições de Tipos JSDoc ---
/** @typedef {Array<object>} SelectResult */
/** @typedef {object} InsertResult @property {number|string} insertId @property {number} affectedRows */
/** @typedef {object} UpdateOrDeleteResult @property {number} affectedRows @property {number|null} changedRows */
/** @typedef {object} DDLResult */

/**
 * Executa uma consulta SQL usando uma conexão do pool.
 * Gerencia automaticamente a aquisição e liberação da conexão.
 * Usa declarações preparadas para prevenir injeção SQL.
 *
 * @param {string} query - A string de consulta SQL (com placeholders '?').
 * @param {Array} [params=[]] - Um array de parâmetros para vincular aos placeholders da query.
 * @returns {Promise<SelectResult|InsertResult|UpdateOrDeleteResult|DDLResult>} - Retorna resultados baseados no tipo da query.
 * @throws {Error} Se a execução da query falhar ou o pool não estiver inicializado.
 */
async function runQuery(query, params = []) {
  if (!pool) {
    logger.warn("[ runQuery ] ⚠️ Pool não inicializado. Tentando inicializar...");
    try {
      await initDatabase();
      if (!pool) {
        throw new Error("Falha ao inicializar o pool de conexões antes da consulta.");
      }
    } catch (initError) {
      logger.error(
        `[ runQuery ] ❌ Falha crítica ao inicializar o pool durante a execução da query: ${initError.message}`,
        { code: initError.code, sqlState: initError.sqlState, stack: initError.stack }
      );
      throw initError;
    }
  }

  let connection = null;
  try {
    connection = await pool.getConnection();

    const startTime = process.hrtime();
    const [result] = await connection.execute(query, params);

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const durationMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

    const queryType = query.trim().split(" ")[0].toUpperCase();

    switch (queryType) {
      case "SELECT":
        return result;

      case "INSERT":
        if (
          result.affectedRows === 0 &&
          !query.toUpperCase().includes("IGNORE") &&
          !query.toUpperCase().includes("ON DUPLICATE KEY UPDATE")
        ) {
          logger.warn(`[ runQuery ] INSERT não afetou linhas (affectedRows: 0). Query: ${query}`);
        }
        return {
          insertId: result.insertId,
          affectedRows: result.affectedRows,
        };

      case "UPDATE":
      case "DELETE":
        if (result.affectedRows === 0) {
          if (query.toUpperCase().includes("WHERE")) {
            logger.warn(
              `[ runQuery ] ${queryType} não afetou linhas (affectedRows: 0), provável que a condição WHERE não correspondeu. Query: ${query}`
            );
          } else {
            logger.warn(
              `[ runQuery ] ${queryType} não afetou linhas (affectedRows: 0). Query: ${query}`
            );
          }
        }
        return {
          affectedRows: result.affectedRows,
          changedRows: result.changedRows !== undefined ? result.changedRows : null,
        };

      case "CREATE":
      case "ALTER":
      case "DROP":
      case "TRUNCATE":
        logger.info(
          `[ runQuery ] Executada query DDL (${queryType}). Query: ${query.substring(0, 150)}...`
        );
        return result;

      default:
        logger.info(
          `[ runQuery ] Executada query do tipo '${queryType}'. Query: ${query.substring(
            0,
            150
          )}...`
        );
        return result;
    }
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      logger.warn(
        `[ runQuery ] Violação de chave única/duplicada detectada (ER_DUP_ENTRY). Query: ${query}`,
        { params }
      );
    } else if (err.code === "ER_NO_SUCH_TABLE") {
      logger.error(`[ runQuery ] Tabela não encontrada (ER_NO_SUCH_TABLE). Query: ${query}`);
    } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      logger.error(
        `[ runQuery ] Erro de conexão com o banco de dados (${err.code}). Verifique host/porta/disponibilidade.`
      );
    }
    logger.error(
      `[ runQuery ] ❌ Erro ao executar query:
      → Query: ${query}
      → Parâmetros: ${JSON.stringify(params)}
      → Erro: ${err.message}`,
      { code: err.code, sqlState: err.sqlState, stack: err.stack }
    );
    throw err;
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (releaseError) {
        logger.error(
          `[ runQuery ] ❌ Erro ao liberar a conexão ${connection.threadId}: ${releaseError.message}`,
          { stack: releaseError.stack }
        );
      }
    }
  }
}

/**
 * Fecha graciosamente o pool de conexões do banco de dados.
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    logger.info("[ closePool ] ⏳ Encerrando pool de conexões...");
    try {
      await pool.end();
      pool = null;
      logger.info("[ closePool ] ✅ Pool de conexões encerrado com sucesso.");
    } catch (err) {
      logger.error(`[ closePool ] ❌ Erro ao encerrar o pool de conexões: ${err.message}`, {
        code: err.code,
        sqlState: err.sqlState,
        stack: err.stack,
      });
      pool = null;
      throw err;
    }
  } else {
    logger.info("[ closePool ] 🤷 Pool já estava fechado ou não inicializado.");
  }
}

module.exports = {
  initDatabase,
  runQuery,
  closePool,
  getPool: () => pool,
};
