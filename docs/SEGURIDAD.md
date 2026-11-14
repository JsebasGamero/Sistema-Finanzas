# Seguridad

Qué protege hoy los datos de FinanzasObra, qué hay que hacer a mano en el
dashboard de Supabase (no se puede desde el repo) y qué falta, con el plan y
sus riesgos. Hallazgos de la auditoría: ADM-1, ADM-2, ADM-11, ADM-13,
ADM-14, ADM-15 (C16) y ADM-17.

## Cómo está hoy

| Pieza | Estado |
|---|---|
| Acceso a datos | Supabase Auth + RLS. Políticas solo para `authenticated` (migración 001). Cualquier usuario autenticado lee, crea, edita y borra todo. |
| anon key | Pública por diseño: viaja en el bundle de la app. La de producción además quedó en el historial de git (commits 4322671 y 5ecb299). |
| Registro de usuarios | La app no llama a `signUp`, pero el endpoint `/auth/v1/signup` responde a cualquiera con la anon key **si el registro público está activo** (lo está por defecto en Supabase). |
| Vistas | `v_saldo_por_empresa`, `v_gastos_por_proyecto` y `v_prestamos_entre_cajas` saltaban RLS y se leían con la anon key. La migración 003 las elimina. |
| Soportes (fotos) | Bucket `soportes` público: la URL de una factura se abre sin sesión (C16). |
| Roles | No hay. La pestaña Configuración aparece para todos. |
| Entornos | Producción y pruebas son proyectos Supabase distintos, con candado en `src/services/entorno.js` y base local separada (`docs/ENTORNOS.md`). |

La consecuencia de las tres primeras filas juntas (ADM-1): con la URL y la
anon key sacadas del JavaScript de la app, alguien de fuera puede registrarse
con su propio correo, iniciar sesión y, como `authenticated`, leer toda la
contabilidad o borrar todas las cajas (las FK `ON DELETE SET NULL`
desvinculan sus movimientos). Lo que lo impide es el paso 1 de abajo.

## Pasos manuales (en los DOS proyectos: producción y pruebas)

Se hacen en el dashboard de Supabase. Primero en pruebas, para ver que la
app sigue funcionando; después en producción. Marcar cada paso en
`docs/BACKLOG.md` (acciones manuales) al terminarlo.

### 1. Desactivar el registro público (urgente)

1. Authentication > Sign In / Providers > **User Signups** > apagar
   **"Allow new users to sign up"** > Save.
2. Desde ahí, los usuarios se crean solo desde Authentication > Users >
   **Add user** > *Create new user*, con correo y contraseña y marcando
   **Auto Confirm User**. Así es como la cuenta principal de producción da
   acceso a más personas; la contraseña se le entrega a la persona por un
   canal privado y ella la cambia en la app (menú de cuenta > Cambiar
   contraseña). No usar **Invite user**: la app todavía no maneja el enlace
   de invitación (la persona llegaría sin forma de definir su contraseña).
3. En Authentication > Users, revisar que no haya cuentas desconocidas. Si
   las hay: borrarlas y avisar (alguien pudo leer los datos).
