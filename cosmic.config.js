module.exports = {
  apps: [
    {
      name: "cosmic-cat",
      script: "./src/auth/connection.js",
      exec_mode: "fork",
      instances: 1,
      watch: true,
      ignore_watch: ["node_modules", "./src/auth/temp", "./src/auth/logs", "./src/temp"],
      max_memory_restart: "1000M",
    },
  ],
};
