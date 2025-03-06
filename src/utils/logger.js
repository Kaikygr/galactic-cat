const winston = require("winston");

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

const LEVEL = process.env.LOG_LEVEL || "silly";

const logger = winston.createLogger({
  level: LEVEL,
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: "logs/app.log" })]
});

module.exports = logger;
