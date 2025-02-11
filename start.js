const { fork } = require("child_process");

function startConnection() {
  const child = fork("./initialize/connection.js");
  
  child.on("exit", (code, signal) => {
    console.log(`Processo connection.js finalizado (code: ${code}, signal: ${signal}). Reiniciando em 5 segundos...`);
    setTimeout(startConnection, 5000);
  });
  
  child.on("error", (error) => {
    console.error("Erro no processo connection.js:", error);
    setTimeout(startConnection, 5000);
  });
}

startConnection();