4. Comprobarlo **en el proyecto de pruebas** desde una terminal (en
   producción basta con ver el interruptor apagado y la lista de usuarios:
   si por error el registro siguiera abierto, este comando crearía una
   cuenta real ahí). Debe responder un error `signup_disabled` ("Signups not
   allowed for this instance"):

   ```bash
   curl -s -X POST "https://<proyecto>.supabase.co/auth/v1/signup" \
     -H "apikey: <anon key de ESE proyecto>" \
     -H "Content-Type: application/json" \
     -d '{"email":"prueba-registro@example.com","password":"una-clave-larga-123"}'
   ```

   Usar la URL y la anon key a mano en la terminal; no guardarlas en ningún
   archivo del repo (invariante 9).

Mientras el registro esté abierto, rotar la anon key no sirve de nada: la
clave nueva también viaja en el bundle.

### 2. Rotar la anon key de producción (higiene)

La clave vieja está en el historial de git. No es un secreto (es pública por
diseño), pero rotarla corta cualquier uso que dependa de esa copia.

1. Project Settings > API Keys: crear una **publishable key** nueva (o, con
   las claves "legacy", generar un JWT secret nuevo en Project Settings >
   JWT Keys; eso invalida también la `service_role` y cierra todas las
   sesiones).
2. Poner la clave nueva en `.env.production.local` (`VITE_SUPABASE_ANON_KEY`)
   y publicar la build web y la APK nuevas.
3. Solo cuando todos los dispositivos tengan la versión nueva, desactivar
   las claves legacy. Una APK vieja con la clave anterior deja de conectarse
   en ese momento (sus cambios sin subir siguen en la cola local y suben al
   actualizar la app).

Nunca poner la `service_role` key en una variable `VITE_*`: todo lo que
empieza por `VITE_` se copia al JavaScript que descarga cualquiera.

### 3. Ejecutar la migración 003 y revisar el Security Advisor

1. SQL Editor > ejecutar `supabase/migrations/003_quitar_vistas_sin_rls.sql`
   (si 001 y 002 no se han corrido en producción, van antes; ver BACKLOG).
2. Advisors > **Security Advisor** > Refresh. Después de la 003 no debe
   aparecer ningún **"Security Definer View"** ni **"RLS Disabled in
   Public"**. Avisos que pueden quedar y qué hacer:
   - *Function Search Path Mutable* (`update_updated_at_column`): bajo
     riesgo. Se corrige con
     `ALTER FUNCTION public.update_updated_at_column() SET search_path = '';`
     en una migración futura (la función solo usa `NOW()`).
   - *Leaked Password Protection Disabled*: Authentication > Providers >
     Email > activar la comprobación de contraseñas filtradas si el plan lo
     permite.
   - En esa misma pantalla, **Minimum password length = 10** (la app ya
     exige 10 al cambiar o recuperar la contraseña:
     `src/context/reglasContrasena.js`; si se cambia allá, se cambia aquí) y
     activar **Secure password change**, para que cambiar la contraseña
     pida una sesión reciente y una sesión olvidada abierta no baste.
3. Correr las consultas de verificación del final de la 003 y del setup.

### 4. URLs de redirección (recuperar contraseña)

Authentication > URL Configuration: en producción, la Site URL y las
Redirect URLs son las de la app publicada; en pruebas,
`http://localhost:5173` (y la URL de la build de staging si existe). Si el
proyecto de pruebas redirige a producción, el enlace de "recuperar
contraseña" de una cuenta de prueba abre la app de producción.

## Dos cuentas: producción y pruebas

Lo que separa los datos es **dónde escribe la app**, no el usuario:

- **Producción**: el proyecto real, esquema `public`. La cuenta principal
  crea los usuarios del equipo con Add user (paso 1). Nadie prueba aquí.
- **Pruebas, opción A (plan gratuito sin más proyectos)**: el esquema
  `pruebas` dentro del mismo proyecto (`supabase/esquema_pruebas.sql`). Las
  tablas de `public` no cambian; el esquema `pruebas` solo es accesible con
  sesión (ni siquiera el rol anon tiene USAGE). Los usuarios son los mismos de
  producción: cualquiera del equipo con la app de desarrollo podría escribir
  en `pruebas`, y un usuario creado "para pruebas" también entra a la app de
  producción y ve los datos reales. Por eso conviene probar con su propia
  cuenta y no crear usuarios extra.
- **Pruebas, opción B**: un proyecto aparte creado con `supabase_setup.sql`,
  con sus propios usuarios.
- **Modo local**: sin proyecto de pruebas todavía, `npm run dev` sin
  credenciales ofrece entrar en modo local (datos solo en ese navegador).

En pruebas y en modo local, Configuración > **Entorno de pruebas** muestra
contra qué proyecto se está trabajando y genera datos inventados. Esa
sección no existe en la build de producción y el generador se niega a
correr si `ES_PRODUCCION`. **Nunca copiar datos de producción a pruebas**:
son datos financieros reales.

## Plan propuesto: roles (ADM-11, y defensa en profundidad de ADM-1)

No está hecho: cambia permisos de usuarios reales y necesita trabajo previo
en la sincronización. Esto es la propuesta para decidir.

**Objetivo.** Dos roles guardados en `app_metadata.rol` (el usuario no puede
cambiarlo; `user_metadata` sí): `admin` (la cuenta principal y quien ella
diga) y `operador` (registra en obra).

| Tabla | operador | admin |
|---|---|---|
| empresas, cajas, proyectos | leer | todo |
| terceros, categorias | leer y **crear** (se crean al vuelo desde el formulario de movimiento y desde Deudas) | todo |
| transacciones, deudas_cajas, deudas_terceros | leer, crear, editar | todo (borrar incluido) |

**Asignar el rol** (SQL Editor, por cada usuario):

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"rol": "admin"}'::jsonb
WHERE email = '<correo>';
```

**Políticas** (borrador de la futura migración; no ejecutar todavía):

```sql
CREATE OR REPLACE FUNCTION public.rol_actual() RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'rol', '')
$$;

