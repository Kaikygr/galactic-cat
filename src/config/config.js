const { cleanEnv, makeValidator } = require('envalid');
const logger = require('../utils/logger');
let env;

// validação do prefixo do bot
const commandPrefix = makeValidator((input) => {
  if (!/^[!@#$%^&*\/]$/.test(input)) {
    throw new Error('BOT_GLOBAL_PREFIX deve ser um único caractere especial (ex: /, !, #)');
  }
  return input;
});

try {
  env = cleanEnv(process.env, {
    BOT_GLOBAL_PREFIX: commandPrefix(),
  });
} catch (error) {
  logger.error('Erro ao validar variáveis de ambiente:', error);
}

module.exports = {
  env,
  botPrefix: env.BOT_GLOBAL_PREFIX,
};
