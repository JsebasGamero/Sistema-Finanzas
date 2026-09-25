# Entornos: desarrollo y producción

Hay un solo sistema en uso real. Las pruebas se hacen en un entorno aparte que
**no puede tocar producción**, ni por error.

## Resumen

| | Desarrollo | Producción |
|---|---|---|
| Comando | `npm run dev` | `npm run build` (y Android) |
| Modo de Vite | `development` | `production` |
| Credenciales | `.env.development.local` | `.env.production.local` |
| Proyecto Supabase | uno propio, de pruebas | el real |
| Base local (IndexedDB) | `FinanzasConstructora-development` | `FinanzasConstructora` |
| Franja visible | "DESARROLLO" en morado | ninguna |
| Usuarios | cuentas de prueba | cuentas reales |

Opcional: `npm run build:staging` con `.env.staging.local` para una build de
pruebas desplegable (por ejemplo, para que alguien pruebe desde su celular).

## Cómo funciona el candado

Cada archivo de credenciales declara a qué entorno pertenece:

```
VITE_APP_ENV=development
```

`src/services/entorno.js` compara esa declaración con el modo en que corre la
app. **Si no coinciden, la app no se conecta a Supabase** y lo explica en la
consola y en la franja superior. Casos que bloquea:

- `npm run dev` con un `.env` a secas que tiene credenciales de producción
  (Vite carga `.env` en todos los modos).
- Copiar el archivo de producción como si fuera el de desarrollo sin cambiar
  `VITE_APP_ENV`.

La base local también está separada por entorno. Como la cola de
sincronización sobrevive al cierre de sesión, compartirla permitiría que datos
de prueba encolados en un navegador subieran a producción.

## Configuración inicial (una sola vez)

### 1. Crear el proyecto de desarrollo en Supabase

1. supabase.com → New project. Nombre sugerido: `finanzasobra-dev`.
2. SQL Editor → ejecutar `supabase_setup.sql` completo. Ya incluye RLS y la
   columna de la migración 002, así que en un proyecto nuevo **no** hace falta
   correr las migraciones sueltas.
3. Storage → New bucket → `soportes` (público, igual que producción por ahora).
4. Authentication → Users → Add user: crea las cuentas de prueba.
5. Settings → API: copia la URL y la anon key.

### 2. Crear `.env.development.local`

```bash
cp .env.example .env.development.local
```

Rellena la URL y la anon key **del proyecto de desarrollo**. Deja
`VITE_APP_ENV=development`.

### 3. Comprobar

```bash
npm run dev
```

Debe aparecer la franja morada "DESARROLLO · base de datos de pruebas". Si dice
"sin credenciales" o "revisa .env", el archivo no está bien.

## Flujo de trabajo con cambios de esquema

1. Escribir la migración en `supabase/migrations/` (skill `nueva-migracion`).
2. Ejecutarla en **desarrollo**.
3. Probar la app con `npm run dev`.
4. Mergear el código.
5. Ejecutar la migración en **producción**.
6. Desplegar la build de producción.

Si la migración rompe algo que la app vieja usa, el orden de 5 y 6 importa: lo
dice el agente `supabase-sql` en su entrega ("Efecto sobre la app en
ejecución").

## Datos de prueba

`supabase_setup.sql` crea empresas, cajas, proyectos y categorías iniciales.
Para pruebas con volumen, conviene un script de semillas aparte
(pendiente en el backlog). **Nunca copiar datos de producción a desarrollo**:
son datos financieros reales.

## Android

- `npm run build` + `npx cap sync android` → APK contra producción.
- `npm run build:dev` + `npx cap sync android` → APK contra desarrollo.

Ojo: ambas APK usan el mismo `appId` (`com.rsistema.app`), así que instalar
una reemplaza a la otra en el teléfono. Para tener las dos a la vez hace falta
un `appId` distinto por entorno (pendiente en el backlog).

## Mejora futura: Supabase CLI

Con la CLI de Supabase se puede aplicar migraciones con `supabase db push` en
vez de copiarlas al SQL Editor, y levantar una base local con
`supabase start`. Requiere renombrar las migraciones al formato de la CLI
(`AAAAMMDDHHMMSS_nombre.sql`). No se hizo todavía para no cambiar el flujo
mientras las migraciones se corren a mano.
