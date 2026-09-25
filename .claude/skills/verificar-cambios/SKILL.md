---
name: verificar-cambios
description: Checklist para verificar un cambio de FinanzasObra antes de commitear - build, lint contra la línea base, tests, y comprobación en el navegador integrado a 320, 768 y 1280 px. Incluye qué no se puede verificar sin iniciar sesión y cómo reportarlo. Úsalo al terminar cualquier cambio de código.
---

# Verificar cambios

## 1. Build

```bash
npm run build
```

Debe terminar en `✓ built`. La advertencia de chunk > 500 kB es conocida
(Q5 en el backlog); no es un fallo.

## 2. Lint contra la línea base

```bash
npm run lint
```

Línea base actual: **1 error** (Q1, `react-refresh/only-export-components` en
`AuthContext.jsx`) y advertencias de `exhaustive-deps`. Un error nuevo es
fallo. Si cerraste Q1, actualiza esta línea base.

## 3. Tests

Si existe Vitest en `package.json`:

```bash
npx vitest run
```

## 4. Navegador

Arranca el servidor con la configuración `rsistema-dev` de
`.claude/launch.json` (herramienta `preview_start`).

Sin iniciar sesión se puede comprobar:

- La app carga sin errores en consola (`read_console_messages` con `onlyErrors`).
- El login a **320×568**: sin desborde horizontal
  (`document.documentElement.scrollWidth === innerWidth`).
- El login en landscape **640×300**: se puede hacer scroll hasta el último botón.
- Cualquier componente que se pueda renderizar fuera de la sesión.

Tamaños a probar: 320 (teléfono pequeño), 768 (tablet), 1280 (escritorio).
Al terminar, restaura con el preset `desktop` y detén el servidor.

## 5. Lo que no se puede verificar

**No se inicia sesión con credenciales reales.** Todo lo que está detrás del
login lo prueba una persona. Escribe para cada flujo afectado:

```markdown
1. <pantalla>: <acción concreta> → <resultado esperado>
```

Ejemplo:

```markdown
1. Nueva → Transferencia: dejar vacía la caja destino y guardar → aparece
   "Una transferencia necesita caja destino" y no se registra nada.
```

## 6. Reporte

- Qué comandos corriste y su resultado.
- Qué comprobaste en el navegador y a qué anchos.
- La lista de flujos a probar por una persona.

Nunca digas "funciona" sobre algo que no viste funcionar.
