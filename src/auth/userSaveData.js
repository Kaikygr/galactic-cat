const { Client } = require('pg');
require('dotenv').config();

// Função para processar e salvar dados
async function processMessage(data) {
    // Utiliza data.messages[0] para todas as referências
    const message = data.messages[0];
    console.log(message);

    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        // Conectar ao banco de dados
        await client.connect();

        // Verificar se a tabela geral já existe antes de tentar criá-la
        const tableExistsQuery = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'geral'
            )
        `;
        const tableExistsResult = await client.query(tableExistsQuery);

        if (!tableExistsResult.rows[0].exists) {
            // Criar a tabela geral se não existir
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

        // Verificar se a tabela logs já existe antes de tentar criá-la
        const logsTableExistsQuery = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'logs'
            )
        `;
        const logsTableExistsResult = await client.query(logsTableExistsQuery);

        if (!logsTableExistsResult.rows[0].exists) {
            // Criar a tabela logs se não existir
            const createLogsTableQuery = `
                CREATE TABLE logs (
                    message_id TEXT PRIMARY KEY,
                    full_json JSONB
                )
            `;
            await client.query(createLogsTableQuery);
        }

        // Verifica se a chave participant está presente e válida, senão usa remoteJid
        const participant =
            message.key.participant ||
            (message.key.remoteJid && !message.key.remoteJid.endsWith('g.us') ? message.key.remoteJid : null);

        // Se nenhum valor válido for encontrado, lança erro
        if (!participant) {
            throw new Error('Não foi possível encontrar o participant ou remoteJid válido');
        }

        // Extraindo os dados necessários a partir de message
        const name = message.pushName;
        const messageId = message.key.id;

        // Converte o timestamp para um número válido
        const rawTimestamp = message.messageTimestamp;
        const timestamp = typeof rawTimestamp === 'object' && 'low' in rawTimestamp
            ? rawTimestamp.low // Use a propriedade 'low' como timestamp
            : rawTimestamp;

        const fullJson = JSON.stringify(message); // O JSON completo

        // Caso o participante seja de grupo, trata a lógica
        if (message.key.remoteJid.endsWith('.g.us')) {
            console.log(`Grupo: ${message.key.remoteJid} - Participante: ${participant}`);
        } else {
            console.log(`Chat privado: ${participant}`);
        }

        console.log(`Mensagem de ${name}`);

        // Inserir ou atualizar os dados na tabela geral
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

        // Inserir os dados na tabela logs
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
        // Fechar a conexão com o banco de dados
        await client.end();
    }
}

module.exports = { processMessage };