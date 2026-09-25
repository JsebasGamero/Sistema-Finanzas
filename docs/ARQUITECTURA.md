# Arquitectura

## Estado actual

```
src/
├─ App.jsx                 navegación por pestañas (sin router), arranque y sync
├─ context/AuthContext.jsx sesión de Supabase Auth
├─ components/             pantallas y piezas de UI, con lógica de negocio adentro
├─ hooks/                  useOnlineStatus, useToast
└─ services/
   ├─ db.js                esquema Dexie + pull desde Supabase (clear + replace)
   ├─ syncService.js       cola de sync + algunas operaciones de dominio
   ├─ supabase.js          cliente
   ├─ categorias.js        resolver de nombres de categoría
   └─ dinero.js            aritmética y estados de deuda
```

**El problema central:** los componentes leen y escriben Dexie directamente y
encolan operaciones de sync por su cuenta. La regla "un egreso resta del
saldo" está copiada en cinco componentes, cada uno con su variante. No hay un
lugar único donde viva el negocio, y por eso los saldos derivan.

Pantallas y dónde está su lógica:

| Pantalla | Componente | Lógica de negocio que contiene hoy |
|---|---|---|
| Inicio | `ProjectDashboard.jsx` | totales, edición y borrado de movimientos con ajuste de saldos |
| Nueva | `TransactionForm.jsx` | alta de movimientos, alta al vuelo de cajas/proyectos/terceros/categorías, subida de soportes |
| Nueva → Deudas | `DeudaCajasPanel.jsx`, `DeudaTercerosPanel.jsx` | préstamos, abonos, transacciones derivadas y ajuste de saldos |
| Cajas | `CajaList.jsx` | solo lectura |
| Config | `AdminPanel.jsx` | CRUD genérico de maestros |
| Reportes | `ReportsPanel.jsx` (1800 líneas), `TablaReport.jsx` | agregaciones, gráficos, exportación PDF/Excel/CSV |

## Arquitectura objetivo

Clean Architecture en cuatro capas. **Regla de dependencia: las flechas solo
apuntan hacia adentro.** El dominio no sabe que existen React, Dexie ni
Supabase.

```
presentation  ──►  application  ──►  domain
     │                  ▲
     └──► infrastructure ┘   (implementa los puertos del dominio)
```

```
src/
├─ domain/                      JavaScript puro. Sin imports de librerías.
│  ├─ entities/                 Transaccion, Caja, DeudaCaja, DeudaTercero, Proyecto...
│  ├─ value-objects/            Dinero (entero), TipoMovimiento, EstadoDeuda, Fecha
│  ├─ rules/                    efectoEnSaldos(), calcularSaldo(), aplicarAbono(),
│  │                            validarTransferencia()
│  └─ ports/                    contratos: TransaccionRepository, CajaRepository,
│                               Outbox, Clock, IdGenerator
│
├─ application/                 Casos de uso. Orquestan dominio + puertos.
│  └─ use-cases/                registrarMovimiento, editarMovimiento, borrarMovimiento,
│                               crearPrestamoEntreCajas, abonarDeuda, sincronizar,
│                               obtenerResumenDashboard...
│
├─ infrastructure/
│  ├─ dexie/                    esquema + repositorios locales
│  ├─ supabase/                 cliente, repositorios remotos, mapeadores fila ↔ entidad
│  ├─ sync/                     outbox, pull, reconciliación
│  └─ storage/                  subida de soportes
│
├─ presentation/
│  ├─ pages/                    una por pestaña
│  ├─ features/                 formularios y paneles con estado propio
│  ├─ ui/                       Button, Card, Modal, Input, MoneyInput, Money, Table...
│  └─ hooks/                    useMovimientos(), useSaldos(): llaman casos de uso
│
└─ app/                         composición: instancia repositorios e inyecta
                                dependencias en los casos de uso
```

### Qué gana el proyecto

- Un único `efectoEnSaldos(movimiento)` en el dominio sustituye las cinco
  copias actuales. Se prueba con tests unitarios sin navegador.
- El saldo pasa a ser `calcularSaldo(caja, movimientos)`: no puede derivar.
- Los componentes quedan en presentación: renderizan y llaman casos de uso.
- Cambiar Dexie o Supabase solo toca `infrastructure/`.

## Cómo migrar (sin big bang)

Patrón estrangulador, por **porciones verticales**. Cada porción es un PR que
deja la app funcionando.

1. **Andamiaje.** Crear las carpetas, agregar Vitest, crear `Dinero` y
   `efectoEnSaldos()` con tests. No se toca UI.
2. **Movimientos.** Repositorio Dexie de transacciones + casos de uso
   registrar/editar/borrar. `TransactionForm` y `ProjectDashboard` pasan a
   usarlos. Se borran las copias locales de la lógica de saldos.
3. **Deudas.** Casos de uso de préstamo y abono. Migran los dos paneles.
4. **Saldo derivado** (Fase 4 del backlog).
5. **Maestros.** `AdminPanel` sobre repositorios.
6. **Reportes.** Consultas de lectura en `application/`; `ReportsPanel` se
   parte en una página por reporte.
7. **Sync.** El outbox pasa a `infrastructure/sync/` con reintentos y bandeja
   de errores visible.

Regla durante la migración: **código nuevo va en la estructura nueva**; el
código viejo solo se toca para moverlo o para arreglar un bug.

## Decisiones

Ver `docs/decisiones/`.
