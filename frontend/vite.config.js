import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  // build vakhte Django /static/ thi assets serve kare
  base: command === 'build' ? '/static/' : '/',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.jsx', 'src/**/*.test.js'],
  },
}))