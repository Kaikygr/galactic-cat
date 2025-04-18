module.exports = {
  apps: [
    {
      name: "cat-galactic",
      script: "./src/auth/connection.js",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
        watch: false,
        max_memory_restart: "1000M",
      },
      env_development: {
        NODE_ENV: "development",
        watch: true,
        ignore_watch: ["node_modules", "logs", ".git"],
        max_memory_restart: "500M",
      },
    },
  ],
};
