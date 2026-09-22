/**
 * OmniRoute PM2 Ecosystem — Production
 *
 * PENTING: Jangan gunakan `pm2 restart omniroute` langsung setelah server mati,
 * karena PM2 fork_mode mewarisi env dari shell yang pertama kali menjalankan
 * `pm2 start` — bukan dari field `env` di sini (Next.js standalone membaca
 * process.env.PORT saat startup, sebelum PM2 sempat inject env).
 *
 * Gunakan script startup resmi yang set env di shell terlebih dahulu:
 *   powershell -ExecutionPolicy Bypass -File C:\OmniRoute\start-omniroute.ps1
 *
 * Atau manual:
 *   $env:PORT = "20128"; $env:HOST = "0.0.0.0"; $env:NODE_ENV = "production"
 *   pm2 delete omniroute
 *   pm2 start ecosystem.production.cjs
 */
module.exports = {
  apps: [
    {
      name: "omniroute",
      script: "server.js",
      cwd: "C:/OmniRoute/.build/next/standalone",
      node_args: "--max-old-space-size=2048",
      max_memory_restart: "2500M",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: "20128",
        HOST: "0.0.0.0",
      },
    },
  ],
};
