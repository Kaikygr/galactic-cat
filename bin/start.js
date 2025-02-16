/**
 * Starts a child process to run the connection.js script.
 * If the child process exits or encounters an error, it will automatically restart after 5 seconds.
 */
const { fork } = require("child_process");
const path = require("path");

function startConnection() {
  const connectionPath = path.join(__dirname, "../auth/connection.js");
  const child = fork(connectionPath);

  child.on("exit", (code, signal) => {
    console.log(`Processo connection.js finalizado (code: ${code}, signal: ${signal}). Reiniciando em 5 segundos...`);
    setTimeout(startConnection, 5000);
  });

  child.on("error", error => {
    console.error("Erro no processo connection.js:", error);
    setTimeout(startConnection, 5000);
  });
}

startConnection();
