/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rolldownOptions: {
      output: {
        // Bibliotecas grandes em chunks próprios: o pacote inicial fica menor e esses
        // arquivos continuam em cache entre deploys (só o código do app muda).
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
            { name: 'vendor-router', test: /node_modules[\/]react-router/ },
            { name: 'vendor-query', test: /node_modules[\/]@tanstack/ },
            {
              name: 'vendor-motion',
              test: /node_modules[\/](motion|framer-motion|motion-dom|motion-utils)/,
            },
            { name: 'vendor-ui', test: /node_modules[\/](@base-ui|@floating-ui|lucide-react)/ },
            { name: 'vendor-charts', test: /node_modules[\/](recharts|d3-|victory-vendor)/ },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:8000',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
