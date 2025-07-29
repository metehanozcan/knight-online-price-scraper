
module.exports = {
  apps: [
    {
      name: 'frontend',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'worker',
      script: 'worker.js',
      env: {
        NODE_ENV: 'production',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000
    }
  ]
};
