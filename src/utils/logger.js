const winston = require("winston");

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
    winston.format.colorize({ all: true }),
    winston.format.timestamp({
      format: () => new Date().toLocaleString("pt-BR", { timeZone: "America/Boa_Vista" }),
    }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level} [PID:${process.pid}]: ${message}`)
  ),
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: "logs/app.log" })],
});

module.exports = logger;
