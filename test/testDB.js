require('dotenv').config({ path: '../.env' });

const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

client.connect()
  .then(() => console.log('🎉 Conectado ao PostgreSQL!'))
    .catch(err => console.error('❌ Erro ao conectar:', err.message));
  console.log('DB_PASSWORD:', typeof process.env.DB_PASSWORD, process.env.DB_PASSWORD);
console.log('DB_HOST:', typeof process.env.DB_HOST, process.env.DB_HOST);   
console.log('DB_PORT:', typeof process.env.DB_PORT, process.env.DB_PORT);
console.log('DB_NAME:', typeof process.env.DB_NAME, process.env.DB_NAME);
console.log('DB_USER:', typeof process.env.DB_USER, process.env.DB_USER);
