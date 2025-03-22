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