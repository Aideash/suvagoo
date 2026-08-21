import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, envDir, '')
  const apiPort = Number(env.API_PORT) || 3001
  const serverPort = Number(env.SERVER_PORT) || 5173

  return {
    envDir,
    plugins: [vue()],
    server: {
      port: serverPort,
      // Reached through the local Caddy reverse proxy, which forwards the
      // original Host header. Vite rejects unrecognised hosts with a 403.
      allowedHosts: [env.DOMAIN ?? 'localhost'],
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
