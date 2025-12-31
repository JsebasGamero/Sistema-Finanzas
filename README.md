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

## 📁 Estructura

```
src/
├── components/
│   ├── Layout.jsx          # Navegación
│   ├── TransactionForm.jsx # Formulario transacciones
│   ├── CajaList.jsx        # Lista de cajas
│   └── ProjectDashboard.jsx# Dashboard
├── services/
│   ├── db.js               # IndexedDB (Dexie)
│   ├── supabase.js         # Cliente Supabase
│   └── syncService.js      # Sincronización
└── hooks/
    └── useOnlineStatus.js  # Detector online/offline
```

## 🔧 Tecnologías

- React + Vite
- Tailwind CSS
- Dexie.js (IndexedDB)
- Supabase
