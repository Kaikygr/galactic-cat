const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  verbose: "cyan",
  debug: "blue",
  silly: "grey",
};

winston.addColors(colors);

const LEVEL = process.env.LOG_LEVEL || "silly";

const logger = winston.createLogger({
  level: LEVEL,
  levels,
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => new Date().toLocaleString("pt-BR", { timeZone: "America/Boa_Vista" }),
    }),
    winston.format.prettyPrint()
  ),
  transports: [
    new DailyRotateFile({
      filename: "logs/application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "1d",
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({
          format: () => new Date().toLocaleString("pt-BR", { timeZone: "America/Boa_Vista" }),
        }),
        winston.format.colorize({ all: true }),
        winston.format.printf(info => `[ ${info.timestamp} ] [ ${info.level} ] - ${info.message}`)
      ),
    }),
  ],
});

module.exports = logger;
