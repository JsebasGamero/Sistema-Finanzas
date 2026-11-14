# Módulo de reportes

Los reportes son la parte de la app donde más tiempo pasa la persona que
administra: ahí cuadra cajas, revisa cuánto lleva gastado cada obra y cuánto
se debe a cada proveedor. Este documento describe cómo está armado.

## Estructura

```
src/application/reportes/        lógica pura (sin React ni Dexie), con tests
  conjuntos.js                   definición de cada conjunto de datos: columnas, tipos, filas enriquecidas
  dimensiones.js                 por qué se puede agrupar (campos de texto y derivados de fecha)
  resumen.js                     motor de tabla dinámica (agrupar, pivotar, agregar, porcentajes)
  filtros.js                     búsqueda, rango de fechas, filtros por valor
  indicadores.js                 cifras de la franja superior de cada conjunto
  vistas.js                      vistas predefinidas y validación de vistas guardadas
  exportacion.js                 tabla exportable, celdas de Excel, CSV y nombre de archivo (puro)
src/presentation/reportes/
  useDatosReportes.js            carga todas las tablas con liveQuery + índices por id
  ReportesPanel.jsx              pestañas de reportes
  resumen/                       tablero con gráficas
  tabla/                         explorador configurable sobre AG-Grid
  (movimientos, proyectos, proveedores, cajas, deudas)
```

Reglas que aplican a todo el módulo:

- Fechas con `src/domain/value-objects/fecha.js`; formato con
  `src/presentation/formato.js`; dinero con `aMonto()` antes de sumar (un
  monto guardado como string concatenaba en vez de sumar).
- Categorías con `nombreCategoria()` de `useDatosReportes` (invariante 5).
- Nombres por id con los índices (`nombreCaja(id)`), nunca `.find()` en bucles.
- Un `INGRESO` entra a `caja_origen_id`; un `EGRESO` sale de
  `caja_origen_id`; una `TRANSFERENCIA` sale de origen y entra a destino
  (`domain/rules/efectoEnSaldos.js`). Las transferencias no son gasto ni
  ingreso de la empresa: no se suman a ingresos ni egresos.

## Tabla dinámica (explorador)

AG-Grid Community no trae agrupación, pivote ni panel de columnas (son de la
edición Enterprise). Se implementan aquí:

| Función | Cómo |
|---|---|
| Elegir conjunto | Movimientos, Cajas, Obras, Proveedores, Deudas a terceros, Préstamos entre cajas, Empresas, Categorías |
| Modo detalle | Una fila por registro. Filtros por columna, orden, mover y fijar columnas, fila de totales fija abajo que respeta los filtros, selección de filas con suma de lo seleccionado |
| Modo resumen | Agrupar filas por 1 o 2 dimensiones, columnas por una dimensión opcional (p. ej. mes), un valor (suma, conteo, promedio, mínimo, máximo de un campo numérico), mostrar como valor o % del total / fila / columna, mapa de calor, gráfica de barras del resultado |
| Columnas | Panel para mostrar/ocultar, reordenar y fijar |
| Periodo | Presets (este mes, mes anterior, este año...) o rango manual, sobre el campo de fecha del conjunto |
| Búsqueda | Texto libre sobre todas las columnas visibles |
| Vistas | Guardar la configuración con nombre (en este dispositivo), vistas predefinidas, restaurar la última usada |
| Exportar | Excel (con fila de totales y formato numérico real), CSV y PDF de exactamente lo que se ve |
| Pantalla completa y densidad | Compacta / normal / amplia |

La última configuración de cada conjunto se recuerda en
`finanzasobra.reportes.explorador.v1`. Las vistas guardadas viven en
`localStorage` (`finanzasobra.reportes.vistas.v1`):
son preferencias del dispositivo, no datos del negocio, y no necesitan
sincronizarse.

## Decisiones de cálculo

- **Pagado a un proveedor** = EGRESOS con ese tercero, incluidos los abonos
  ("Pago Deuda"). No se suman además los `pagos` guardados en la deuda: cada
  peso cuenta una vez. Hay columnas aparte para pagos directos y abonos.
- **Empresa de un movimiento:** `transacciones` no tiene `empresa_id`
  confiable; se toma la de la obra y, si no hay obra, la de la caja de origen.
- **Ejecución de obra** = gastado / presupuesto; vacío si la obra no tiene
  presupuesto. En el tablero, "ejecutado" es el acumulado hasta el fin del
  periodo (el presupuesto es de toda la obra).
- **Filtros de columna** de la grilla también se aplican en modo resumen, para
  que detalle y resumen cuadren.
- **CSV:** separador `;` y BOM UTF-8 (Excel en español); los textos que empiezan
  con `= + - @` se exportan con apóstrofo para que Excel no los ejecute.
- **Soportes:** en exportaciones solo sale Sí/No, nunca la URL (el bucket
  todavía es público, C16).
