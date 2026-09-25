import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Solo los tests de src/. Sin esto Vitest recorre android/, que contiene
    // el bundle compilado que copia Capacitor.
    include: ['src/**/*.test.js'],
    // El dominio y la aplicación son JavaScript puro: no necesitan DOM.
    environment: 'node',
  },
})
