module.exports = {
  apps: [
    {
      name: "cat-production",
      script: "./src/auth/connection.js",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "1000M",
    },
  ],
};
