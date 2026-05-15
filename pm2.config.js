// pm2.config.js — ACC v2 process manager config
module.exports = {
  apps: [
    {
      name:         'acc-server',
      script:       'scripts/start.js',
      cwd:          'C:\\Users\\Shaya\\agent-command-center',
      watch:        false,
      autorestart:  true,
      restart_delay: 3000,
      max_restarts: 20,
      env: { NODE_ENV: 'production' },
      log_file:     'C:\\Users\\Shaya\\agent-command-center\\data\\logs\\server.log',
      error_file:   'C:\\Users\\Shaya\\agent-command-center\\data\\logs\\server-err.log',
      time:         true,
    },
    {
      name:         'acc-bot',
      script:       'cloud/telegram/bot.js',
      cwd:          'C:\\Users\\Shaya\\agent-command-center',
      watch:        false,
      autorestart:  true,
      restart_delay: 5000,
      max_restarts: 20,
      env: { NODE_ENV: 'production' },
      log_file:     'C:\\Users\\Shaya\\agent-command-center\\data\\logs\\bot.log',
      error_file:   'C:\\Users\\Shaya\\agent-command-center\\data\\logs\\bot-err.log',
      time:         true,
    },
  ],
};
