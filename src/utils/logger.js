require("dotenv").config();
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const { cleanEnv, str, choices } = require("envalid");
const util = require("util");
const fs = require("fs");
const path = require("path");

const LOG_LEVELS = { error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6 };
const LOG_LEVEL_NAMES = Object.keys(LOG_LEVELS);

const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ["development", "production", "test"],
    default: "development",
    desc: "Node environment",
  }),
  LOG_LEVEL: str({
    choices: LOG_LEVEL_NAMES,
    default: process.env.NODE_ENV === "production" ? "info" : "debug",
    desc: "Logging level",
  }),
  ECOSYSTEM_NAME: str({ default: "system", desc: "Service name for logs" }),
  PM2_INSTANCE_ID: str({ default: undefined, desc: "PM2 instance ID (standard)" }),
  NODE_APP_INSTANCE: str({ default: undefined, desc: "PM2 instance ID (alternative)" }),
  pm_id: str({ default: undefined, desc: "PM2 instance ID (legacy)" }),
});

const IS_PRODUCTION = env.NODE_ENV === "production";
const DEFAULT_LOG_LEVEL = env.LOG_LEVEL;
const INSTANCE_ID = env.PM2_INSTANCE_ID ?? env.NODE_APP_INSTANCE ?? env.pm_id ?? "local";
const ECOSYSTEM_NAME = env.ECOSYSTEM_NAME;
const NODE_ENV = env.NODE_ENV;

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const LOG_DIR_PATH = path.join(PROJECT_ROOT, "logs");

const LOG_DEFAULTS = {
  LOG_DIR: LOG_DIR_PATH,
  APP_LOG_FILENAME: "application-%DATE%.log",
  ERROR_LOG_FILENAME: "error-%DATE%.log",
  WARN_LOG_FILENAME: "warn-%DATE%.log",
  DATE_PATTERN: "YYYY-MM-DD",
  ZIPPED_ARCHIVE: true,
  MAX_SIZE_APP: "20m",
  MAX_FILES_APP: "14d",
  MAX_SIZE_ERROR: "10m",
  MAX_FILES_ERROR: "30d",
  MAX_SIZE_WARN: "10m",
  MAX_FILES_WARN: "14d",
  FILE_PERMISSIONS: 0o777,
  DIR_PERMISSIONS: 0o777,
};

const SENSITIVE_KEYS = new Set(["password", "token", "apiKey", "secret", "authorization", "credentials", "usersession"]);
const REDACTION_MASK = "********";

const LOG_COLORS = { error: "red", warn: "yellow", info: "green", http: "magenta", verbose: "cyan", debug: "blue", silly: "grey" };
winston.addColors(LOG_COLORS);

function deepRedact(data) {
  if (Array.isArray(data)) {
    return data.map(deepRedact);
  }
  if (data && typeof data === "object" && data !== null) {
    return Object.entries(data).reduce((acc, [key, value]) => {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        acc[key] = REDACTION_MASK;
      } else {
        acc[key] = deepRedact(value);
      }
      return acc;
    }, {});
  }
  return data;
}

const redactFormat = winston.format(info => {
  if (info.metadata && typeof info.metadata === "object" && info.metadata !== null) {
    info.metadata = deepRedact(info.metadata);
  }
  return info;
});

const consoleFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.colorize({ all: true }),
  winston.format.splat(),
  winston.format.metadata({ fillExcept: ["message", "level", "timestamp", "label", "service", "instanceId", "environment", "stack"] }), // Keep stack out of metadata
  winston.format.printf(info => {
    const { timestamp, level, message, metadata, stack } = info;
    const label = metadata?.label;
    const labelPart = label ? ` [${label}]` : "";
    const metaToPrint = { ...metadata };
    if (label) {
      delete metaToPrint.label;
    }

    const metaPart = Object.keys(metaToPrint).length > 0 ? ` ${util.inspect(metaToPrint, { colors: true, depth: 2 })}` : "";

    const servicePart = info.service ? ` [${info.service}]` : "";
    const instancePart = info.instanceId ? ` [${info.instanceId}]` : "";

    const stackPart = stack ? `\n${stack}` : "";

    return `[${timestamp}] [${level}]${servicePart}${instancePart}${labelPart} - ${message}${metaPart}${stackPart}`;
  })
);

const fileFormat = winston.format.combine(redactFormat(), winston.format.timestamp(), winston.format.splat(), winston.format.errors({ stack: true }), winston.format.metadata({ fillExcept: ["message", "level", "timestamp", "service", "instanceId", "environment", "stack"] }), winston.format.json());

