require("dotenv").config();

module.exports = {
  apps: [
    {
      name: process.env.ECOSYSTEM_NAME || "bot-system",
      script: "./src/auth/connection.js",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "2000M",
      merge_logs: true,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
