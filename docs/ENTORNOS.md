# Entornos: la cuenta de producción y la cuenta de pruebas

## En pocas palabras

FinanzasObra trabaja con **dos cuentas separadas**: la de **producción**
(datos reales, la usan usted y su equipo) y la de **pruebas** (solo suya, con
datos inventados). Lo que haga en pruebas **no toca nada de producción**.

La cuenta de pruebas puede armarse de dos maneras. Elija según cuántos
proyectos le deja tener Supabase:

| | A. Esquema de pruebas (recomendado con plan gratuito) | B. Otro proyecto de Supabase |
|---|---|---|
| Cuándo | Ya tiene dos proyectos gratis y Supabase no le deja crear más. | Le sobra un proyecto. |
| Dónde viven los datos de prueba | En el **mismo** proyecto de producción, pero en un esquema aparte llamado `pruebas`: tablas propias, vacías, que la app de producción nunca lee. | En un proyecto distinto. |
| Qué toca en producción | Nada de sus tablas ni de sus datos: solo **agrega** el esquema `pruebas`. | Nada. |
| Usuarios | Los mismos de producción. Lo más simple: pruebe con su propia cuenta. | Un usuario propio creado en ese proyecto. |
| Fotos de soporte | Mismo bucket, carpeta `pruebas/`. | Bucket del otro proyecto. |

En las dos:

| | PRODUCCIÓN | PRUEBAS |
|---|---|---|
| Cómo se abre | La app instalada / `npm run build` | `npm run dev` en el computador |
| Cómo se reconoce | Sin franja de color. | Franja **morada** arriba: "DESARROLLO · base de pruebas · …". |
| Datos | Reales. | Inventados (puede generarlos con un botón, ver más abajo). |

### Por qué no sirve crear solo un "usuario de pruebas"

En producción todos los usuarios ven y modifican **los mismos datos**: no hay
datos "de cada usuario". Si crea `pruebas@...` y entra a la app de
producción, cada gasto de prueba baja el saldo real de la caja y aparece en
los reportes de todo el equipo. Lo que separa los datos no es el usuario sino
**dónde escribe la app**: el esquema `pruebas` (opción A) o el otro proyecto
(opción B). Por eso la cuenta de pruebas se usa siempre con `npm run dev`,
nunca desde la app instalada.

### Cómo dar acceso a alguien del equipo (producción)

1. Entre a supabase.com con su cuenta y abra el proyecto de **producción**.
2. Authentication > Users > **Add user** > *Create new user*, con correo y
   contraseña y marcando **Auto Confirm User**. (No use *Invite user*: la app
   todavía no maneja ese enlace.)
3. Esa persona entra a la app con ese correo y ve todos los datos.

Antes de dar acceso a nadie, desactive el registro público en **los dos
proyectos** (producción y pruebas): si está activo, cualquiera con la
dirección del proyecto puede crearse una cuenta. El paso a paso está en
[`docs/SEGURIDAD.md`](SEGURIDAD.md), "Desactivar el registro público".

## Opción A: esquema de pruebas en el mismo proyecto (una sola vez)

1. Entre a supabase.com, abra el proyecto de **producción** y vaya a SQL
   Editor. Pegue y ejecute **`supabase/esquema_pruebas.sql`** completo.
   Solo crea el esquema `pruebas` con las 8 tablas vacías, sus reglas y las
   categorías por defecto; no modifica ninguna tabla ni dato de `public`. Se
   puede correr más de una vez. Al final del archivo hay consultas para
   comprobarlo.
2. Project Settings > **Data API** > **Exposed schemas**: agregue `pruebas`
   a la lista (deje `public`) > Save. Sin esto la app no puede leer el
   esquema y la sincronización se detiene con el aviso "El esquema de datos
   de este entorno no está habilitado".
3. En la carpeta del proyecto (donde está `.env.production.local`):

   ```bash
   npm run configurar:pruebas -- --esquema pruebas
   ```

   Escribe `.env.development.local` con la URL y la key de producción y
   `VITE_SUPABASE_SCHEMA=pruebas`. Si no tiene el archivo de producción en ese
   computador, agregue `--url` y `--key`.
4. `npm run dev` y entre con **su misma cuenta** de siempre. La franja debe
   decir "base de pruebas · <proyecto>.supabase.co · esquema pruebas" y la
   app arranca vacía (solo categorías). Genere datos de prueba desde
   Configuración > Entorno de pruebas.

Para empezar de cero, al final de `supabase/esquema_pruebas.sql` hay un
`TRUNCATE` (comentado) que borra solo lo del esquema `pruebas`.

