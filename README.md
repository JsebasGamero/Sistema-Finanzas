# Sistema de Gestión Financiera para Constructora

Sistema web Mobile-First para gestionar finanzas de constructoras con soporte offline.

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ve a **SQL Editor** y ejecuta el archivo `supabase_setup.sql`
3. Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
4. Agrega tus credenciales en `.env`:
   - `VITE_SUPABASE_URL`: Dashboard > Settings > API > URL
   - `VITE_SUPABASE_ANON_KEY`: Dashboard > Settings > API > anon public

### 3. Iniciar servidor de desarrollo
```bash
npm run dev
```

## 📱 Características

- **Modo Offline**: Funciona sin internet, sincroniza automáticamente
- **Mobile-First**: Diseñado para uso en campo bajo luz solar
- **Préstamos entre Cajas**: Rastreo de deudas entre cajas
- **Categorías**: Nómina, Materiales, Viáticos, ACPM, etc.

## Documentación

| Archivo | Contenido |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Guía del proyecto: comandos, invariantes, convenciones, definición de terminado |
| [docs/DOMINIO.md](docs/DOMINIO.md) | Reglas de negocio: movimientos, saldos, deudas |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Arquitectura actual y objetivo (Clean Architecture) |
| [docs/SINCRONIZACION.md](docs/SINCRONIZACION.md) | Modelo offline y sincronización con Supabase |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Bugs conocidos y fases del plan |
| [docs/ORQUESTACION.md](docs/ORQUESTACION.md) | Trabajo con agentes de Claude Code |
| [docs/decisiones/](docs/decisiones/) | Decisiones de diseño (ADR) |

Las migraciones de base de datos están en `supabase/migrations/` y se ejecutan
en orden desde el SQL Editor de Supabase.

## 🔧 Tecnologías

- React + Vite
- Tailwind CSS
- Dexie.js (IndexedDB)
- Supabase
