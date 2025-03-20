module.exports = {
  apps: [
    {
      // Configuração de produção
      name: "cosmic-cat-production",
      script: "./src/auth/connection.js",
      exec_mode: "fork",
      instances: 1,
      watch: false, // produção não reinicia automaticamente
      max_memory_restart: "1000M",
    }
  ],
};