-- Ejemplo para empresas; igual para cajas y proyectos.
CREATE POLICY "leer_empresas" ON public.empresas
  FOR SELECT TO authenticated USING (public.rol_actual() IN ('admin', 'operador'));
CREATE POLICY "admin_escribe_empresas" ON public.empresas
  FOR ALL TO authenticated
  USING (public.rol_actual() = 'admin') WITH CHECK (public.rol_actual() = 'admin');
```

Siguen siendo `TO authenticated` (invariante 8); el rol es un filtro más.

**Lo que hay que resolver antes, o se pierden datos:**

1. **`cajas.saldo_actual` lo escriben todos.** Cada movimiento actualiza el
   saldo de la caja (`aplicadorDeAjustesDexie`), también el de un operador.
   Si UPDATE de `cajas` queda solo para admin, los saldos de los operadores
   no suben. Hasta la Fase 4 (saldo derivado) hace falta un trigger
   `BEFORE UPDATE` en `cajas` que, para `operador`, rechace cambios en
   cualquier columna que no sea `saldo_actual`/`updated_at`.
2. **RLS no da error, filtra.** Un UPDATE o DELETE sin permiso afecta 0 filas
   y responde 200. `processSyncQueue` lo tomaría como éxito y borraría la
   operación de la cola (rompe la invariante 2). Antes de migrar, la sync
   debe pedir `.select()` en UPDATE/DELETE y tratar 0 filas como error
   visible en la bandeja de errores.
3. **Un usuario sin rol no ve nada**, y el pull hace clear + replace: su
   app quedaría vacía. Asignar el rol a TODOS antes de ejecutar y esperar a
   que renueven el token (hasta 1 hora, o cerrar sesión y volver a entrar).
   Conviene además que el pull no vacíe tablas locales si la nube devuelve 0
   filas y antes había datos.
4. **La cola sobrevive al logout** (invariante 1): operaciones offline de un
   operador pueden subir con la sesión de un admin en el mismo celular, y al
   revés. Guardar en cada operación encolada el id de quien la creó y no
   procesarla con otra sesión.
5. **Auditoría.** `usuario_nombre` y `editado_por` salen de
   `user_metadata.nombre`, que cada usuario puede cambiar; y hoy cualquiera
   puede reescribir esas columnas por REST. Con roles y el punto 4 resuelto:
   columnas `creado_por uuid DEFAULT auth.uid()` y un trigger que fije
   `editado_por_id` en el servidor. `usuario_nombre` queda solo para mostrar.
6. **UI.** Ocultar Configuración y los botones de borrar al operador (leer
   el rol de `session.user.app_metadata`). Es comodidad, no seguridad: la
   seguridad es la política.

Orden: 2 y 4 (sync) > 1 (trigger) > asignar roles > migración de políticas
en pruebas > probar con un usuario de cada rol > producción > 6 (UI).

## Plan propuesto: bucket de soportes privado (C16 / ADM-15)

Hoy `TransactionForm` guarda `getPublicUrl()` en `transacciones.soporte_url`.
Cualquiera con esa URL ve la factura (NIT, montos, cuentas), aunque ya no
trabaje en la empresa. Y `soportes_auth_read` deja a cualquier autenticado
listar el bucket entero.

1. **App que firma.** Para subidas nuevas, guardar la ruta
   (`<userId>/<archivo>`) en `soporte_url`. Al mostrar: si es una ruta,
   `createSignedUrl(ruta, 3600)`; si es una URL pública vieja, sacar la ruta
   que sigue a `/object/public/soportes/` y firmarla igual. Sin conexión no
   se puede firmar: mostrar "Disponible con conexión".
2. **Desplegar esa versión en todos los dispositivos** (web y APK). Las APK
   viejas siguen escribiendo URLs públicas y hay payloads con URL pública en
   las colas de sync: la app debe aceptar los dos formatos.
3. **Migración de datos** (en pruebas primero; cambia filas reales, requiere
   confirmación explícita):

   ```sql
   UPDATE transacciones
   SET soporte_url = regexp_replace(soporte_url, '^https?://[^/]+/storage/v1/object/public/soportes/', '')
   WHERE soporte_url LIKE '%/storage/v1/object/public/soportes/%';
   ```

4. **Recién entonces**, bucket privado:
   `UPDATE storage.buckets SET public = false WHERE id = 'soportes';`
   (y reflejarlo en `supabase_setup.sql`).
5. Con roles, restringir `soportes_auth_read` a `admin`/`operador`.

Riesgos: una APK sin actualizar deja de ver los soportes en el paso 4; las
URLs firmadas caducan (firmar al abrir, no al cargar la lista); se pierde
ver soportes sin señal; más tráfico de firma. Si el paso 3 corre antes de
que todas las apps sepan leer rutas, esas apps muestran soportes rotos.

## Dependencia: xlsx 0.18.5 (ADM-17)

`xlsx` 0.18.5 es la última versión publicada en npm y tiene dos CVE altas,
las dos al **leer** archivos: CVE-2023-30533 (prototype pollution) y
CVE-2024-22363 (ReDoS). `npm audit` la marca como alta.

Hoy **no es explotable**: la app solo **escribe** Excel, desde la tabla
dinámica (`src/presentation/reportes/tabla/exportar.js`: `aoa_to_sheet`,
`book_new`, `book_append_sheet`, `write`), y carga la librería con
`import()` solo al exportar. El único `XLSX.read` está en un test, que relee
el archivo que él mismo generó; no hay lectura de archivos del usuario.

Reglas mientras siga esta versión:

- No agregar ninguna importación de Excel (`XLSX.read`, `readFile`) con
  `xlsx` 0.18.5. Un archivo manipulado contaminaría `Object.prototype` dentro
  de la app.
- Para cambiarla: la tarball oficial de SheetJS
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) o `exceljs`. La
  carga ya es dinámica, así que el cambio queda en `exportar.js`. Cambiar
  dependencias es una decisión aparte: no se hizo aquí.

## Endurecimiento opcional (no hecho)

- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;` y
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;`:
  aunque una política o una vista futura quede mal, la anon key no lee nada.
  La app nunca consulta tablas sin sesión, pero probarlo en pruebas primero
  (login, recuperar contraseña).
- Toda vista nueva con `WITH (security_invoker = true)`; la consulta de
  verificación de la 003 lista las que no lo tengan.
