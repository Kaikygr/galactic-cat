// /home/kaiky/Área de trabalho/dev/src/database/processDatabase.js
const mysql = require("mysql2/promise");
const logger = require("../utils/logger");
require("dotenv").config();

// --- Configuration and Validation ---

// Define required and optional environment variables with defaults
const ENV_VARS = {
  MYSQL_HOST: process.env.MYSQL_HOST || "localhost",
  MYSQL_LOGIN_USER: process.env.MYSQL_LOGIN_USER,
  MYSQL_LOGIN_PASSWORD: process.env.MYSQL_LOGIN_PASSWORD,
  MYSQL_DATABASE: process.env.MYSQL_DATABASE || "catGalactic", // Default database name
  MYSQL_CONNECTION_LIMIT: parseInt(process.env.MYSQL_CONNECTION_LIMIT || "20", 10), // Default pool size
};

// Validate required environment variables
const requiredEnvVars = ["MYSQL_LOGIN_USER", "MYSQL_LOGIN_PASSWORD"];
requiredEnvVars.forEach(envVar => {
  if (!ENV_VARS[envVar]) {
    // Use logger for consistency
    logger.error(`[ ENV_VARS ] ❌ Variável de ambiente obrigatória ${envVar} não definida.`);
    // Throwing an error here is appropriate as the application cannot function without credentials.
    throw new Error(`Variável de ambiente obrigatória ${envVar} não definida.`);
  }
});

// Log the configuration being used (excluding password for security)
logger.info(`[ DB Config ] Usando configuração: Host=${ENV_VARS.MYSQL_HOST}, User=${ENV_VARS.MYSQL_LOGIN_USER}, DB=${ENV_VARS.MYSQL_DATABASE}, PoolLimit=${ENV_VARS.MYSQL_CONNECTION_LIMIT}`);

// Database configuration object for the pool
const databasePoolConfig = {
  host: ENV_VARS.MYSQL_HOST,
  user: ENV_VARS.MYSQL_LOGIN_USER,
  password: ENV_VARS.MYSQL_LOGIN_PASSWORD,
  database: ENV_VARS.MYSQL_DATABASE, // Connect directly to the database
  waitForConnections: true,
  connectionLimit: ENV_VARS.MYSQL_CONNECTION_LIMIT,
  queueLimit: 0, // Unlimited queue
  charset: "utf8mb4", // Good for supporting various characters including emojis
  supportBigNumbers: true, // Recommended for potentially large IDs
  bigNumberStrings: true, // Return big numbers as strings
};

// --- Connection Pool Management ---

// Module-level variable to hold the pool instance (initialized as null)
let pool = null;

/**
 * Initializes the database connection pool.
 * Creates the database if it doesn't exist using a temporary connection.
 * @returns {Promise<mysql.Pool>} The initialized connection pool.
 * @throws {Error} If initialization fails.
 */
async function initDatabase() {
  // Avoid re-initializing if already done
  if (pool) {
    logger.debug("[ initDatabase ] Pool já inicializado.");
    return pool;
  }

  try {
    logger.info("[ initDatabase ] 🔄 Tentando inicializar o pool de conexões...");

    // 1. Create database if it doesn't exist (using a temporary connection without specifying a database)
    const tempConfig = { ...databasePoolConfig };
    delete tempConfig.database; // Remove database name for initial connection
    let tempConnection = null;
    try {
      tempConnection = await mysql.createConnection(tempConfig);
      const dbName = ENV_VARS.MYSQL_DATABASE;
      await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      logger.info(`[ initDatabase ] ✅ Banco de dados '${dbName}' verificado/criado com sucesso.`);
    } catch (dbCreateError) {
      logger.error(`[ initDatabase ] ❌ Falha ao verificar/criar o banco de dados '${ENV_VARS.MYSQL_DATABASE}':`, dbCreateError);
      throw dbCreateError; // Re-throw critical error
    } finally {
      if (tempConnection) {
        await tempConnection.end(); // Close the temporary connection
        logger.debug("[ initDatabase ] Conexão temporária fechada.");
      }
    }

    // 2. Create the actual connection pool targeting the specific database
    pool = mysql.createPool(databasePoolConfig);

    // Optional: Test the pool with a simple query
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    logger.info(`[ initDatabase ] ✅ Pool de conexões para o banco '${ENV_VARS.MYSQL_DATABASE}' inicializado com sucesso.`);
    return pool;
  } catch (error) {
    logger.error(`[ initDatabase ] ❌ Erro crítico ao inicializar o pool de conexões:`, error);
    pool = null; // Reset pool variable on failure
    throw error; // Re-throw the error to indicate failure
  }
}

