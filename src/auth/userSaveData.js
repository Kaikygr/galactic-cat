
const { Client } = require('pg');
require('dotenv').config();

async function processMessage(data) {
    const message = data.messages[0];

   
}

module.exports = { processMessage };