Si algún día cambia la estructura de las tablas (una migración nueva), hay
que aplicar el mismo cambio en `pruebas` (copiando la migración con
`pruebas.` delante de cada tabla) para que la app de desarrollo no falle.

## Opción B: otro proyecto de Supabase (una sola vez)

### El proyecto en Supabase

1. supabase.com > **New project**. Nombre sugerido: `finanzasobra-pruebas`.
   El plan gratuito alcanza.
2. SQL Editor > ejecutar `supabase_setup.sql` completo. Ya incluye RLS y las
   columnas de las migraciones, así que en un proyecto nuevo **no** hace falta
   correr las migraciones sueltas.
3. Authentication > Users > **Add user**: su usuario de pruebas.
4. Authentication > Sign In / Providers: apague "Allow new users to sign up"
   (ver [`docs/SEGURIDAD.md`](SEGURIDAD.md)).
5. Settings > API: copie la **Project URL** y la **anon public key**.

### Conectar la app al proyecto de pruebas

En la carpeta del proyecto:

```bash
npm run configurar:pruebas -- --url https://<su-proyecto>.supabase.co --key <anon key>
```

El script (`scripts/configurar-pruebas.mjs`) escribe `.env.development.local`
con `VITE_APP_ENV=development`. **Se niega** si la URL o la key son las de
`.env.production.local`, y no reemplaza un archivo existente salvo con
`--forzar`. Con `--ayuda` muestra estos mismos pasos.

### Comprobar

```bash
npm run dev
```

Debe aparecer la franja morada "DESARROLLO · base de pruebas ·
<su-proyecto>.supabase.co". Entre con su usuario de pruebas. Si la franja
dice "conexión bloqueada: revisa .env" o "modo local", el archivo no quedó
bien (el detalle sale en la consola del navegador).

## Sin proyecto de pruebas: el modo local

Si todavía no creó el proyecto de pruebas, `npm run dev` igual funciona: en
la pantalla de acceso aparece el botón **"Entrar en modo local de pruebas"**.
La app funciona completa con un usuario de prueba y guarda todo **solo en
ese navegador**, en una base propia llamada
`FinanzasConstructora-<modo>-local` (por ejemplo
`FinanzasConstructora-development-local`). Esa base no se sincroniza con
nada y no se mezcla con la del proyecto de pruebas si después lo configura.

El modo local no existe en la versión de producción ni cuando hay un
proyecto Supabase conectado.

## Datos de prueba

En la cuenta de pruebas o en el modo local: **Configuración > Entorno de
pruebas > Generar datos de prueba**. Crea un lote de datos inventados pero
realistas: 2 empresas, 6 cajas (bancos, efectivo y tarjeta), 4 obras en
distintos estados, 12 proveedores, empleados y contratistas, varios meses de
ingresos, gastos y transferencias, y deudas con proveedores y préstamos entre
cajas con abonos. Cada caja arranca con un movimiento "Saldo inicial", así
que su saldo siempre cuadra con sus movimientos.

- Con proyecto de pruebas: los datos se suben a **ese** proyecto al
  sincronizar. El contador de pendientes muestra el avance.
- En modo local: quedan solo en el navegador. Ahí mismo hay un botón para
  borrarlos todos y empezar de cero.
- Cada vez que se pulsa se agrega otro lote; no reemplaza lo anterior.
- La sección no aparece en producción, y el código que genera los datos se
  niega a correr si la app está en modo producción.

**Nunca copie datos de producción a pruebas**: son datos financieros reales.

El generador está en `src/application/pruebas/generarDatosDePrueba.js`
(función pura con semilla, probada) y lo escribe en la base
`src/app/datosDePrueba.js`.

## Los candados

La regla es que **desarrollo nunca escribe en los datos de producción**
(invariante 10 de `CLAUDE.md`): ni en otro proyecto ni en el esquema `public`
del proyecto real. La protegen estas cosas:

1. **Cada archivo de credenciales declara su entorno** (`VITE_APP_ENV`).
   `src/services/entorno.js` lo compara con el modo en que corre la app y,
   si no coinciden, la app **no se conecta** a Supabase y lo explica en la
   franja y en la consola. Así se bloquea, por ejemplo, un `.env` a secas con
   credenciales de producción (Vite lo carga en todos los modos) o un archivo
   de producción copiado sin cambiar `VITE_APP_ENV`.
