const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");
const dns = require("dns");

const logFilePath = path.join(__dirname, "./logs/connection.log");

// Adiciona variáveis globais de controle de tentativas
const MAX_ATTEMPTS = 500;
let attemptCount = 0;

function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  const logDir = path.dirname(logFilePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  fs.appendFileSync(logFilePath, logEntry);
}

// Função para identificar erro de rede
function isNetworkError(error) {
  return error.code === 'ENETDOWN' || error.code === 'ENETUNREACH' || (error.message && error.message.toLowerCase().includes('network'));
}

// Função para aguardar a rede
function waitForNetwork(callback) {
  function check() {
    dns.resolve('www.google.com', function(err) {
      if (err) {
        console.log("Rede indisponível. Aguardando rede...");
        setTimeout(check, 5000);
      } else {
        console.log("Rede disponível. Retomando a conexão...");
        callback();
      }
    });
  }
  check();
}

function startConnection() {
  if (attemptCount >= MAX_ATTEMPTS) {
    const message = "Limite de tentativas atingido. Encerrando...";
    console.log(message);
    logMessage(message);
    process.exit(1);
  }
  
  attemptCount++;
  
  const connectionPath = path.join(__dirname, "./src/auth/connection.js");
  const child = fork(connectionPath);

  child.on("exit", (code, signal) => {
    if (code !== 0) {
      const message = `Processo connection.js finalizado com erro (code: ${code}, signal: ${signal}). Tentativa ${attemptCount}/${MAX_ATTEMPTS}. Reiniciando em 5 segundos...`;
      console.log(message);
      logMessage(message);
      setTimeout(startConnection, 5000);
    } else {
      attemptCount = 0;
    }
  });

  child.on("error", error => {
    if (isNetworkError(error)) {
      const message = `Erro de rede detectado: ${error.message}. Aguardando rede...`;
      console.error(message);
      logMessage(message);
      waitForNetwork(startConnection);
    } else {
      const message = `Erro no processo connection.js: ${error.message}. Tentativa ${attemptCount}/${MAX_ATTEMPTS}.`;
      console.error(message);
      logMessage(message);
      setTimeout(startConnection, 5000);
    }
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
