import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  // build vakhte Django /static/ thi assets serve kare
  base: command === 'build' ? '/static/' : '/',
  server: {
    // Explicit, not auto-picked - ports 5173 (frontend/) and 5174 (an
    // unrelated sibling project) are both already in use on this
    // machine; Vite would otherwise silently try 5175 anyway, but
    // pinning it here makes the CSRF-trusted-origin requirement below
    // predictable instead of depending on which ports happen to be free
    // when this starts. See the integration report for the exact
    // backend/.env line this port needs before login can succeed from a
    // browser (DJANGO_CSRF_TRUSTED_ORIGINS=...,http://localhost:5175) -
    // not added automatically, by instruction.
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.jsx', 'src/**/*.test.js'],
  },
}))