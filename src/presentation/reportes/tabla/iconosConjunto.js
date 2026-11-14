import { ArrowLeftRight, Building2, HandCoins, HardHat, Receipt, Tags, Truck, Wallet, Database } from 'lucide-react';

/** Icono de cada conjunto de datos del explorador. */
export const ICONOS_CONJUNTO = Object.freeze({
    movimientos: Receipt,
    cajas: Wallet,
    obras: HardHat,
    proveedores: Truck,
    deudas_terceros: HandCoins,
    prestamos_cajas: ArrowLeftRight,
    empresas: Building2,
    categorias: Tags,
});

export function iconoDeConjunto(id) {
    return ICONOS_CONJUNTO[id] ?? Database;
}
