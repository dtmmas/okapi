module.exports = {
  apps: [
    {
      name: 'okapi-programasdteme',
      script: 'npm',
      args: 'run start',
      cwd: '/var/www/okapi.programasdteme.com/current',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3202,
      },
    },
  ],
};