const getDefaultTransportDefinitions = level => [
  {
    type: "console",
    options: {
      level: level,
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true,
    },
  },
  {
    type: "dailyRotateFile",
    options: {
      filename: path.join(LOG_DEFAULTS.LOG_DIR, LOG_DEFAULTS.APP_LOG_FILENAME),
      datePattern: LOG_DEFAULTS.DATE_PATTERN,
      zippedArchive: LOG_DEFAULTS.ZIPPED_ARCHIVE,
      maxSize: LOG_DEFAULTS.MAX_SIZE_APP,
      maxFiles: LOG_DEFAULTS.MAX_FILES_APP,
      level: level,
      format: fileFormat,
      mode: LOG_DEFAULTS.FILE_PERMISSIONS,
    },
  },
  {
    type: "dailyRotateFile",
    options: {
      filename: path.join(LOG_DEFAULTS.LOG_DIR, LOG_DEFAULTS.ERROR_LOG_FILENAME),
      level: "error",
      datePattern: LOG_DEFAULTS.DATE_PATTERN,
      zippedArchive: LOG_DEFAULTS.ZIPPED_ARCHIVE,
      maxSize: LOG_DEFAULTS.MAX_SIZE_ERROR,
      maxFiles: LOG_DEFAULTS.MAX_FILES_ERROR,
      format: fileFormat,
      mode: LOG_DEFAULTS.FILE_PERMISSIONS,
      handleExceptions: true,
      handleRejections: true,
    },
  },
  {
    type: "dailyRotateFile",
    options: {
      filename: path.join(LOG_DEFAULTS.LOG_DIR, LOG_DEFAULTS.WARN_LOG_FILENAME),
      level: "warn",
      datePattern: LOG_DEFAULTS.DATE_PATTERN,
      zippedArchive: LOG_DEFAULTS.ZIPPED_ARCHIVE,
      maxSize: LOG_DEFAULTS.MAX_SIZE_WARN,
      maxFiles: LOG_DEFAULTS.MAX_FILES_WARN,
      format: fileFormat,
      mode: LOG_DEFAULTS.FILE_PERMISSIONS,
    },
  },
];

function ensureLogDirectoryExists() {
  const logDir = LOG_DEFAULTS.LOG_DIR;
  const dirMode = LOG_DEFAULTS.DIR_PERMISSIONS;

  try {
    fs.mkdirSync(logDir, { recursive: true, mode: dirMode });

    console.log(`[ LoggerSetup ] Diretório de log garantido: '${logDir}' (modo ${dirMode.toString(8)})`);
  } catch (error) {
    console.error(`\n[ LoggerSetup ] !!! ERRO CRÍTICO !!!`);
    console.error(`Falha ao criar ou garantir acesso de escrita ao diretório de log: '${logDir}'`);
    console.error(`Tentativa de usar modo: ${dirMode.toString(8)}`);
    console.error(`Código do Erro: ${error.code}`);
    console.error(`Mensagem do Erro: ${error.message}`);
    console.error(`\n>>> Por favor, verifique manualmente o seguinte:`);
    console.error(`1. O diretório '${logDir}' existe?`);
    console.error(`2. Quem é o proprietário do diretório? (Use: ls -ld '${logDir}') - Deve ser o usuário que executa o script (kaiky).`);
    console.error(`3. O usuário 'kaiky' tem permissão de ESCRITA (w) neste diretório? (Verifique as permissões em ls -ld).`);
    console.error(`4. O usuário 'kaiky' tem permissão de ESCRITA (w) no diretório PAI ('${PROJECT_ROOT}') para permitir a criação de 'logs'? (Use: ls -ld '${PROJECT_ROOT}')`);
    console.error(`\nCorrija as permissões manualmente (ex: usando 'sudo chown kaiky:kaiky ${logDir}' e 'chmod u+w ${logDir}') e reinicie a aplicação.\n`);
    throw new Error(`Falha na configuração do Logger: Não foi possível acessar/criar o diretório de log '${logDir}'. Erro original: ${error.message}`);
  }
}

const createLoggerInstance = (overrideOptions = {}) => {
  ensureLogDirectoryExists();

  const effectiveLevel = overrideOptions.level || DEFAULT_LOG_LEVEL;

  let configuredTransports;
  if (overrideOptions.transports) {
    configuredTransports = overrideOptions.transports;
  } else {
    const transportDefinitions = overrideOptions.transportDefinitions || getDefaultTransportDefinitions(effectiveLevel);
    configuredTransports = transportDefinitions
      .map(def => {
        try {
          switch (def.type) {
            case "console":
              return new winston.transports.Console(def.options);
            case "dailyRotateFile":
              return new DailyRotateFile(def.options);
            default:
              console.warn(`[ LoggerSetup ] Tipo de transporte desconhecido: ${def.type}. Pulando.`);
              return null;
          }
        } catch (error) {
          console.error(`[ LoggerSetup ] Falha ao criar transporte tipo ${def.type}: ${error.message}`, error);
          return null;
        }
      })
      .filter(Boolean);
  }

  const baseDefaultMeta = {
    service: ECOSYSTEM_NAME,
    instanceId: INSTANCE_ID,
    environment: NODE_ENV,
  };

  const defaultMeta = { ...baseDefaultMeta, ...(overrideOptions.defaultMeta || {}) };

  const loggerInstance = winston.createLogger({
    level: effectiveLevel,
    levels: LOG_LEVELS,
    format: winston.format.combine(winston.format.errors({ stack: true })),
    defaultMeta: defaultMeta,
    transports: configuredTransports,
    exitOnError: false,
  });

  loggerInstance.on("error", error => {
    console.error("Erro ocorrido dentro do Winston Logger:", error);
  });

  console.log(`[ LoggerSetup ] Instância do Logger criada. Nível: ${effectiveLevel}, Env: ${NODE_ENV}, Instância: ${INSTANCE_ID}, Serviço: ${ECOSYSTEM_NAME}`);

  return loggerInstance;
};

const logger = createLoggerInstance();

module.exports = logger;
