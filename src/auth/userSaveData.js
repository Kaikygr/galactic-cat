

/**
 * Processes incoming messaging data and persists or updates participant and log information in the PostgreSQL database.
 *
 * This asynchronous function performs the following steps:
 * 1. Establishes a connection to the PostgreSQL database using environment variables.
 * 2. Checks if the "geral" table exists; if not, creates it with columns for participant_id, name, message_id, timestamp, and count.
 * 3. Checks if the "logs" table exists; if not, creates it to store the full JSON of the message.
 * 4. Extracts the participant identifier from the message using either the "participant" field or the "remoteJid" (if valid).
 * 5. Retrieves the sender's name, message ID, and timestamp (processing the timestamp if it's an object).
 * 6. Inserts a new record into the "geral" table or updates an existing record using an upsert operation (incrementing the message count on conflict).
 * 7. Inserts the full JSON of the message into the "logs" table, doing nothing on conflict (i.e., if the message already exists).
 * 8. Closes the database connection in the finally block.
 *
 * @param {Object} data - The incoming data containing messages.
 * @param {Array<Object>} data.messages - An array of message objects.
 * @param {Object} data.messages[].key - The key object that contains identifier properties for the message.
 * @param {string} [data.messages[].key.participant] - Optional participant identifier.
 * @param {string} [data.messages[].key.remoteJid] - Remote JID, used when the participant identifier is not directly available.
 * @param {string} data.messages[].pushName - The name of the sender.
 * @param {number|Object} data.messages[].messageTimestamp - The timestamp of the message, which can be a number or an object with a 'low' property.
 * @param {string} data.messages[].key.id - The unique identifier for the message.
 *
 * @returns {Promise<void>} A promise that resolves when the data processing and database operations complete.
 *
 * @throws {Error} Throws an error if database connection or query execution fails.
 */


const { Client } = require('pg');
require('dotenv').config();

async function processMessage(data) {
    const message = data.messages[0];

    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        await client.connect();

        const tableExistsQuery = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'geral'
            )
        `;
        const tableExistsResult = await client.query(tableExistsQuery);

        if (!tableExistsResult.rows[0].exists) {
            const createTableQuery = `
                CREATE TABLE geral (
                    participant_id TEXT PRIMARY KEY,
                    name TEXT,
                    message_id TEXT,
                    timestamp BIGINT,
                    count INT DEFAULT 1
                )
            `;
            await client.query(createTableQuery);
        }

        const logsTableExistsQuery = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'logs'
            )
        `;
        const logsTableExistsResult = await client.query(logsTableExistsQuery);

        if (!logsTableExistsResult.rows[0].exists) {
            const createLogsTableQuery = `
                CREATE TABLE logs (
                    message_id TEXT PRIMARY KEY,
                    full_json JSONB
                )
            `;
            await client.query(createLogsTableQuery);
        }

        const participant =
            message.key.participant ||
            (message.key.remoteJid && !message.key.remoteJid.endsWith('g.us') ? message.key.remoteJid : null);

        if (!participant) {
            console.warn('Não foi possível encontrar o participant ou remoteJid válido - mensagem ignorada');
            return;
        }

        const name = message.pushName;
        const messageId = message.key.id;

        const rawTimestamp = message.messageTimestamp;
        const timestamp = typeof rawTimestamp === 'object' && 'low' in rawTimestamp
            ? rawTimestamp.low
            : rawTimestamp;

        const fullJson = JSON.stringify(message); 

        const upsertQuery = `
            INSERT INTO geral (participant_id, name, message_id, timestamp, count)
            VALUES ($1, $2, $3, $4, 1)
            ON CONFLICT (participant_id)
            DO UPDATE SET 
                name = EXCLUDED.name,
                message_id = EXCLUDED.message_id,
                timestamp = EXCLUDED.timestamp,
                count = geral.count + 1
        `;
        const upsertValues = [participant, name, messageId, timestamp];
        await client.query(upsertQuery, upsertValues);

        const insertLogsQuery = `
            INSERT INTO logs (message_id, full_json)
            VALUES ($1, $2)
            ON CONFLICT (message_id)
            DO NOTHING
        `;
        const insertLogsValues = [messageId, fullJson];
        await client.query(insertLogsQuery, insertLogsValues);

        console.log('Dados salvos no banco com sucesso!');
    } catch (error) {
        console.error('Erro ao processar ou salvar no banco:', error.message);
        throw error;
    } finally {
        await client.end();
    }
}

module.exports = { processMessage };