const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");

const logFilePath = path.join(__dirname, "./logs/connection.log");

function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  // Cria o diretório de logs se não existir
  const logDir = path.dirname(logFilePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  fs.appendFileSync(logFilePath, logEntry);
}

function startConnection() {
  const connectionPath = path.join(__dirname, "./src/auth/connection.js");
  const child = fork(connectionPath);

  child.on("exit", (code, signal) => {
    const message = `Processo connection.js finalizado (code: ${code}, signal: ${signal}). Reiniciando em 5 segundos...`;
    console.log(message);
    logMessage(message);
    setTimeout(startConnection, 5000);
  });

  child.on("error", error => {
    const message = `Erro no processo connection.js: ${error.message}`;
    console.error(message);
    logMessage(message);
    setTimeout(startConnection, 5000);
  });

  child.on("message", msg => {
    const message = `Mensagem do processo filho: ${msg}`;
    console.log(message);
    logMessage(message);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit();
  });

  process.on("SIGTERM", () => {
    child.kill("SIGTERM");
    process.exit();
  });
}

startConnection();
