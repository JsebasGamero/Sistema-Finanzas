---
name: auditar-pantalla
description: Checklist para auditar una pantalla o componente de FinanzasObra - bugs de datos y dinero, sync, responsive en táctil, accesibilidad, rendimiento y señales de interfaz genérica. Produce hallazgos con archivo y línea listos para el backlog. Úsalo cuando pidan revisar, auditar o encontrar bugs en una parte de la app.
---

# Auditar una pantalla

Lee el componente completo y todo lo que importa. No audites de memoria ni
por el nombre del archivo.

## 1. Datos y dinero

- [ ] ¿Qué tablas lee y escribe? ¿Escribe Dexie directamente?
- [ ] Cada escritura: ¿se encola en `sync_queue`?
- [ ] Cada literal escrito: ¿cumple los CHECK de `supabase_setup.sql`?
- [ ] Cada campo escrito: ¿existe como columna y está en la whitelist de
      `prepareForSupabase()`?
- [ ] ¿Ajusta saldos? ¿Coincide con la tabla de `docs/DOMINIO.md`? ¿Revierte
      bien al editar o borrar?
- [ ] ¿Compara dinero con `===`?
- [ ] ¿Muestra IDs crudos cuando no encuentra un nombre?
- [ ] Fechas: ¿`new Date('YYYY-MM-DD')` (corre el día en Colombia)?

## 2. Estados de la pantalla

- [ ] Cargando, vacío, error: ¿los tres existen y se ven bien?
- [ ] ¿Qué pasa sin conexión?
- [ ] ¿Qué pasa si una referencia (caja, proyecto) fue borrada?
- [ ] Validaciones: ¿se pueden guardar datos inválidos?
- [ ] ¿Usa `alert()` o `confirm()` nativos?

## 3. Responsive y táctil

- [ ] ¿Algo solo aparece con hover?
- [ ] ¿Cabe a 320px sin desborde horizontal?
- [ ] ¿Grids de dos o más columnas sin breakpoint?
- [ ] Modales: ¿tienen altura máxima y scroll?
- [ ] Objetivos táctiles: ¿44px mínimo?
- [ ] Inputs: ¿16px en móvil?

## 4. Accesibilidad

- [ ] Inputs con label asociado.
- [ ] Botones de solo icono con `aria-label`.
- [ ] Contraste del texto secundario.
- [ ] ¿Se puede usar con teclado (modales, dropdowns)?

## 5. React y rendimiento

- [ ] `setState` en efectos que corren en cada render.
- [ ] Dependencias de efectos que son objetos o arrays recreados.
- [ ] Búsquedas `.find()` dentro de loops sobre listas grandes.
- [ ] Listas sin límite ni virtualización.

## 6. Señales de interfaz genérica

- [ ] Emojis en la UI o en mensajes.
- [ ] Gradientes o `backdrop-filter` sin motivo.
- [ ] Icono en cuadrito de color en cada título.
- [ ] `rgba()` sueltos en `style={{}}` en vez de tokens.
- [ ] Flechas unicode en vez de iconos.
- [ ] Textos repetidos o inflados.

## Formato del hallazgo

```markdown
| ID propuesto | Severidad | Archivo:línea | Qué pasa | Escenario concreto |
```

Severidad: **crítico** (pierde o corrompe datos, expone la base), **alto**
(funcionalidad rota para un grupo de usuarios, p. ej. todos los móviles),
**medio**, **bajo**.

Solo lo que puedas sostener leyendo el código. Lo dudoso, márcalo "a
verificar". Al final, propón qué agente arregla cada hallazgo.
