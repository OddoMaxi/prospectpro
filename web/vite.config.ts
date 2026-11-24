import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, l'API du serveur cible (server/, port 4100) est relayée sous /api.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4100' } },
  build: { outDir: 'dist', sourcemap: false },
});
