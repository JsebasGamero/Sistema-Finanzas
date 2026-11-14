#!/usr/bin/env node
// Configura la cuenta de PRUEBAS sin tocar los datos de producción.
//
// Dos formas:
//
//   1) Esquema de pruebas dentro del proyecto de producción (cuando el plan
//      gratuito no deja crear otro proyecto):
//        npm run configurar:pruebas -- --esquema pruebas
//      Toma la URL y la key de .env.production.local (o de --url / --key) y
//      agrega VITE_SUPABASE_SCHEMA=pruebas. Requiere haber corrido
//      supabase/esquema_pruebas.sql y habilitado el esquema en Supabase.
//
//   2) Otro proyecto de Supabase:
//        npm run configurar:pruebas -- --url https://xxxx.supabase.co --key <anon key>
//      Se niega si la URL o la key son las de producción.
//
// Escribe .env.development.local, que es el archivo que usa `npm run dev`, y
// no pisa un archivo existente salvo con --forzar.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { contenidoEnvPruebas, leerArgumentos, parsearEnv, validarProyectoDePruebas } from './entornoPruebas.js';

const raiz = process.cwd();
const destino = resolve(raiz, '.env.development.local');

// .env.production.local vive en la carpeta principal del repo. En un
// worktree de git (otra carpeta con otra rama) no existe, y el script decía
// "falta --url" aunque el archivo estaba a dos carpetas. Se busca primero
// aquí y, si no está, en la carpeta principal del repositorio.
function buscarEnvProduccion() {
    const local = resolve(raiz, '.env.production.local');
    if (existsSync(local)) return local;
    try {
        const gitComun = execSync('git rev-parse --path-format=absolute --git-common-dir', {
            cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const principal = resolve(dirname(gitComun), '.env.production.local');
        if (existsSync(principal)) return principal;
    } catch {
        // Sin git o fuera de un repo: solo cuenta el archivo local.
    }
    return local;
}
const produccion = buscarEnvProduccion();

const args = leerArgumentos(process.argv.slice(2));

if (args.ayuda || args.help) {
    console.log(`
Forma 1, esquema de pruebas en el MISMO proyecto (plan gratuito sin más proyectos):

  npm run configurar:pruebas -- --esquema pruebas [--forzar]

  Antes, una sola vez, en el proyecto de producción de Supabase:
    1. SQL Editor: ejecuta supabase/esquema_pruebas.sql (solo crea el esquema
       "pruebas"; no toca las tablas reales).
    2. Project Settings > Data API > Exposed schemas: agrega "pruebas" > Save.
  Usa la URL y la key de .env.production.local (o pásalas con --url y --key).

Forma 2, otro proyecto de Supabase:

  npm run configurar:pruebas -- --url https://<proyecto>.supabase.co --key <anon key> [--forzar]

  Antes: New project, SQL Editor > supabase_setup.sql, Add user, y copiar
  Project URL y anon public key de Settings > API.

Más detalle en docs/ENTORNOS.md.
`);
    process.exit(0);
}

const envProduccion = existsSync(produccion) ? parsearEnv(readFileSync(produccion, 'utf8')) : {};
// En PowerShell, `npm run configurar:pruebas -- --esquema pruebas` pierde el
// `--` y npm se queda con --esquema: al script solo le llega "pruebas". Por
// eso existe `npm run configurar:pruebas:esquema`, y por eso un nombre suelto
// sin --url/--key se toma como esquema.
const posicional = args._?.[0];
const esquema = args.esquema ?? (posicional && !args.url && !args.key ? posicional : undefined);
const conEsquema = typeof esquema === 'string' && esquema.trim() !== '';

// Con esquema, lo normal es usar el mismo proyecto de producción: si no se
// pasan --url / --key, se toman de .env.production.local.
const url = args.url ?? (conEsquema ? envProduccion.VITE_SUPABASE_URL : undefined);
const key = args.key ?? (conEsquema ? envProduccion.VITE_SUPABASE_ANON_KEY : undefined);

const errores = validarProyectoDePruebas({
    url,
    key,
    urlProduccion: envProduccion.VITE_SUPABASE_URL,
    keyProduccion: envProduccion.VITE_SUPABASE_ANON_KEY,
    esquema,
});

if (conEsquema && (!url || !key) && !existsSync(produccion)) {
    errores.push('No encontré .env.production.local para tomar la URL y la key: pásalas con --url y --key.');
}

if (errores.length > 0) {
    console.error('\nNo se configuró la cuenta de pruebas:\n');
    for (const e of errores) console.error(`  - ${e}`);
    console.error('\nAyuda: npm run configurar:pruebas -- --ayuda\n');
    process.exit(1);
}

if (existsSync(destino) && !args.forzar) {
    console.error('\nYa existe .env.development.local. Para reemplazarlo agrega --forzar.\n');
    process.exit(1);
}

writeFileSync(destino, contenidoEnvPruebas({ url, key, esquema: conEsquema ? esquema.trim() : undefined }), 'utf8');
if (conEsquema) {
    console.log(`\nListo: .env.development.local usa el esquema "${esquema.trim()}" del proyecto de producción.`);
    console.log('Arranca con `npm run dev`: la franja morada dirá "esquema ' + esquema.trim() + '".');
    console.log('Si la app no carga datos, revisa que el esquema esté en Data API > Exposed schemas.\n');
} else {
    console.log('\nListo: .env.development.local apunta al proyecto de pruebas.');
    console.log('Arranca con `npm run dev`: verás la franja morada "DESARROLLO".\n');
}
