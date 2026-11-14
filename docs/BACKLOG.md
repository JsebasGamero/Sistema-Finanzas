# Backlog

Fuente de verdad del trabajo pendiente. Al cerrar un ítem, actualiza su
estado y pon el commit. Al descubrir un bug, agrégalo con su ID.

Estados: `pendiente` · `en curso` · `hecho` · `hecho (requiere acción manual)` · `parcial` · `descartado`

"Rama UI" = rama `claude/ui-reports-dual-accounts-565308` (rediseño, reportes,
entorno de pruebas y arreglos de la auditoría de noviembre de 2026).

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Contención: RLS, credenciales, pérdida de trabajo offline | hecho (requiere acción manual) |
| 1 | Bugs de datos | hecho |
| 2 | Móvil y responsive | hecho |
| 3 | Clean Architecture, por porciones verticales | en curso: porciones 1 y 2 hechas; movimientos con unidad de trabajo (ADR-005); deudas con operaciones atómicas pero todavía en `src/components/deudas/` |
| 4 | Saldo derivado y dinero como entero | pendiente |
| 5 | UI: design system, tema claro de alto contraste, densidad | hecho en rama UI (`docs/DISENO.md`) |

## Acciones manuales pendientes

En este orden. Ninguna la puede hacer la app ni un agente.

- [ ] Crear la cuenta de **pruebas**. Con el plan gratuito sin más proyectos
      (opción A de `docs/ENTORNOS.md`): correr `supabase/esquema_pruebas.sql`
      en el proyecto real, agregar `pruebas` en Data API > Exposed schemas y
      `npm run configurar:pruebas -- --esquema pruebas`.
- [ ] Desactivar "Allow new users to sign up" en Authentication de **los dos**
      proyectos (`docs/SEGURIDAD.md`).
- [ ] Rotar la anon key de producción (estuvo en `.env.example` en el historial
      de git), en el orden que indica `docs/SEGURIDAD.md`.
- [ ] Ejecutar en producción, si no se hizo: `001_rls_solo_autenticados.sql`,
      `002_columnas_faltantes.sql`. Primero en pruebas.
- [ ] Ejecutar `003_quitar_vistas_sin_rls.sql` (pruebas y luego producción).
- [ ] Registrar las Redirect URLs de recuperación de contraseña en cada proyecto
      (Authentication > URL Configuration) y, si la app se usa instalada,
      definir `VITE_URL_RECUPERACION`.