/**
 * Executes a SQL query using a connection from the pool.
 * Handles connection acquisition and release automatically.
 * Uses prepared statements to prevent SQL injection.
 *
 * @param {string} query - The SQL query string (with placeholders '?').
 * @param {Array} [params=[]] - An array of parameters to bind to the query placeholders.
 * @returns {Promise<Array|object>} - Returns an array of results for SELECT, or an object with affectedRows/insertId for INSERT/UPDATE/DELETE.
 * @throws {Error} If the query execution fails or the pool is not initialized.
 */
async function runQuery(query, params = []) {
  if (!pool) {
    logger.warn("[ runQuery ] ⚠️ Pool não inicializado. Tentando inicializar...");
    try {
      await initDatabase(); // Attempt to initialize
      if (!pool) {
        // If still no pool after init attempt, something is wrong
        throw new Error("Falha ao inicializar o pool de conexões antes da consulta.");
      }
    } catch (initError) {
      logger.error("[ runQuery ] ❌ Falha crítica ao inicializar o pool durante a execução da query:", initError);
      throw initError; // Propagate the initialization error
    }
  }

  let connection = null; // Keep connection reference to ensure release
  try {
    // Get a connection from the pool
    connection = await pool.getConnection();
    logger.debug(`[ runQuery ] Conexão ${connection.threadId} obtida do pool.`);

    const startTime = process.hrtime();

    // Execute the query using prepared statements (safer against SQL injection)
    // `execute` automatically prepares and caches the statement
    const [result] = await connection.execute(query, params);

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const durationMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

    const queryType = query.trim().split(" ")[0].toUpperCase();
    logger.debug(`[ runQuery ] [${queryType}] [${durationMs}ms] Query executada com sucesso. Query: ${query.substring(0, 100)}... Params: ${JSON.stringify(params)}`);

    // Handle results based on query type
    switch (queryType) {
      case "SELECT":
        // No need to log warning for empty results here, let the caller decide if it's an issue.
        // logger.debug(`[ runQuery ] SELECT retornou ${result.length} linha(s).`);
        return result; // Return the array of rows

      case "INSERT":
        // Check affectedRows, useful for standard inserts and ON DUPLICATE KEY UPDATE
        if (result.affectedRows === 0 && !query.toUpperCase().includes("IGNORE")) {
          // Log as warning, might not always be an error (e.g., ON DUPLICATE KEY UPDATE didn't change anything)
          logger.warn(`[ runQuery ] INSERT/UPDATE (ON DUPLICATE) não afetou linhas. Query: ${query}`);
        }
        // logger.debug(`[ runQuery ] INSERT result: insertId=${result.insertId}, affectedRows=${result.affectedRows}`);
        return {
          insertId: result.insertId,
          affectedRows: result.affectedRows,
        };

      case "UPDATE":
      case "DELETE":
        // logger.debug(`[ runQuery ] ${queryType} result: affectedRows=${result.affectedRows}, changedRows=${result.changedRows || 'N/A'}`);
        return {
          affectedRows: result.affectedRows,
          // changedRows is specific to UPDATE, might not be present in DELETE results object
          changedRows: result.changedRows !== undefined ? result.changedRows : null,
        };

      default:
        // For other query types like CREATE, ALTER, etc.
        logger.debug(`[ runQuery ] Query (${queryType}) executada, retornando resultado bruto.`);
        return result;
    }
  } catch (err) {
    // Log detailed error information
    logger.error(
      `[ runQuery ] ❌ Erro ao executar query:
    → Query: ${query}
    → Parâmetros: ${JSON.stringify(params)}
    → Erro: ${err.message} (Code: ${err.code})`,
      { stack: err.stack }
    ); // Include stack trace for better debugging
    throw err; // Re-throw the error so the calling function knows it failed
  } finally {
    // **Crucial:** Always release the connection back to the pool
    if (connection) {
      try {
        connection.release();
        logger.debug(`[ runQuery ] Conexão ${connection.threadId} liberada de volta para o pool.`);
      } catch (releaseError) {
        logger.error(`[ runQuery ] ❌ Erro ao liberar a conexão ${connection.threadId}:`, releaseError);
      }
    }
  }
}

// --- Exports ---

module.exports = {
  // databasePoolConfig, // Usually not needed externally, but can be exported if required
  initDatabase, // Function to initialize the pool (can be called at app startup)
  runQuery, // The primary function to interact with the database
  // 'pool' is not exported directly to encourage using runQuery which handles connection management
};
