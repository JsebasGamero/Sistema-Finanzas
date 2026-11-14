// Utilidades de dinero.
//
// La implementación vive ahora en `src/domain/value-objects/dinero.js` (capa
// de dominio, sin dependencias de librerías). Este archivo se mantiene como
// re-export porque varios componentes ya lo importan desde `services/`.
export * from '../domain/value-objects/dinero';
