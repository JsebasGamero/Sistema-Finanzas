import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Candado de entornos en tiempo de arranque (ver docs/ENTORNOS.md).
//
// src/services/entorno.js ya bloquea la conexión si VITE_APP_ENV no coincide
// con el modo. Lo que ese candado no ve es el caso "copié las credenciales de
// producción en .env.development.local y puse VITE_APP_ENV=development": la
// declaración coincide, pero la base es la real. Aquí se compara el proyecto
// de cada modo no productivo con el de producción: si es el mismo proyecto,
// solo se permite cuando el entorno trabaja en un esquema aparte
// (VITE_SUPABASE_SCHEMA=pruebas, ver supabase/esquema_pruebas.sql). Con el
// esquema `public` (o sin declararlo), Vite se niega a arrancar.
function verificarQueNoApuntaAProduccion(mode) {
  if (mode === 'production') return
  const envModo = loadEnv(mode, process.cwd(), 'VITE_')
  const envProduccion = loadEnv('production', process.cwd(), 'VITE_')
  const urlModo = (envModo.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const urlProduccion = (envProduccion.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const esquemaModo = (envModo.VITE_SUPABASE_SCHEMA || 'public').trim()
  if (urlModo && urlProduccion && urlModo === urlProduccion && esquemaModo === 'public') {
    throw new Error(
      `\n\n  El entorno "${mode}" apunta al MISMO proyecto Supabase que producción (${urlModo})\n` +
      `  y al esquema public: las pruebas escribirían en los datos reales.\n` +
      `  Usa el esquema de pruebas (npm run configurar:pruebas -- --esquema pruebas ...)\n` +
      `  o un proyecto de pruebas aparte. Ver docs/ENTORNOS.md.\n`
    )
  }
}

// Una build de producción sin credenciales (o con las de otro entorno) produce
// una app en la que nadie puede iniciar sesión, y se descubría ya instalada en
// los celulares (ADM-16). Se corta aquí. Para compilar sin credenciales a
// propósito (revisar el bundle, CI): PERMITIR_BUILD_SIN_SUPABASE=1.
function verificarBuildDeProduccion(mode, command) {
  if (mode !== 'production' || command !== 'build') return
  if (process.env.PERMITIR_BUILD_SIN_SUPABASE === '1') return
  const env = loadEnv('production', process.cwd(), 'VITE_')
  const faltan = []
  if (env.VITE_APP_ENV !== 'production') faltan.push('VITE_APP_ENV=production')
  // Los valores de .env.example cuentan como vacíos (src/services/entorno.js
  // también los rechaza en tiempo de ejecución).
  const PLACEHOLDERS = ['https://tu-proyecto.supabase.co', 'https://your-project.supabase.co', 'tu-anon-key', 'your-anon-key']
  const valido = (v) => Boolean(v) && !PLACEHOLDERS.includes(v.trim())
  if (!valido(env.VITE_SUPABASE_URL)) faltan.push('VITE_SUPABASE_URL')
  if (!valido(env.VITE_SUPABASE_ANON_KEY)) faltan.push('VITE_SUPABASE_ANON_KEY')
  const esquema = (env.VITE_SUPABASE_SCHEMA || 'public').trim()
  if (esquema !== 'public') {
    throw new Error(
      `\n\n  La build de producción tiene VITE_SUPABASE_SCHEMA=${esquema}: los usuarios\n` +
      `  verían los datos de pruebas. Producción solo usa el esquema public; quita esa\n` +
      `  variable de .env.production.local.\n`
    )
  }
  if (faltan.length) {
    throw new Error(
      `\n\n  La build de producción no tiene configurada la base de datos: falta ${faltan.join(', ')}\n` +
      `  en .env.production.local. Sin eso nadie podría iniciar sesión en la app instalada.\n` +
      `  (Para compilar sin credenciales a propósito: PERMITIR_BUILD_SIN_SUPABASE=1 npm run build)\n`
    )
  }
}

// Recharts y las dependencias que solo usa Recharts.
const PAQUETES_DE_RECHARTS = new Set([
  'recharts', 'victory-vendor', '@reduxjs/toolkit', 'react-redux', 'reselect', 'immer',
  'redux', 'es-toolkit', 'eventemitter3', 'decimal.js-light', 'tiny-invariant',
])

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  verificarQueNoApuntaAProduccion(mode)
  verificarBuildDeProduccion(mode, command)

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Recharts se usa desde el tablero y desde la tabla dinámica, que se
          // cargan por separado. Sin un chunk propio, Rollup lo partía entre
          // los dos con reexportaciones circulares (orden de ejecución roto).
          // Función y no { recharts: ['recharts'] }: la forma de objeto
          // arrastraba React dentro de ese chunk y la página inicial terminaba
          // precargando Recharts (391 kB) aunque nadie abriera Reportes.
          manualChunks(id) {
            // React y los ayudantes de CommonJS van aparte: si caen en el chunk
            // de Recharts, la entrada lo importa (y lo precarga) para llegar a ellos.
            const paquete = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]
            if (id.includes('commonjsHelpers') || ['react', 'react-dom', 'scheduler', 'use-sync-external-store'].includes(paquete)) {
              return 'react'
            }
            if (paquete && (PAQUETES_DE_RECHARTS.has(paquete) || paquete.startsWith('d3-'))) {
              return 'recharts'
            }
          },
        },
      },
    },
    test: {
      // Solo los tests de src/ y scripts/. Sin esto Vitest recorre android/,
      // que contiene el bundle compilado que copia Capacitor.
      include: ['src/**/*.test.js', 'scripts/**/*.test.js'],
      // El dominio y la aplicación son JavaScript puro: no necesitan DOM.
      environment: 'node',
    },
  }
})
