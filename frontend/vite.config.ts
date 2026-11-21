import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true exposes the dev server on the LAN so other devices can open the app.
  // Device GPS needs HTTPS, but the IP-based fallback still centres their map on plain HTTP.
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