2. **`vite.config.js` se niega a arrancar** si `.env.development.local` (o el
   de cualquier modo que no sea producción) apunta al mismo proyecto que
   `.env.production.local` **y al esquema `public`**. Con el mismo proyecto
   solo se permite un esquema aparte (`VITE_SUPABASE_SCHEMA=pruebas`). Cubre
   el caso "copié las credenciales de producción y puse
   `VITE_APP_ENV=development`".
3. **`npm run configurar:pruebas` rechaza** la URL y la key de producción,
   salvo con `--esquema` (y nunca acepta `--esquema public`).
Los candados 2 y 3 comparan contra `.env.production.local`, así que solo
protegen en el computador donde existe ese archivo (el mismo desde el que se
compila producción). En otra máquina, sin ese archivo, no hay con qué
comparar: nunca copie las credenciales de producción a un computador que se
use solo para pruebas.

4. **La base local está separada por entorno** (y por esquema). Como la cola
   de sincronización sobrevive al cierre de sesión, compartir la base
   permitiría que datos de prueba encolados en un navegador subieran a
   producción.
5. **Producción nunca usa otro esquema.** Si `.env.production.local` trae
   `VITE_SUPABASE_SCHEMA` distinto de `public`, `npm run build` falla y la app
   se niega a conectarse (`src/services/entorno.js`).
6. **El esquema `pruebas` no existe para quien no inició sesión**: ni
   siquiera el rol anónimo tiene acceso (`supabase/esquema_pruebas.sql`).

## Resumen técnico

| | Pruebas (desarrollo) | Producción |
|---|---|---|
| Comando | `npm run dev` (o `npm run build:dev`) | `npm run build` (y Android) |
| Modo de Vite | `development` | `production` |
| Credenciales | `.env.development.local` | `.env.production.local` |
| Proyecto Supabase | el real con esquema `pruebas` (A) o uno propio (B) | el real, esquema `public` |
| `VITE_SUPABASE_SCHEMA` | `pruebas` (A) o sin definir (B) | sin definir (`public`) |
| Base local (IndexedDB) | `FinanzasConstructora-development-pruebas` (A) o `FinanzasConstructora-development` (B) | `FinanzasConstructora` |
| Base del modo local | `FinanzasConstructora-development-local` | no existe |
| Franja visible | "DESARROLLO" en morado | ninguna |
| Usuarios | su misma cuenta (A) o una de pruebas (B) | las cuentas del equipo |

Opcional: `npm run build:staging` con `.env.staging.local` para una build de
pruebas desplegable (por ejemplo, para que alguien pruebe desde su celular).
Debe apuntar también a un proyecto que no sea el de producción.

## Flujo de trabajo con cambios de esquema

1. Escribir la migración en `supabase/migrations/` (skill `nueva-migracion`).
2. Ejecutarla en **pruebas**: en el proyecto de pruebas (B) o, con la
   opción A, una copia con `pruebas.` delante de cada tabla en el proyecto
   real.
3. Probar la app con `npm run dev`.
4. Mergear el código.
5. Ejecutar la migración en **producción**.
6. Desplegar la build de producción.

Si la migración rompe algo que la app vieja usa, el orden de 5 y 6 importa: lo
dice el agente `supabase-sql` en su entrega ("Efecto sobre la app en
ejecución").

## Android

- `npm run build` + `npx cap sync android` > APK contra producción.
- `npm run build:dev` + `npx cap sync android` > APK contra pruebas.

**Ojo:** mientras las dos APK usen el mismo `appId` (`com.rsistema.app`),
instalar una **reemplaza** a la otra en el teléfono. Y como cada una guarda
sus datos en una base local distinta, los cambios que la de producción tenía
sin subir quedan guardados pero no se suben hasta volver a instalarla (y se
pierden si hay que desinstalar porque la firma es distinta).

Antes de instalar la APK de pruebas en un teléfono que usa la de producción:
abra la de producción con señal y espere a que no quede **ningún cambio
pendiente**. Mejor aún: pruebe en otro teléfono o en el computador.

Tener las dos instaladas a la vez requiere un `appId` distinto por entorno
(`com.rsistema.app.dev`, nombre "FinanzasObra DEV"). Está pendiente en el
backlog (E3).

## Mejora futura: Supabase CLI

Con la CLI de Supabase se puede aplicar migraciones con `supabase db push` en
vez de copiarlas al SQL Editor, y levantar una base local con
`supabase start`. Requiere renombrar las migraciones al formato de la CLI
(`AAAAMMDDHHMMSS_nombre.sql`). No se hizo todavía para no cambiar el flujo
mientras las migraciones se corren a mano.