- [ ] Revisar el Security Advisor de Supabase en los dos proyectos.
- [ ] Probar detrás del login, en el proyecto de pruebas, los flujos que la
      auditoría no pudo verificar sin credenciales (lista en "Verificar con
      login" abajo).

## Verificar con login (proyecto de pruebas)

Lo que se probó en modo local pero necesita Supabase real:

- Pull paginado con más de 1000 movimientos y que no vacíe tablas si una página falla.
- Bandeja de errores de sincronización con rechazos reales (FK, UNIQUE, columna faltante).
- Sesión sin conexión: abrir la app sin señal después de una hora.
- Logout sin señal y con señal (no cierra otros dispositivos).
- Recuperar contraseña desde el correo hasta definir la nueva.
- Generar datos de prueba con el proyecto de pruebas conectado y verlos subir.
- Subir foto de soporte; foto desde galería; agregar soporte desde Editar.

## Bugs críticos y de datos

| ID | Descripción | Estado | Commit |
|---|---|---|---|
| C1 | RLS `USING (true)`: la base estaba abierta a cualquiera con la anon key | hecho (requiere acción manual) | 5ecb299 |
| C1b | `.env` versionado y credenciales reales en `.env.example` | hecho (rotar key) | 5ecb299 |
| C2 | Categorías con `tipo: 'general'` violaban el CHECK | hecho | cdb3d86 |
| C3 | Proyectos al vuelo con `estado: 'ACTIVO'` | hecho | cdb3d86 |
| C4 | `sync_queue.clear()` ciego al arrancar | hecho | 5ecb299 |
| C5 | El logout borraba la cola de sync | hecho | 5ecb299 |
| C6 | Saldos incrementales: derivan entre dispositivos (last-write-wins, SYNC-9) | en curso: una regla y un escritor; derivarlo es la Fase 4 | 67350d7 |
| C7 | Transferencia sin caja destino hacía desaparecer dinero | hecho | cdb3d86 |
| C8 | Borrar maestros sin revisar referencias | hecho (avisa; no bloquea) | cdb3d86 |
| C9 | NIT convertido a número | hecho | cdb3d86 |
| C10 | Campos que se perdían en el pull | hecho | cdb3d86 |
| C11 | `=== 0` sobre flotantes | hecho | cdb3d86 |
| C12 | StrictMode duplicaba el seeding de categorías | hecho | cdb3d86 |
| C13 | Cambiar el nombre re-inicializaba la base | hecho | cdb3d86 |
| C14 | Errores permanentes de sync se descartaban sin avisar | hecho: bandeja `sync_errores` visible (Dexie v6) | rama UI |
| C15 | Borrar/editar un préstamo o abono no actualiza la deuda | parcial: se bloquea fuera de Deudas (`movimientoDeDeuda.js`); Deudas anula el último abono; falta `deuda_id` en `transacciones` | rama UI |
| C16 | Bucket `soportes` público | pendiente: plan en `docs/SEGURIDAD.md` | |
| C17 | Transacciones con categoría ya perdida | descartado (se muestra "Sin categoría") | |
| C18 | Movimiento con monto 0 | hecho | 3562a45 |
| C19 | Saldo o monto guardado como string se concatenaba | hecho | 67350d7 |
| C20 | Paneles de deudas marcan `sincronizado: true` sin subir | hecho | rama UI |
| C21 | Editar un movimiento no lo marca `sincronizado: false` | hecho | rama UI |
| C22 | Escrituras no atómicas (saldo y transacción a medias) | hecho para movimientos (unidad de trabajo, ADR-005) y deudas (`db.transaction`) | rama UI |
| C23 | `recalculateCajaBalances()` pondría a 0 los saldos iniciales | pendiente (Fase 4) | |
| C24 | Pull limitado a 1000 filas por tabla y no atómico (SYNC-2, REP-1) | hecho | rama UI |
| C25 | HTTP 409 tomado como "ya existe": FK y UNIQUE se borraban de la cola (SYNC-1) | hecho | rama UI |
| C26 | Sin sesión, UPDATE/DELETE "subían" con 0 filas (SYNC-3) | hecho | rama UI |
| C27 | Fechas en UTC: de noche se registraba con fecha de mañana (MOV-1, DEU-11, REP-16) | hecho (`domain/value-objects/fecha.js`) | rama UI |
| C28 | Sin señal tras una hora, la app pedía login y no dejaba trabajar (SYNC-6) | hecho (sesión sin conexión) | rama UI |
| C29 | Abono de deuda pisa abonos de otro dispositivo (DEU-3) | parcial: UPDATE solo con campos que cambian; falta RPC o tabla de abonos | |
| C30 | Movimiento de deuda "Pago Préstamo" creado a mano antes del cambio queda bloqueado (no se edita en Inicio y Deudas no lo conoce) | pendiente: decidir con datos reales | |

## Móvil y responsive

| ID | Descripción | Estado | Commit |
|---|---|---|---|
| M1–M6 | Ver commit | hecho | 287fcfb |
| M7 | Dropdown de AutocompleteInput se recorta | hecho (posición fija calculada) | rama UI |
| M8 | Modales con teclado abierto | hecho (`modal-sheet`, 92dvh, `interactive-widget`) | rama UI |

## Calidad de código

| ID | Descripción | Estado |
|---|---|---|
| Q1 | `useAuth` exportado junto al Provider rompía Fast Refresh | hecho (`context/useAuth.js`) |
| Q2 | Formato de dinero copiado en 8 componentes | hecho (`presentation/formato.js`) |
| Q3 | `ReportsPanel.jsx` de 1800 líneas | hecho (`src/presentation/reportes/`) |
| Q4 | `.find()` dentro de loops en Reportes | hecho (índices en `useDatosReportes`) |
| Q5 | Bundle de 2,8 MB sin code-splitting | hecho: 650 KB iniciales; reportes, AG-Grid, PDF y Excel diferidos |
| Q6 | Sin tests | hecho: ~470 tests |
| Q7 | `alert()` y `confirm()` nativos | hecho |
| Q8 | Funciones deprecadas de syncService sin llamadores | pendiente (eliminar en porción 7) |
| Q9 | Reglas de transferencia duplicadas | hecho (`validarMovimiento`) |
| Q10 | Subagentes sin navegador | hecho |
| Q11 | Chunk de la tabla dinámica de 1,2 MB por `AllCommunityModule` | pendiente: registrar solo los módulos usados |
| Q12 | Validación de maestros vive en `AdminPanel`; operaciones de deudas en `components/deudas/` | pendiente: mover a `src/application/` con puertos |

## UI (Fase 5)

| ID | Descripción | Estado |
|---|---|---|
| U1 | Emojis en toasts y mensajes | hecho |
| U2 | Gradientes y glassmorphism | hecho |
| U3 | Solo tema oscuro | hecho: tema día (por defecto) y noche |
| U4 | `style={{}}` con `rgba()` sueltos | hecho (tokens) |
| U5 | Jerarquía plana | hecho (franjas, libros, títulos) |
| U6 | Flechas unicode | hecho |

## Seguridad

| ID | Descripción | Estado |
|---|---|---|
| S1 | Registro público de Supabase Auth activo (ADM-1) | requiere acción manual (`docs/SEGURIDAD.md`) |
| S2 | Vistas sin RLS legibles con la anon key (ADM-2) | hecho: migración 003 (requiere ejecutarla) |
| S3 | Sin roles: cualquier usuario borra maestros (ADM-11) | pendiente: plan en `docs/SEGURIDAD.md` |
| S4 | `xlsx` 0.18.5 con CVE (solo se escribe, no se lee) | aceptado; documentado |

## Entornos

| ID | Descripción | Estado |
|---|---|---|
| E1 | Separar desarrollo y producción con candado | hecho |
| E2 | Datos de prueba en volumen | hecho (Configuración > Entorno de pruebas) |
| E3 | `appId` distinto por entorno para tener las dos APK | pendiente (`android/` no está versionado) |
| E4 | Migraciones con Supabase CLI | pendiente |
| E5 | `vite.config.js` se niega a arrancar si pruebas apunta a producción | hecho |
| E6 | `npm run configurar:pruebas` | hecho |
| E7 | Modo local sin Supabase | hecho |
| E8 | La build de producción falla si no tiene credenciales | hecho |
| E9 | Cuenta de pruebas como esquema `pruebas` dentro del proyecto real (plan gratuito limitado a 2 proyectos) | hecho (requiere acción manual) |
| E10 | Fotos de soporte de pruebas en la carpeta `pruebas/` del bucket compartido | hecho |
