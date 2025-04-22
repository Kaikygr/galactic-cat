require("dotenv").config();

module.exports = {
  apps: [
    {
      name: process.env.ECOSYTEM_NAME,
      script: "./src/auth/connection.js",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "1000M",
    },
  ],
};
