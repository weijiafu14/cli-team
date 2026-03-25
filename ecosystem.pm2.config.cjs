module.exports = {
  apps: [
    {
      name: 'aionui-webui',
      cwd: __dirname,
      script: 'npm',
      args: 'run webui:remote',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 5000,
      time: true,
      env: {
        NODE_ENV: 'development',
        PATH: `/Users/weijiafu8/.nvm/versions/node/v22.22.0/bin:${process.env.PATH || ''}`,
        AIONUI_CDP_PORT: '0',
        AIONUI_CODEX_ACP_BINARY: '/tmp/codex-acp-release-v0100/codex-acp',
      },
    },
  ],
};
